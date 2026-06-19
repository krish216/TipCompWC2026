-- 121: Per-challenge bracket leaderboards
--
-- Lets multiple concurrent bracket challenges run per tournament, each with its
-- own entry pool + branded, shareable leaderboard slug (point a sponsor at it).
-- The bracket itself stays shared per tournament — `bracket_picks` is unchanged,
-- a user fills ONE bracket. What becomes per-challenge is the *entry*: a user
-- enters a given challenge with the same bracket, and the leaderboard for that
-- challenge ranks only its entrants.

-- ── challenges: slug + allow >1 bracket challenge per tournament ───────────────
ALTER TABLE public.challenges ADD COLUMN IF NOT EXISTS slug text;

-- Backfill a slug for existing rows (today there's one bracket challenge per
-- tournament). Prefer "<tournament-slug>-<type>"; fall back to the id so the
-- NOT NULL + UNIQUE below can never fail on legacy data.
UPDATE public.challenges c
SET slug = NULLIF(regexp_replace(lower(t.slug || '-' || c.type), '[^a-z0-9]+', '-', 'g'), '')
FROM public.tournaments t
WHERE c.tournament_id = t.id AND c.slug IS NULL;

UPDATE public.challenges SET slug = replace(id::text, '-', '') WHERE slug IS NULL OR slug = '';

ALTER TABLE public.challenges ALTER COLUMN slug SET NOT NULL;

-- Drop the one-bracket-per-tournament constraint; slug is the unique key now.
ALTER TABLE public.challenges DROP CONSTRAINT IF EXISTS challenges_unique;
CREATE UNIQUE INDEX IF NOT EXISTS challenges_slug_unique ON public.challenges (slug);
CREATE INDEX IF NOT EXISTS challenges_tournament_type ON public.challenges (tournament_id, type);

-- ── bracket_entries: scope each entry to a challenge ──────────────────────────
ALTER TABLE public.bracket_entries
  ADD COLUMN IF NOT EXISTS challenge_id uuid REFERENCES public.challenges(id) ON DELETE CASCADE;

-- Backfill: attach existing entries to their tournament's (single) bracket
-- challenge — earliest-created, deterministically, in case of any duplicates.
UPDATE public.bracket_entries e
SET challenge_id = (
  SELECT c.id FROM public.challenges c
  WHERE c.tournament_id = e.tournament_id AND c.type = 'bracket'
  ORDER BY c.created_at ASC
  LIMIT 1
)
WHERE e.challenge_id IS NULL;

-- One entry per user per challenge (was: per user per tournament).
ALTER TABLE public.bracket_entries DROP CONSTRAINT IF EXISTS bracket_entries_unique;
CREATE UNIQUE INDEX IF NOT EXISTS bracket_entries_user_challenge_unique
  ON public.bracket_entries (user_id, challenge_id);
CREATE INDEX IF NOT EXISTS bracket_entries_challenge ON public.bracket_entries (challenge_id);

-- (challenges / bracket_entries already carry the explicit PostgREST grants from
--  migrations 120 and 116 respectively; new columns inherit table-level grants.)
