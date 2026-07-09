-- Migration 152 — bonus-team "exact focus pick" (EPL), tournament-guardrailed
--
-- Problem: WC's fav_team_2x (double base result pts when your bonus team plays) is too
-- easy over a 38-week league — you just back Man City every week. And full-scoreline
-- prediction on all 10 matches is expert-only.
--
-- EPL model: base game is H/D/A on all matches (accessible), and the bonus team is a
-- single "focus pick" where you also enter the EXACT score — bonus points only if you
-- nail it. Rewards skill, not backing the favourite.
--
-- Guardrail: a NEW tournament-level switch `fav_exact_focus`. The bonus fires only when
-- BOTH the tournament opts in AND the round sets an amount — so WC (switch = false) can
-- never trigger it, even if a round's amount were set by mistake. WC's fav_team_2x
-- branch is left byte-for-byte identical → provably zero WC impact. Additive only; no
-- historical rescore (WC results unchanged, EPL has none and is still enrollment-gated).

-- ── 1. New columns ────────────────────────────────────────────────────────────
ALTER TABLE public.tournaments
  ADD COLUMN IF NOT EXISTS fav_exact_focus boolean NOT NULL DEFAULT false;

ALTER TABLE public.tournament_rounds
  ADD COLUMN IF NOT EXISTS fav_exact_bonus int NOT NULL DEFAULT 0;

-- ── 2. Config: turn it on for EPL only ───────────────────────────────────────
UPDATE public.tournaments
  SET fav_exact_focus = true
  WHERE slug = 'epl-2026-27';

-- EPL weekly game becomes H/D/A base + exact focus pick on the bonus team.
-- predict_mode='outcome' (H/D/A floor); fav_team_2x off (no easy doubling);
-- exact/margin bonuses off (they only apply to score-mode general prediction);
-- fav_exact_bonus=3 is the reward for nailing the bonus team's exact score.
UPDATE public.tournament_rounds
  SET predict_mode    = 'outcome',
      fav_team_2x     = false,
      exact_bonus     = 0,
      margin_bonus    = 0,
      fav_exact_bonus = 3
  WHERE tournament_id = (SELECT id FROM public.tournaments WHERE slug = 'epl-2026-27');

-- ── 3. Scoring trigger (fixture result → score predictions) ──────────────────
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

      -- fav team EXACT focus bonus (EPL): tournament opts in, the round sets an amount,
      -- the tipster made an exact focus pick on their bonus team's match, and nailed it.
      -- Double-gated on v_focus so WC can never trigger it.
      CASE
        WHEN v_focus
          AND rc.fav_exact_bonus > 0
          AND p.home IS NOT NULL AND p.away IS NOT NULL
          AND p.home = NEW.home_score
          AND p.away = NEW.away_score
          AND EXISTS (
            SELECT 1 FROM public.user_tournaments ut
            WHERE ut.user_id       = p.user_id
              AND ut.tournament_id = NEW.tournament_id
              AND ut.favourite_team IN (NEW.home, NEW.away)
          )
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
          AND EXISTS (
            SELECT 1 FROM public.user_tournaments ut
            WHERE ut.user_id       = NEW.user_id
              AND ut.tournament_id = NEW.tournament_id
              AND ut.favourite_team IN (fx.home, fx.away)
          )
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

SELECT 'Migration 152 complete — fav_exact_focus guardrail + EPL exact focus-pick bonus; WC scoring unchanged' AS status;
