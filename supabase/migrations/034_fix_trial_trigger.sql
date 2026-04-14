-- Migration 034 — fix trial trigger after org→comp rename

-- Recreate the trial function pointing to the renamed table
CREATE OR REPLACE FUNCTION public.create_org_trial()
RETURNS TRIGGER LANGUAGE plpgsql SECURITY DEFINER AS $$
BEGIN
  INSERT INTO public.comp_subscriptions (comp_id, tier, trial_ends_at, max_players, max_tribes)
  VALUES (
    NEW.id,
    'trial',
    NOW() + INTERVAL '30 days',
    50,
    5
  )
  ON CONFLICT (comp_id) DO NOTHING;
  RETURN NEW;
END;
$$;

-- Re-attach the trigger to the renamed table
DROP TRIGGER IF EXISTS on_org_created_trial ON public.comps;
CREATE TRIGGER on_org_created_trial
  AFTER INSERT ON public.comps
  FOR EACH ROW
  EXECUTE FUNCTION public.create_org_trial();

-- Also fix the unique index if it still uses the old column name
DROP INDEX IF EXISTS idx_org_subscriptions_org_id;
CREATE UNIQUE INDEX IF NOT EXISTS idx_comp_subscriptions_comp_id
  ON public.comp_subscriptions(comp_id);

SELECT 'Migration 034 complete — trial trigger fixed' AS status;
