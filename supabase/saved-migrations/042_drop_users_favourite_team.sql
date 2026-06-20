-- Migration 042 — remove favourite_team from users table
-- favourite_team is now stored per-tournament in user_tournaments.favourite_team

-- Verify user_tournaments has the data first
SELECT u.email, ut.tournament_id, ut.favourite_team
FROM public.user_tournaments ut
JOIN public.users u ON u.id = ut.user_id
WHERE ut.favourite_team IS NOT NULL
ORDER BY u.email;

-- Drop the column
ALTER TABLE public.users DROP COLUMN IF EXISTS favourite_team;

SELECT 'Migration 042 complete — favourite_team removed from users' AS status;
