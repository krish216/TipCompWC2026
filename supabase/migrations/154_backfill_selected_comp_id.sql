-- 154: backfill user_tournaments.selected_comp_id from existing selections
--
-- selected_comp_id (added in 153) is the per-tournament remembered comp. Seed it from
-- each user's current global selection (user_preferences.comp_id) so existing users
-- don't lose their comp on their first tournament switch — rather than waiting for the
-- app to lazily seed it on next load. Joined through comps so the value lands on the
-- user_tournaments row for the comp's OWN tournament. Only fills NULLs (idempotent).

UPDATE public.user_tournaments ut
SET    selected_comp_id = up.comp_id
FROM   public.user_preferences up
JOIN   public.comps c ON c.id = up.comp_id
WHERE  ut.user_id        = up.user_id
  AND  ut.tournament_id  = c.tournament_id
  AND  up.comp_id       IS NOT NULL
  AND  ut.selected_comp_id IS NULL;

SELECT 'Migration 154 complete — selected_comp_id backfilled from user_preferences' AS status;
