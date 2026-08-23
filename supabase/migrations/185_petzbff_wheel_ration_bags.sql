-- 185: petzbff_wheel_spin — ration the filler prizes so bags don't run out early
--
-- Problem seen live: every filler win was going to bags (the higher-value 40c roll) because
-- step 2 handed out prizes by value/sort — so 72 bags were draining far faster than the 200
-- sweets, and would run out with the show only part-way through.
--
-- Fix: in step 2, give a bag only while bags are UNDER their fair share of filler stock
-- (72 / (72+200) ≈ 27% of filler wins), otherwise a sweet. This is self-correcting and
-- turnout-proof: bag and sweet inventories deplete in step, so bags last as long as sweets.
-- Both rows are locked FOR UPDATE, so the last unit is never over-awarded under concurrent
-- spins. Scheduled prizes (mats, containers) and the one-spin-per-email rule are unchanged.
--
-- Safe to apply mid-show: it only replaces the function, touches no data, and takes effect on
-- the next spin. Already-awarded bags stay; from here bags are paced down until the ratio
-- rebalances toward sweets.

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

  -- 2) Filler: ration bags vs sweets so bags last the whole show. Lock both rows first.
  SELECT * INTO v_bag   FROM public.petzbff_wheel_prizes WHERE id = 'bag'   FOR UPDATE;
  SELECT * INTO v_sweet FROM public.petzbff_wheel_prizes WHERE id = 'sweet' FOR UPDATE;

  IF v_bag.awarded < v_bag.total
     AND ( v_sweet.awarded >= v_sweet.total
        -- give a bag only while its share of filler wins is below its share of filler stock
        OR v_bag.awarded * (v_bag.total + v_sweet.total)
             < v_bag.total * (v_bag.awarded + v_sweet.awarded + 1) )
  THEN
    v_prize := v_bag;
  ELSIF v_sweet.awarded < v_sweet.total THEN
    v_prize := v_sweet;
  ELSE
    SELECT * INTO v_prize FROM public.petzbff_wheel_prizes WHERE id = 'none' FOR UPDATE;
  END IF;

  UPDATE public.petzbff_wheel_prizes SET awarded = awarded + 1 WHERE id = v_prize.id;
  INSERT INTO public.petzbff_wheel_spins (id,email,consent,prize_id,prize_label,session_id,source,user_agent)
    VALUES (v_spin, p_email, p_consent, v_prize.id, v_prize.label, p_session, p_source, p_user_agent);
  RETURN QUERY SELECT v_spin, v_prize.id, v_prize.label, v_prize.value_cents, false;
END; $$;

SELECT '185 complete — bags now rationed against sweets in petzbff_wheel_spin' AS status;
