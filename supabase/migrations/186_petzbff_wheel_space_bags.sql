-- 186: petzbff_wheel_spin — fixed cadence of 5 sweets to 1 roll
--
-- 185 rationed bags by their share of TOTAL stock, which is self-correcting: after bags
-- overshot early (all the first wins were rolls), it withheld rolls entirely until sweets
-- "caught up" — a long sweets-only streak where nobody won a roll.
--
-- 186 uses a simple fixed cadence instead: a roll on every 6th filler win, i.e. five sweets
-- to one roll. Rolls are evenly spaced (no streaks) and used slowly — at 1-in-6, the ~170
-- sweets left outlast the ~51 rolls, so rolls comfortably last the whole show (likely a few
-- to spare) rather than risk running out. If a turn's prize is out of stock it falls through
-- to the other; both out -> consolation. Rows are locked FOR UPDATE so the last unit is never
-- over-awarded. Scheduled prizes (mats, containers) and the one-spin-per-email rule are
-- unchanged. Safe to apply mid-show (function only; takes effect on the next spin).

CREATE OR REPLACE FUNCTION public.petzbff_wheel_spin(
  p_email text, p_consent boolean, p_session text, p_source text, p_user_agent text
) RETURNS TABLE(spin_id uuid, prize_id text, prize_label text, value_cents integer, already boolean)
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  v_existing public.petzbff_wheel_spins%ROWTYPE;
  v_unlock   public.petzbff_wheel_unlocks%ROWTYPE;
  v_prize    public.petzbff_wheel_prizes%ROWTYPE;
  v_bag      public.petzbff_wheel_prizes%ROWTYPE;
  v_sweet    public.petzbff_wheel_prizes%ROWTYPE;
  v_bag_rem  integer;
  v_swt_rem  integer;
  v_spin     uuid := gen_random_uuid();
BEGIN
  -- One spin per email. Re-opening returns the same result, never a fresh draw.
  SELECT * INTO v_existing FROM public.petzbff_wheel_spins WHERE lower(email) = lower(p_email) LIMIT 1;
  IF FOUND THEN
    RETURN QUERY SELECT v_existing.id, v_existing.prize_id, v_existing.prize_label,
      (SELECT p.value_cents FROM public.petzbff_wheel_prizes p WHERE p.id = v_existing.prize_id), true;
    RETURN;
  END IF;

  -- 1) A scheduled prize that has unlocked and is still in stock — highest value first.
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

  -- 2) Filler: a fixed cadence of five sweets to one roll — a roll on every 6th filler win.
  --    Evenly spaced, no streaks. If the turn's prize is out of stock, fall through to the
  --    other; both out -> consolation. Lock both rows first so the last unit isn't over-awarded.
  SELECT * INTO v_bag   FROM public.petzbff_wheel_prizes WHERE id = 'bag'   FOR UPDATE;
  SELECT * INTO v_sweet FROM public.petzbff_wheel_prizes WHERE id = 'sweet' FOR UPDATE;
  v_bag_rem := v_bag.total   - v_bag.awarded;
  v_swt_rem := v_sweet.total - v_sweet.awarded;

  IF ((v_bag.awarded + v_sweet.awarded) % 6 = 0) AND v_bag_rem > 0 THEN
    v_prize := v_bag;                    -- the 1: a roll on every 6th filler win
  ELSIF v_swt_rem > 0 THEN
    v_prize := v_sweet;                  -- the 5: sweets
  ELSIF v_bag_rem > 0 THEN
    v_prize := v_bag;                    -- sweets gone: hand out the remaining rolls
  ELSE
    SELECT * INTO v_prize FROM public.petzbff_wheel_prizes WHERE id = 'none' FOR UPDATE;
  END IF;

  UPDATE public.petzbff_wheel_prizes SET awarded = awarded + 1 WHERE id = v_prize.id;
  INSERT INTO public.petzbff_wheel_spins (id,email,consent,prize_id,prize_label,session_id,source,user_agent)
    VALUES (v_spin, p_email, p_consent, v_prize.id, v_prize.label, p_session, p_source, p_user_agent);
  RETURN QUERY SELECT v_spin, v_prize.id, v_prize.label, v_prize.value_cents, false;
END; $$;

SELECT '186 complete — filler cadence is now 5 sweets : 1 roll in petzbff_wheel_spin' AS status;
