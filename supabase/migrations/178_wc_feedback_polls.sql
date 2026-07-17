-- 178: WC2026 end-of-tournament feedback polls — all signed-in users.
--
-- Three one-tap questions surfaced on the homepage PollCard and the /polls?topic=feedback
-- landing page (linked from the founding-Tipster wrap-up email). audience='all'; topic
-- 'feedback' so the landing page and admin can group them. Staggered created_at so they
-- show in order (perception → support → feature). Idempotent per question.

DO $$
BEGIN
  -- Poll 1 — overall perception (shows first)
  INSERT INTO public.polls (topic, audience, question, description, options, active, created_at)
  SELECT 'feedback', 'all',
    'Overall, how was your TribePicks World Cup?',
    NULL,
    ARRAY[
      'Loved it — count me in for the next one 🙌',
      'Good fun',
      'It was OK',
      'Didn''t really land for me'
    ],
    true, now()
  WHERE NOT EXISTS (SELECT 1 FROM public.polls WHERE topic='feedback'
    AND question = 'Overall, how was your TribePicks World Cup?');

  -- Poll 2 — support / donation diagnostic
  INSERT INTO public.polls (topic, audience, question, description, options, active, created_at)
  SELECT 'feedback', 'all',
    'We keep TribePicks free with small donations. What mainly held you back from chipping in?',
    NULL,
    ARRAY[
      '$3 felt like too much — I''d give less',
      'The tournament didn''t quite meet my expectations',
      'I didn''t realise I could / never saw it',
      'Just forgot — I''ll sort it 🐾',
      'I did donate!'
    ],
    true, now() - interval '1 minute'
  WHERE NOT EXISTS (SELECT 1 FROM public.polls WHERE topic='feedback'
    AND question = 'We keep TribePicks free with small donations. What mainly held you back from chipping in?');

  -- Poll 3 — favourite feature
  INSERT INTO public.polls (topic, audience, question, description, options, active, created_at)
  SELECT 'feedback', 'all',
    'Which part of TribePicks did you enjoy most?',
    NULL,
    ARRAY[
      'Weekly & end-of-round reports',
      'The ScoreBoard & leaderboards',
      'Fav Team bonus pick',
      'Challenges (Bracket & Match)',
      'Trophy cabinet & tipster stats',
      'Multi-tribe view'
    ],
    true, now() - interval '2 minutes'
  WHERE NOT EXISTS (SELECT 1 FROM public.polls WHERE topic='feedback'
    AND question = 'Which part of TribePicks did you enjoy most?');
END $$;

SELECT topic, audience, question, array_length(options,1) AS opts
FROM public.polls WHERE topic='feedback' ORDER BY created_at DESC;

SELECT 'Migration 178 complete — 3 WC feedback polls seeded (audience=all)' AS status;
