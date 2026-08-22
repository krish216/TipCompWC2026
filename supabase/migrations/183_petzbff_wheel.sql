-- 183: petzbff_wheel — PetzBFF trade-show prize wheel (lead capture + staggered allocation)
--
-- Same reason for living on TribePicks as the quiz (182): Shopify's storefront captcha blocks
-- custom lead-capture forms. This adds a spin-to-win wheel for the show, where every spin wins
-- a physical prize from a FIXED, SHARED inventory.
--
-- Two hard requirements drive the design:
--   1) Capture the entrant's email (the lead).
--   2) Allocate a prize, staggering the scarce high-value prizes across the show day so they
--      don't all go in the first few spins, and are actually all given away.
--
-- Allocation is SERVER-AUTHORITATIVE and ATOMIC. Everyone spins against one inventory in the
-- DB, and a SECURITY DEFINER function with row locks decides the prize inside one transaction —
-- so two simultaneous spins can never over-award the last mat. The client wheel is cosmetic:
-- it animates to whatever the server allocated.
--
-- Staggering is TIME-WINDOWED. Each scarce unit (3 mats, 6 containers) gets an "unlock time"
-- spread evenly across the show window; a unit can only be won by the first spin at/after its
-- unlock. Everything else wins a bag (72) then a sweet (200); once all 281 are gone, a friendly
-- consolation. Prizes are configurable; the show window is set in petzbff_wheel_config.

-- ── Config: the show window (single row, id = true) ───────────────────────────────────────
CREATE TABLE IF NOT EXISTS public.petzbff_wheel_config (
  id             boolean     PRIMARY KEY DEFAULT true,
  show_starts_at timestamptz NOT NULL,
  show_ends_at   timestamptz NOT NULL,
  active         boolean     NOT NULL DEFAULT false,   -- gate: wheel is "open" only when true
  updated_at     timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT petzbff_wheel_config_singleton CHECK (id),
  CONSTRAINT petzbff_wheel_config_window    CHECK (show_ends_at > show_starts_at)
);

-- ── Prize types + live inventory ──────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS public.petzbff_wheel_prizes (
  id          text    PRIMARY KEY,                 -- 'mat','container','bag','sweet','none'
  label       text    NOT NULL,
  value_cents integer NOT NULL DEFAULT 0,
  total       integer NOT NULL,                    -- initial stock
  awarded     integer NOT NULL DEFAULT 0,          -- bumped atomically on each win
  sort        integer NOT NULL DEFAULT 0,          -- fill priority (lower first) + display order
  scheduled   boolean NOT NULL DEFAULT false,      -- true = released via the unlock schedule
  CONSTRAINT petzbff_wheel_prizes_stock CHECK (awarded >= 0 AND awarded <= total)
);

-- ── Scheduled releases: one row per scarce unit, with its unlock time ──────────────────────
CREATE TABLE IF NOT EXISTS public.petzbff_wheel_unlocks (
  id         uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  prize_id   text        NOT NULL REFERENCES public.petzbff_wheel_prizes(id),
  unlock_at  timestamptz NOT NULL,
  claimed_by uuid                                   -- spin id that claimed this unit
);
CREATE INDEX IF NOT EXISTS petzbff_wheel_unlocks_open_idx
  ON public.petzbff_wheel_unlocks (unlock_at) WHERE claimed_by IS NULL;

-- ── Entrants / leads. One spin per email (unique) → re-opening is idempotent ───────────────
CREATE TABLE IF NOT EXISTS public.petzbff_wheel_spins (
  id          uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  email       text        NOT NULL,
  consent     boolean     NOT NULL DEFAULT false,
  prize_id    text        NOT NULL REFERENCES public.petzbff_wheel_prizes(id),
  prize_label text        NOT NULL,                 -- snapshot, in case a label is edited later
  unlock_id   uuid        REFERENCES public.petzbff_wheel_unlocks(id),
  session_id  text,
  source      text,
  user_agent  text,
  emailed_at  timestamptz,
  created_at  timestamptz NOT NULL DEFAULT now()
);
CREATE UNIQUE INDEX IF NOT EXISTS petzbff_wheel_spins_email_idx ON public.petzbff_wheel_spins (lower(email));
CREATE INDEX IF NOT EXISTS petzbff_wheel_spins_created_idx      ON public.petzbff_wheel_spins (created_at DESC);

-- ── Seed the prizes for this show (edit totals/labels here or via admin) ───────────────────
INSERT INTO public.petzbff_wheel_prizes (id, label, value_cents, total, sort, scheduled) VALUES
  ('mat',       'Slow feeder mat',       1000, 3,       1, true),
  ('container', 'Slow feeder container',  300, 6,       2, true),
  ('bag',       'Roll of dog bags',        40, 72,      3, false),
  ('sweet',     'Bag of sweets',           10, 200,     4, false),
  ('none',      'Come say hi at the stand', 0, 1000000, 9, false)
ON CONFLICT (id) DO NOTHING;

-- ── Rebuild the unlock schedule from the config window + scheduled-prize totals ────────────
-- Spreads each scarce unit evenly across the show: for a prize with n units, unit i unlocks at
-- start + (i / (n+1)) * duration. Call this AFTER setting the window and BEFORE the show opens
-- (it clears only UNCLAIMED unlocks, so it is safe to re-run while tuning the window).
CREATE OR REPLACE FUNCTION public.petzbff_wheel_reschedule()
RETURNS integer
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  cfg  public.petzbff_wheel_config%ROWTYPE;
  pr   RECORD;
  i    integer;
  dur  interval;
  made integer := 0;
BEGIN
  SELECT * INTO cfg FROM public.petzbff_wheel_config WHERE id;
  IF NOT FOUND THEN RAISE EXCEPTION 'petzbff_wheel: no config row — set the show window first'; END IF;

  DELETE FROM public.petzbff_wheel_unlocks WHERE claimed_by IS NULL;
  dur := cfg.show_ends_at - cfg.show_starts_at;

  FOR pr IN SELECT * FROM public.petzbff_wheel_prizes WHERE scheduled ORDER BY sort LOOP
    FOR i IN 1..pr.total LOOP
      INSERT INTO public.petzbff_wheel_unlocks (prize_id, unlock_at)
        VALUES (pr.id, cfg.show_starts_at + (dur * i) / (pr.total + 1));
      made := made + 1;
    END LOOP;
  END LOOP;

  RETURN made;
END; $$;

-- ── The spin: allocate one prize, atomically ──────────────────────────────────────────────
-- Returns the awarded prize + the spin id. `already` = true means this email had already spun
-- (we return their original prize, never a second one).
CREATE OR REPLACE FUNCTION public.petzbff_wheel_spin(
  p_email text, p_consent boolean, p_session text, p_source text, p_user_agent text
) RETURNS TABLE(spin_id uuid, prize_id text, prize_label text, value_cents integer, already boolean)
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  v_existing public.petzbff_wheel_spins%ROWTYPE;
  v_unlock   public.petzbff_wheel_unlocks%ROWTYPE;
  v_prize    public.petzbff_wheel_prizes%ROWTYPE;
  v_spin     uuid := gen_random_uuid();
BEGIN
  -- One spin per email. Re-opening the page returns the same result, never a fresh draw.
  SELECT * INTO v_existing FROM public.petzbff_wheel_spins WHERE lower(email) = lower(p_email) LIMIT 1;
  IF FOUND THEN
    RETURN QUERY SELECT v_existing.id, v_existing.prize_id, v_existing.prize_label,
      (SELECT p.value_cents FROM public.petzbff_wheel_prizes p WHERE p.id = v_existing.prize_id), true;
    RETURN;
  END IF;

  -- 1) A scheduled prize that has unlocked and is still in stock — highest value first.
  --    FOR UPDATE SKIP LOCKED so concurrent spins take different units, never the same one.
  SELECT u.* INTO v_unlock
  FROM public.petzbff_wheel_unlocks u
  JOIN public.petzbff_wheel_prizes p ON p.id = u.prize_id
  WHERE u.claimed_by IS NULL
    AND u.unlock_at <= now()
    AND p.awarded < p.total
  ORDER BY p.value_cents DESC, u.unlock_at ASC
  FOR UPDATE OF u SKIP LOCKED
  LIMIT 1;

  IF FOUND THEN
    UPDATE public.petzbff_wheel_unlocks SET claimed_by = v_spin WHERE id = v_unlock.id;
    UPDATE public.petzbff_wheel_prizes  SET awarded = awarded + 1 WHERE id = v_unlock.prize_id
      RETURNING * INTO v_prize;
    INSERT INTO public.petzbff_wheel_spins (id,email,consent,prize_id,prize_label,unlock_id,session_id,source,user_agent)
      VALUES (v_spin, p_email, p_consent, v_prize.id, v_prize.label, v_unlock.id, p_session, p_source, p_user_agent);
    RETURN QUERY SELECT v_spin, v_prize.id, v_prize.label, v_prize.value_cents, false;
    RETURN;
  END IF;

  -- 2) Otherwise the best available non-scheduled prize: bag → sweet → none (consolation).
  SELECT * INTO v_prize
  FROM public.petzbff_wheel_prizes
  WHERE scheduled = false AND awarded < total
  ORDER BY sort ASC
  FOR UPDATE SKIP LOCKED
  LIMIT 1;

  IF NOT FOUND THEN
    SELECT * INTO v_prize FROM public.petzbff_wheel_prizes WHERE id = 'none' FOR UPDATE;
  END IF;

  UPDATE public.petzbff_wheel_prizes SET awarded = awarded + 1 WHERE id = v_prize.id;
  INSERT INTO public.petzbff_wheel_spins (id,email,consent,prize_id,prize_label,session_id,source,user_agent)
    VALUES (v_spin, p_email, p_consent, v_prize.id, v_prize.label, p_session, p_source, p_user_agent);
  RETURN QUERY SELECT v_spin, v_prize.id, v_prize.label, v_prize.value_cents, false;
END; $$;

-- ── Grants + RLS ──────────────────────────────────────────────────────────────────────────
-- Mirrors 182: grants keep PostgREST happy, but RLS is on with no client policy, so these
-- prize/lead tables are reachable only through the service-role API route and the functions
-- below. Nothing in the browser can read the inventory or the lead list.
GRANT SELECT, INSERT, UPDATE, DELETE ON TABLE public.petzbff_wheel_config  TO anon, authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON TABLE public.petzbff_wheel_prizes  TO anon, authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON TABLE public.petzbff_wheel_unlocks TO anon, authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON TABLE public.petzbff_wheel_spins   TO anon, authenticated;
GRANT ALL ON TABLE public.petzbff_wheel_config  TO service_role;
GRANT ALL ON TABLE public.petzbff_wheel_prizes  TO service_role;
GRANT ALL ON TABLE public.petzbff_wheel_unlocks TO service_role;
GRANT ALL ON TABLE public.petzbff_wheel_spins   TO service_role;

GRANT EXECUTE ON FUNCTION public.petzbff_wheel_reschedule()                              TO service_role;
GRANT EXECUTE ON FUNCTION public.petzbff_wheel_spin(text, boolean, text, text, text)     TO service_role;

ALTER TABLE public.petzbff_wheel_config  ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.petzbff_wheel_prizes  ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.petzbff_wheel_unlocks ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.petzbff_wheel_spins   ENABLE ROW LEVEL SECURITY;

SELECT '183 complete — petzbff_wheel tables + functions created' AS status;

-- ── Setup for the show (run once, then before doors open) ──────────────────────────────────
--   -- 1) set the window (AEST example), then activate:
--   INSERT INTO petzbff_wheel_config (id, show_starts_at, show_ends_at, active)
--   VALUES (true, '2026-09-05 09:00+10', '2026-09-05 17:00+10', true)
--   ON CONFLICT (id) DO UPDATE SET show_starts_at=EXCLUDED.show_starts_at,
--     show_ends_at=EXCLUDED.show_ends_at, active=EXCLUDED.active, updated_at=now();
--   -- 2) build the staggered unlock schedule:
--   SELECT petzbff_wheel_reschedule();
--
-- ── Useful reads during/after the show ─────────────────────────────────────────────────────
--   -- live inventory
--   SELECT id, label, awarded, total, total-awarded AS remaining FROM petzbff_wheel_prizes ORDER BY sort;
--   -- entrants (leads), newest first
--   SELECT email, prize_label, created_at, source FROM petzbff_wheel_spins ORDER BY created_at DESC;
--   -- when each scarce prize actually went out
--   SELECT u.prize_id, u.unlock_at, s.created_at AS won_at, s.email
--   FROM petzbff_wheel_unlocks u LEFT JOIN petzbff_wheel_spins s ON s.id = u.claimed_by
--   ORDER BY u.prize_id, u.unlock_at;
