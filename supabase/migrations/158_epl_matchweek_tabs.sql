-- 158: EPL — make the matchweek (not the month) the primary round unit
--
-- EPL scoring was already per-matchweek (r1..r38, 10 games each), but the UI grouped
-- them by MONTH via tab_group ('aug','sep',...) so the predict tabs and leaderboard
-- snapshots showed months, not weeks. The tipster wants week-by-week navigation with
-- the month kept as a lightweight overlay for orientation.
--
-- This migration moves the month out of tab_group/tab_label into two new dedicated
-- columns (month_key / month_label), then repoints tab_group at the round itself so
-- every matchweek becomes its own tab/snapshot. buildRoundTabs() and the leaderboard
-- snapshot builder both key off tab_group, so this one change drives both surfaces.
--
-- WC (and any other tournament) is untouched: its tab_group already equals its round
-- grouping and month_key stays NULL, so the month rail simply doesn't render for it.
-- Idempotent: the UPDATE only fires while a row is still month-grouped (tab_group is a
-- month, not the round_code), so re-running is a no-op.

ALTER TABLE public.tournament_rounds ADD COLUMN IF NOT EXISTS month_key   text;
ALTER TABLE public.tournament_rounds ADD COLUMN IF NOT EXISTS month_label text;

COMMENT ON COLUMN public.tournament_rounds.month_key   IS 'Overlay grouping key (e.g. league month "aug","sep"); NULL when a tournament is not week/month-structured.';
COMMENT ON COLUMN public.tournament_rounds.month_label IS 'Display label for the month overlay (e.g. "Aug").';

UPDATE public.tournament_rounds tr
SET month_key   = tr.tab_group,
    month_label = tr.tab_label,
    tab_group   = tr.round_code,
    tab_label   = 'MW' || tr.round_order
FROM public.tournaments t
WHERE t.id = tr.tournament_id
  AND t.slug = 'epl-2026-27'
  AND tr.tab_group <> tr.round_code;   -- only while still month-grouped (idempotent)

-- Verify
SELECT round_code, round_order, tab_group, tab_label, month_key, month_label
FROM public.tournament_rounds tr
JOIN public.tournaments t ON t.id = tr.tournament_id
WHERE t.slug = 'epl-2026-27'
ORDER BY round_order
LIMIT 8;

SELECT 'Migration 158 complete — EPL matchweeks are now their own tabs; month moved to overlay columns' AS status;
