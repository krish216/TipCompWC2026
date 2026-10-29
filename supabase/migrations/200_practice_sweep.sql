-- Migration 200: Practice sweeps — try the whole sweep flow (organiser and punter) with no
-- real money and no real race.
--
-- One shared "Practice Sweep" tournament (slug practice-sweep) with a fixed field of past
-- Melbourne Cup winners. Anyone can start a practice sweep on it (see
-- /api/sweep/practice). Because the tournament — and so sweep_horses.finish_position — is
-- shared by every practice sweep, a practice race result is stored per POOL instead, on
-- tribes.practice_results (1st, 2nd, 3rd horse ids), so one person's "Run the race" never
-- touches anyone else's practice sweep. Real sweeps never use that column.
--
-- is_active stays false (sweeps never join the tournament rotation — migration 188), and
-- race_start_at stays NULL so the 30-minute auto-lock cron never fires on it.

INSERT INTO public.tournaments (slug, name, format, start_date, end_date, is_active, is_primary, status, enrollment_open)
VALUES ('practice-sweep', 'Practice Sweep', 'sweep', '2026-10-29', '2099-12-31', false, false, 'active', true)
ON CONFLICT (slug) DO NOTHING;

INSERT INTO public.sweep_horses (tournament_id, number, name)
SELECT t.id, h.number, h.name
FROM public.tournaments t
CROSS JOIN (VALUES
  (1,  'Phar Lap'),
  (2,  'Makybe Diva'),
  (3,  'Think Big'),
  (4,  'Rain Lover'),
  (5,  'Might And Power'),
  (6,  'Vintage Crop'),
  (7,  'Saintly'),
  (8,  'Efficient'),
  (9,  'Gold And Black'),
  (10, 'Archer'),
  (11, 'Light Fingers'),
  (12, 'Van Der Hum')
) AS h(number, name)
WHERE t.slug = 'practice-sweep'
ON CONFLICT (tournament_id, number) DO NOTHING;

ALTER TABLE public.tribes
  ADD COLUMN IF NOT EXISTS practice_results uuid[];
