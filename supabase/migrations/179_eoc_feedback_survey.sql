-- 179: End-of-Competition (EOC) feedback survey — consolidates the former migrations
-- 178 (generic WC feedback polls) and 179 (ranked/personalised wrap-up survey) into one.
--
-- Poll engine gains three modes beyond 'single': 'multi' (pick up to max_select), 'rank'
-- (order options by importance), and 'text' (open free-text), plus a free-text note on poll_votes.
--
-- Survey structure (surfaced via /polls?topic=… from the two segmented wrap-up emails):
--   wrapup-drift   — Drifter segment only  (multi, ≤3): what would've kept you going
--   wrapup-finish  — Finisher segment only (multi, ≤3): what kept you coming back
--   wrapup-general — shown to everyone, after the segment question:
--        • overall perception            (single)    ← ex-178
--        • favourite feature             (multi ≤3)  ← ex-178
--        • future sports/events interest (multi, select-all-that-apply + free-text)
--        • donation blocker              (single)    ← ex-178
--        • which cause to support        (multi ≤3, + 'Something else' free-text note)
--        • anything else                 (text, optional open answer)
--
-- Email links:  drifter  → /polls?topic=wrapup-drift,wrapup-general
--               finisher → /polls?topic=wrapup-finish,wrapup-general
--
-- ⚠️ Seeded INACTIVE (active=false). audience='all' polls show on the homepage quick-poll
-- card unless the deployed PollCard excludes their topic (SURVEY_TOPICS). LAUNCH ORDER:
--   1) deploy the code (PollCard SURVEY_TOPICS + survey engine)
--   2) THEN activate:  UPDATE public.polls SET active=true WHERE topic LIKE 'wrapup-%';
--   3) THEN send the segmented emails.
-- Activating before the code is live leaks the whole survey onto everyone's homepage.

ALTER TABLE public.polls
  ADD COLUMN IF NOT EXISTS kind text NOT NULL DEFAULT 'single';   -- 'single' | 'multi' | 'rank'
ALTER TABLE public.polls
  ADD COLUMN IF NOT EXISTS max_select smallint;                   -- multi polls: max options a user may pick

-- Multi/ranked votes carry an array (+ optional note) instead of a single option_idx.
ALTER TABLE public.poll_votes ALTER COLUMN option_idx DROP NOT NULL;
ALTER TABLE public.poll_votes ADD COLUMN IF NOT EXISTS ranking smallint[];   -- multi = chosen set; rank = order (best-first)
ALTER TABLE public.poll_votes ADD COLUMN IF NOT EXISTS note text;            -- optional free-text ('Other' cause)

-- Remove any leftover generic feedback polls (from an earlier accidental run of the old 178)
-- so this migration is deterministic — their questions are reseeded below under wrapup-general.
-- (poll_votes cascade-delete with the poll.)
DELETE FROM public.polls WHERE topic = 'feedback';

DO $$
BEGIN
  -- ── Segment: Drifter (group-stage-only tippers) ─────────────────────────────
  INSERT INTO public.polls (topic, audience, kind, question, description, options, active, created_at)
  SELECT 'wrapup-drift', 'all', 'multi',
    'You tipped early on, then eased off before the knockouts — what would''ve kept you going?',
    'Pick up to 3 — the ones that would''ve made the difference.',
    ARRAY[
      'Reminders before each round''s deadline',
      'A fairer catch-up so a bad start isn''t fatal',
      'More going on in my tribe (chat, rivals)',
      'Prizes / stakes worth chasing',
      'Show me how to join another comp group',
      'Make the app easier to use / more intuitive',
      'More feedback on my tips & performance',
      'More fun / football content in the app',
      'Nothing, my team got knocked out / I lost interest',
      'Nothing — life just got busy'
    ],
    false, now()
  WHERE NOT EXISTS (SELECT 1 FROM public.polls WHERE topic='wrapup-drift');

  -- ── Segment: Finisher (reached the knockouts) ───────────────────────────────
  INSERT INTO public.polls (topic, audience, kind, question, description, options, active, created_at)
  SELECT 'wrapup-finish', 'all', 'multi',
    'You kept tipping into the knockouts — what kept you coming back?',
    'Pick up to 3 — the ones that mattered most.',
    ARRAY[
      'Chasing the leaderboard / beating rivals',
      'The prize money on the line',
      'My tribe & the banter',
      'I just love predicting football',
      'The weekly reports & feedback kept me engaged',
      'My team was still in it / I had a chance to win',
      'The bracket & match challenges kept me hooked',
      'The round reminders kept me on track'
    ],
    false, now()
  WHERE NOT EXISTS (SELECT 1 FROM public.polls WHERE topic='wrapup-finish');

  -- ── Shared: overall perception (ex-178) ─────────────────────────────────────
  INSERT INTO public.polls (topic, audience, kind, question, description, options, active, created_at)
  SELECT 'wrapup-general', 'all', 'single',
    'Overall, how was your TribePicks World Cup?',
    NULL,
    ARRAY[
      'Loved it — count me in for the next one 🙌',
      'Good fun',
      'It was OK',
      'Didn''t really land for me'
    ],
    false, now() - interval '1 minute'
  WHERE NOT EXISTS (SELECT 1 FROM public.polls WHERE topic='wrapup-general' AND question='Overall, how was your TribePicks World Cup?');

  -- ── Shared: favourite feature (ex-178) ──────────────────────────────────────
  INSERT INTO public.polls (topic, audience, kind, question, description, options, active, created_at)
  SELECT 'wrapup-general', 'all', 'multi',
    'Which part of TribePicks did you enjoy most?',
    NULL,
    ARRAY[
      'Weekly & end-of-round reports',
      'The ScoreBoard & leaderboards',
      'Fav Team bonus pick',
      'Challenges (Bracket & Match)',
      'Trophy cabinet & tipster stats',
      'Near real-time scoring',
      'Multi-tribe view'
    ],
    false, now() - interval '2 minutes'
  WHERE NOT EXISTS (SELECT 1 FROM public.polls WHERE topic='wrapup-general' AND question='Which part of TribePicks did you enjoy most?');

  -- ── Shared: future sports/events interest (roadmap demand) ───────────────────
  -- Deliberately UNCAPPED (max_select stays NULL) so the UI shows "Select all that apply" —
  -- we want true demand per sport, not a forced top-N. Excluded from the cap UPDATE below.
  INSERT INTO public.polls (topic, audience, kind, question, description, options, active, created_at)
  SELECT 'wrapup-general', 'all', 'multi',
    'Which of these would you play with us next?',
    'Select all you''d be into — it tells us what to build after the World Cup. Picked “Something else”? Name it below.',
    ARRAY[
      'UEFA Champions League',
      'Premier League (EPL)',
      'FIFA Women''s World Cup 2027',
      'UEFA Euro 2028',
      'Cricket (Big Bash / T20 World Cup)',
      'NRL (rugby league)',
      'AFL (Aussie rules)',
      'NBA (basketball)',
      'NFL (American football)',
      'Formula 1',
      'Something else'
    ],
    false, now() - interval '3 minutes'
  WHERE NOT EXISTS (SELECT 1 FROM public.polls WHERE topic='wrapup-general' AND question='Which of these would you play with us next?');

  -- ── Shared: donation blocker (ex-178) ───────────────────────────────────────
  -- Maps each answer to a monetisation lever: already-paid · awareness · price · value ·
  -- friction · affordability · not-the-audience. (Satisfaction lives in the perception poll.)
  INSERT INTO public.polls (topic, audience, kind, question, description, options, active, created_at)
  SELECT 'wrapup-general', 'all', 'single',
    'TribePicks stays free thanks to small donations. If you haven''t chipped in, what''s closest to why?',
    'No judgment — it just helps us to know.',
    ARRAY[
      'I did donate 🐾',
      'Didn''t realise I could — never saw the option',
      'The amount felt too high — I''d give less',
      'Not sure it''s worth paying for yet',
      'Meant to, just haven''t got round to it',
      'Money''s a bit tight right now',
      'Not into future tournaments / not a big sport fan'
    ],
    false, now() - interval '4 minutes'
  WHERE NOT EXISTS (SELECT 1 FROM public.polls WHERE topic='wrapup-general' AND question='TribePicks stays free thanks to small donations. If you haven''t chipped in, what''s closest to why?');

  -- ── Shared: which cause to support (multi ≤3 + free-text) ────────────────────
  INSERT INTO public.polls (topic, audience, kind, question, description, options, active, created_at)
  SELECT 'wrapup-general', 'all', 'multi',
    'Which causes should TribePicks get behind?',
    'Pick up to 3 — the ones that matter most to you. Chose “Something else”? Name it below.',
    ARRAY[
      'Rescue dogs & animal welfare (as now)',
      'Kids & education',
      'Hunger & homelessness',
      'Mental health',
      'Environment & climate',
      'Grassroots / local sport',
      'Something else'
    ],
    false, now() - interval '5 minutes'
  WHERE NOT EXISTS (SELECT 1 FROM public.polls WHERE topic='wrapup-general' AND question='Which causes should TribePicks get behind?');

  -- ── Shared: open-ended catch-all (optional free text) ────────────────────────
  INSERT INTO public.polls (topic, audience, kind, question, description, options, active, created_at)
  SELECT 'wrapup-general', 'all', 'text',
    'Anything else you''d tell us?',
    'Totally optional — a line or two on what we got right, or what we should fix.',
    ARRAY[]::text[],
    false, now() - interval '6 minutes'
  WHERE NOT EXISTS (SELECT 1 FROM public.polls WHERE topic='wrapup-general' AND kind='text');
END $$;

-- Cap the "pick up to 3" multi polls (drift, finish, feature, cause). The future-sports
-- poll is intentionally left uncapped (NULL) so the UI shows "Select all that apply".
UPDATE public.polls SET max_select = 3
WHERE topic LIKE 'wrapup-%' AND kind = 'multi'
  AND question <> 'Which of these would you play with us next?';

SELECT topic, kind, max_select, audience, question, array_length(options,1) AS opts
FROM public.polls WHERE topic LIKE 'wrapup-%' ORDER BY created_at DESC;

SELECT 'Migration 179 complete — EOC feedback survey seeded (2 segment + 6 shared polls)' AS status;
