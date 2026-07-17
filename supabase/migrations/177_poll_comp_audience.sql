-- 177: comp-scoped polls + seed the EPL co-design feedback set.
--
-- The poll engine had audience 'all' | 'tournament'. Tournament-scoping can't reach the EPL
-- co-design cohort: those users' persisted tournament is WC (they only switch into EPL in
-- session), so a tournament=EPL poll matches nobody. Their true identity is COMP membership —
-- the "EPL Co-Design" comp. So add a comp-scoped audience and target that comp directly.
--
-- audience is free text (no CHECK), so 'comp' needs no constraint change — just a comp_id.

-- ── 1. Column ─────────────────────────────────────────────────────────────────
-- Nullable; only comp-scoped polls set it. Table-level grants already cover new columns.
ALTER TABLE public.polls
  ADD COLUMN IF NOT EXISTS comp_id uuid REFERENCES public.comps(id) ON DELETE CASCADE;

-- ── 2. Seed the 3 co-design polls to the "EPL Co-Design" comp ─────────────────
-- Staggered created_at so the homepage PollCard (newest-first, one at a time) shows them in
-- intended order: cadence → features → founding role. Idempotent per (comp_id, question).
DO $$
DECLARE cid uuid := 'de1fa2da-26c7-4709-baaa-7916701a74f7';  -- EPL Co-Design (code FXAZQXWW)
BEGIN
  -- Poll 1 — cadence (shows first)
  INSERT INTO public.polls (topic, audience, comp_id, question, description, options, active, created_at)
  SELECT 'codesign', 'comp', cid,
    'The Premier League runs 38 weeks — how would you want to play?',
    'You''re shaping the TribePicks Premier League — your picks steer what we build. 🙌 (3 quick questions)',
    ARRAY[
      'Every matchweek — I''m all in',
      'Most weeks, with easy catch-up if I miss one',
      'Just the big matches & marquee rounds',
      'Set-and-forget season calls (table, top 4, relegation)'
    ],
    true, now()
  WHERE NOT EXISTS (SELECT 1 FROM public.polls WHERE comp_id = cid
    AND question = 'The Premier League runs 38 weeks — how would you want to play?');

  -- Poll 2 — features
  INSERT INTO public.polls (topic, audience, comp_id, question, description, options, active, created_at)
  SELECT 'codesign', 'comp', cid,
    'What would you most want to play in EPL?',
    NULL,
    ARRAY[
      'Pick your club & call its exact score for bonus points',
      'Predict the final table — title, top 4, relegation',
      'Weekly win/draw/loss tips across all 10 games',
      'Head-to-head match challenges vs your tribe'
    ],
    true, now() - interval '1 minute'
  WHERE NOT EXISTS (SELECT 1 FROM public.polls WHERE comp_id = cid
    AND question = 'What would you most want to play in EPL?');

  -- Poll 3 — founding role (feeds the comms segmentation)
  INSERT INTO public.polls (topic, audience, comp_id, question, description, options, active, created_at)
  SELECT 'codesign', 'comp', cid,
    'Want to help shape EPL as a founding member?',
    NULL,
    ARRAY[
      'Yes — I''ll run a comp for my mates',
      'Yes — happy to give feedback & test',
      'I''ll play, but not lead',
      'Just here to watch for now'
    ],
    true, now() - interval '2 minutes'
  WHERE NOT EXISTS (SELECT 1 FROM public.polls WHERE comp_id = cid
    AND question = 'Want to help shape EPL as a founding member?');
END $$;

-- Verify
SELECT topic, audience, question, array_length(options,1) AS opts, created_at
FROM public.polls WHERE comp_id = 'de1fa2da-26c7-4709-baaa-7916701a74f7'
ORDER BY created_at DESC;

SELECT 'Migration 177 complete — comp-scoped polls + 3 EPL co-design polls seeded' AS status;
