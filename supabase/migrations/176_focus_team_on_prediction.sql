-- Migration 176 — record the focus-pick club on the prediction, and score the EPL exact-focus
-- bonus from it (instead of the live, mutable user_tournaments.favourite_team).
--
-- Why: the exact-focus bonus was awarded by the scoring trigger reading the favourite LIVE at
-- scoring time. That (a) left no audit trail of which club was the focus for a given round, and
-- (b) meant a result CORRECTION after a player changed their club could strip a bonus they
-- legitimately earned (their old focus club is no longer the favourite). Recording the club on
-- the focus pick fixes both and decouples the bonus from the mutable global.
--
-- WC's fav_team_2x path is left byte-for-byte identical (it still reads user_tournaments) —
-- provably zero WC impact. The change is double-gated on v_focus (fav_exact_focus), false for WC.

-- ── 1. Column ─────────────────────────────────────────────────────────────────
-- Nullable: only focus picks carry a club; ordinary H/D/A taps and WC scorelines stay NULL.
-- Table-level grants (migration 110) already cover new columns — no extra GRANT needed.
ALTER TABLE public.predictions
  ADD COLUMN IF NOT EXISTS focus_team text;

-- ── 2. Backfill existing focus picks (EPL only) ───────────────────────────────
-- A focus pick is a scoreline (outcome IS NULL) on a fav_exact_focus tournament. Best-effort:
-- use the player's CURRENT favourite when it still matches the fixture's teams. Historical
-- picks whose favourite has since changed can't be perfectly reconstructed and stay NULL
-- (acceptable: EPL is pre-season, so the only data is warm-up practice with unchanged favourites).
-- NB: in UPDATE ... FROM the target table (p) can't be referenced inside a JOIN's ON clause,
-- so the ut → p link (ut.user_id = p.user_id) lives in WHERE, not the join.
UPDATE public.predictions p
SET focus_team = ut.favourite_team
FROM public.fixtures f
JOIN public.tournaments t
  ON t.id = f.tournament_id AND t.fav_exact_focus = true
JOIN public.user_tournaments ut
  ON ut.tournament_id = f.tournament_id
WHERE p.fixture_id = f.id
  AND ut.user_id = p.user_id
  AND p.outcome IS NULL
  AND p.focus_team IS NULL
  AND ut.favourite_team IS NOT NULL
  AND ut.favourite_team IN (f.home, f.away);

-- ── 3. Scoring trigger (fixture result → score predictions) ──────────────────
-- Identical to migration 152 EXCEPT the fav_exact_e branch now reads p.focus_team.
CREATE OR REPLACE FUNCTION score_predictions_for_fixture()
RETURNS TRIGGER LANGUAGE plpgsql AS $$
DECLARE
  rc      public.tournament_rounds%ROWTYPE;
  v_focus boolean := false;
BEGIN
  SELECT * INTO rc
  FROM public.tournament_rounds
  WHERE tournament_id = NEW.tournament_id
    AND round_code    = NEW.round::text
  LIMIT 1;

  IF NOT FOUND THEN
    UPDATE public.predictions
    SET standard_points = 0,
        bonus_points    = 0,
        points_earned   = 0,
        updated_at      = now()
    WHERE fixture_id = NEW.id;
    RETURN NEW;
  END IF;

  -- Tournament-level guardrail for the exact focus-pick bonus (false for WC).
  SELECT COALESCE(fav_exact_focus, false) INTO v_focus
  FROM public.tournaments WHERE id = NEW.tournament_id;

  WITH scored AS (
    SELECT
      p.id,

      -- standard: result_pts when correct result (H/D/A), else 0
      CASE
        WHEN rc.predict_mode = 'score' THEN
          CASE WHEN
            (CASE WHEN p.home  > p.away  THEN 'H' WHEN p.away  > p.home  THEN 'A' ELSE 'D' END)
          = (CASE WHEN NEW.home_score > NEW.away_score THEN 'H' WHEN NEW.away_score > NEW.home_score THEN 'A' ELSE 'D' END)
          THEN rc.result_pts ELSE 0 END
        ELSE
          -- outcome mode: use the tapped H/D/A. For an EPL focus pick the tipster
          -- entered a scoreline instead (outcome null) — derive H/D/A from it so the
          -- base result points still apply. v_focus-gated → WC path unchanged.
          CASE WHEN COALESCE(
            p.outcome,
            CASE WHEN v_focus AND p.home IS NOT NULL AND p.away IS NOT NULL
                 THEN (CASE WHEN p.home > p.away THEN 'H' WHEN p.away > p.home THEN 'A' ELSE 'D' END)
                 ELSE NULL END
          ) = NEW.result_outcome THEN rc.result_pts ELSE 0 END
      END AS std,

      -- exact score bonus (score rounds only, exact scoreline)
      CASE
        WHEN rc.predict_mode = 'score'
          AND rc.exact_bonus > 0
          AND p.home = NEW.home_score
          AND p.away = NEW.away_score
        THEN rc.exact_bonus ELSE 0
      END AS exact_e,

      -- margin bonus (score rounds only: correct result, not exact, same goal diff)
      CASE
        WHEN rc.predict_mode = 'score'
          AND rc.margin_bonus > 0
          AND p.home IS NOT NULL AND p.away IS NOT NULL
          AND NOT (p.home = NEW.home_score AND p.away = NEW.away_score)
          AND (CASE WHEN p.home  > p.away  THEN 'H' WHEN p.away  > p.home  THEN 'A' ELSE 'D' END)
            = (CASE WHEN NEW.home_score > NEW.away_score THEN 'H' WHEN NEW.away_score > NEW.home_score THEN 'A' ELSE 'D' END)
          AND ABS(p.home - p.away) = ABS(NEW.home_score - NEW.away_score)
        THEN rc.margin_bonus ELSE 0
      END AS margin_e,

      -- pen winner bonus
      CASE
        WHEN rc.pen_bonus > 0
          AND NEW.pen_winner IS NOT NULL
          AND p.pen_winner = NEW.pen_winner
          AND (
            (rc.predict_mode = 'score'
              AND NEW.home_score = NEW.away_score
              AND (CASE WHEN p.home > p.away THEN 'H' WHEN p.away > p.home THEN 'A' ELSE 'D' END)
                = (CASE WHEN NEW.home_score > NEW.away_score THEN 'H' WHEN NEW.away_score > NEW.home_score THEN 'A' ELSE 'D' END))
            OR
            (rc.predict_mode = 'outcome'
              AND NEW.result_outcome = 'D'
              AND p.outcome = NEW.result_outcome)
          )
        THEN rc.pen_bonus ELSE 0
      END AS pen_e,

      -- fav team flag (WC): doubles base result pts when your bonus team plays
      CASE
        WHEN rc.fav_team_2x AND EXISTS (
          SELECT 1 FROM public.user_tournaments ut
          WHERE ut.user_id       = p.user_id
            AND ut.tournament_id = NEW.tournament_id
            AND ut.favourite_team IN (NEW.home, NEW.away)
        ) THEN true ELSE false
      END AS has_fav,

      -- fav team EXACT focus bonus (EPL): tournament opts in, the round sets an amount, and the
      -- club recorded on THIS prediction (p.focus_team, captured at pick time) nailed the exact
      -- score of its own match. Scored from the recorded club — not the live favourite — so the
      -- bonus is traceable and survives a later favourite change or result correction.
      -- Double-gated on v_focus so WC can never trigger it.
      CASE
        WHEN v_focus
          AND rc.fav_exact_bonus > 0
          AND p.home IS NOT NULL AND p.away IS NOT NULL
          AND p.home = NEW.home_score
          AND p.away = NEW.away_score
          AND p.focus_team IS NOT NULL
          AND p.focus_team IN (NEW.home, NEW.away)
        THEN rc.fav_exact_bonus ELSE 0
      END AS fav_exact_e

    FROM public.predictions p
    WHERE p.fixture_id = NEW.id
  )
  UPDATE public.predictions p
  SET
    standard_points = s.std,
    -- fav_team_2x doubles base pts only; bonuses awarded flat
    bonus_points    = CASE WHEN s.has_fav THEN s.std ELSE 0 END
                    + s.exact_e + s.margin_e + s.pen_e + s.fav_exact_e,
    points_earned   = s.std
                    + CASE WHEN s.has_fav THEN s.std ELSE 0 END
                    + s.exact_e + s.margin_e + s.pen_e + s.fav_exact_e,
    updated_at      = now()
  FROM scored s
  WHERE p.id = s.id;

  RETURN NEW;
END;
$$;

-- ── 4. Retroactive insert trigger (prediction made after result is in) ───────
-- Identical to migration 152 EXCEPT the fav_exact_e branch now reads NEW.focus_team.
CREATE OR REPLACE FUNCTION auto_score_prediction_on_insert()
RETURNS TRIGGER LANGUAGE plpgsql AS $$
DECLARE
  fx      public.fixtures%ROWTYPE;
  rc      public.tournament_rounds%ROWTYPE;
  v_focus boolean := false;
BEGIN
  SELECT * INTO fx
  FROM public.fixtures
  WHERE id = NEW.fixture_id AND home_score IS NOT NULL;

  IF NOT FOUND THEN RETURN NEW; END IF;

  SELECT * INTO rc
  FROM public.tournament_rounds
  WHERE tournament_id = NEW.tournament_id
    AND round_code    = fx.round::text
  LIMIT 1;

  IF NOT FOUND THEN RETURN NEW; END IF;

  SELECT COALESCE(fav_exact_focus, false) INTO v_focus
  FROM public.tournaments WHERE id = NEW.tournament_id;

  WITH scored AS (
    SELECT
      CASE
        WHEN rc.predict_mode = 'score' THEN
          CASE WHEN
            (CASE WHEN NEW.home  > NEW.away  THEN 'H' WHEN NEW.away  > NEW.home  THEN 'A' ELSE 'D' END)
          = (CASE WHEN fx.home_score > fx.away_score THEN 'H' WHEN fx.away_score > fx.home_score THEN 'A' ELSE 'D' END)
          THEN rc.result_pts ELSE 0 END
        ELSE
          -- outcome mode: tapped H/D/A, or derive from an EPL focus-pick scoreline.
          CASE WHEN COALESCE(
            NEW.outcome,
            CASE WHEN v_focus AND NEW.home IS NOT NULL AND NEW.away IS NOT NULL
                 THEN (CASE WHEN NEW.home > NEW.away THEN 'H' WHEN NEW.away > NEW.home THEN 'A' ELSE 'D' END)
                 ELSE NULL END
          ) = fx.result_outcome THEN rc.result_pts ELSE 0 END
      END AS std,

      CASE
        WHEN rc.predict_mode = 'score' AND rc.exact_bonus > 0
          AND NEW.home = fx.home_score AND NEW.away = fx.away_score
        THEN rc.exact_bonus ELSE 0
      END AS exact_e,

      CASE
        WHEN rc.predict_mode = 'score'
          AND rc.margin_bonus > 0
          AND NEW.home IS NOT NULL AND NEW.away IS NOT NULL
          AND NOT (NEW.home = fx.home_score AND NEW.away = fx.away_score)
          AND (CASE WHEN NEW.home  > NEW.away  THEN 'H' WHEN NEW.away  > NEW.home  THEN 'A' ELSE 'D' END)
            = (CASE WHEN fx.home_score > fx.away_score THEN 'H' WHEN fx.away_score > fx.home_score THEN 'A' ELSE 'D' END)
          AND ABS(NEW.home - NEW.away) = ABS(fx.home_score - fx.away_score)
        THEN rc.margin_bonus ELSE 0
      END AS margin_e,

      CASE
        WHEN rc.pen_bonus > 0
          AND fx.pen_winner IS NOT NULL
          AND NEW.pen_winner = fx.pen_winner
          AND (
            (rc.predict_mode = 'score'
              AND fx.home_score = fx.away_score
              AND (CASE WHEN NEW.home > NEW.away THEN 'H' WHEN NEW.away > NEW.home THEN 'A' ELSE 'D' END)
                = (CASE WHEN fx.home_score > fx.away_score THEN 'H' WHEN fx.away_score > fx.home_score THEN 'A' ELSE 'D' END))
            OR
            (rc.predict_mode = 'outcome'
              AND fx.result_outcome = 'D'
              AND NEW.outcome = fx.result_outcome)
          )
        THEN rc.pen_bonus ELSE 0
      END AS pen_e,

      CASE
        WHEN rc.fav_team_2x AND EXISTS (
          SELECT 1 FROM public.user_tournaments ut
          WHERE ut.user_id       = NEW.user_id
            AND ut.tournament_id = NEW.tournament_id
            AND ut.favourite_team IN (fx.home, fx.away)
        ) THEN true ELSE false
      END AS has_fav,

      CASE
        WHEN v_focus
          AND rc.fav_exact_bonus > 0
          AND NEW.home IS NOT NULL AND NEW.away IS NOT NULL
          AND NEW.home = fx.home_score
          AND NEW.away = fx.away_score
          AND NEW.focus_team IS NOT NULL
          AND NEW.focus_team IN (fx.home, fx.away)
        THEN rc.fav_exact_bonus ELSE 0
      END AS fav_exact_e
  )
  UPDATE public.predictions p
  SET
    standard_points = s.std,
    bonus_points    = CASE WHEN s.has_fav THEN s.std ELSE 0 END
                    + s.exact_e + s.margin_e + s.pen_e + s.fav_exact_e,
    points_earned   = s.std
                    + CASE WHEN s.has_fav THEN s.std ELSE 0 END
                    + s.exact_e + s.margin_e + s.pen_e + s.fav_exact_e,
    updated_at      = now()
  FROM scored s
  WHERE p.id = NEW.id;

  RETURN NEW;
END;
$$;

SELECT 'Migration 176 complete — focus_team recorded on predictions; EPL exact-focus bonus scored from it (WC unchanged)' AS status;
