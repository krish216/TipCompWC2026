-- Migration 071 — tournament_teams: single source of truth for team name, FIFA code, flag emoji
-- The `name` column must match the strings stored in fixtures.home / fixtures.away.

CREATE TABLE IF NOT EXISTS public.tournament_teams (
  id            uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  tournament_id uuid        NOT NULL REFERENCES public.tournaments(id) ON DELETE CASCADE,
  name          text        NOT NULL,
  fifa_code     text        NOT NULL,
  flag_emoji    text        NOT NULL DEFAULT '🏳️',
  created_at    timestamptz NOT NULL DEFAULT now(),

  CONSTRAINT tournament_teams_unique UNIQUE (tournament_id, name)
);

CREATE INDEX IF NOT EXISTS tournament_teams_tourn ON public.tournament_teams (tournament_id);

ALTER TABLE public.tournament_teams ENABLE ROW LEVEL SECURITY;

CREATE POLICY "tournament_teams_public_read"
  ON public.tournament_teams FOR SELECT USING (true);

-- ── Seed WC2026 teams ────────────────────────────────────────────────────────
-- Name must match exactly what is stored in fixtures.home / fixtures.away.
-- Cabo Verde replaces the previous incorrect "Cape Verde" spelling.
INSERT INTO public.tournament_teams (tournament_id, name, fifa_code, flag_emoji)
SELECT t.id, v.name, v.fifa_code, v.flag_emoji
FROM public.tournaments t
CROSS JOIN (VALUES
  ('Algeria',                'ALG', '🇩🇿'),
  ('Argentina',              'ARG', '🇦🇷'),
  ('Australia',              'AUS', '🇦🇺'),
  ('Austria',                'AUT', '🇦🇹'),
  ('Belgium',                'BEL', '🇧🇪'),
  ('Bolivia',                'BOL', '🇧🇴'),
  ('Bosnia and Herzegovina', 'BIH', '🇧🇦'),
  ('Brazil',                 'BRA', '🇧🇷'),
  ('Cabo Verde',             'CPV', '🇨🇻'),
  ('Canada',                 'CAN', '🇨🇦'),
  ('Chile',                  'CHI', '🇨🇱'),
  ('Colombia',               'COL', '🇨🇴'),
  ('Costa Rica',             'CRC', '🇨🇷'),
  ('Croatia',                'CRO', '🇭🇷'),
  ('Curacao',                'CUW', '🏝️'),
  ('Czechia',                'CZE', '🇨🇿'),
  ('DR Congo',               'COD', '🇨🇩'),
  ('Ecuador',                'ECU', '🇪🇨'),
  ('Egypt',                  'EGY', '🇪🇬'),
  ('England',                'ENG', '🏴󠁧󠁢󠁥󠁮󠁧󠁿'),
  ('France',                 'FRA', '🇫🇷'),
  ('Germany',                'GER', '🇩🇪'),
  ('Ghana',                  'GHA', '🇬🇭'),
  ('Haiti',                  'HAI', '🇭🇹'),
  ('Honduras',               'HON', '🇭🇳'),
  ('Iran',                   'IRN', '🇮🇷'),
  ('Iraq',                   'IRQ', '🇮🇶'),
  ('Ivory Coast',            'CIV', '🇨🇮'),
  ('Jamaica',                'JAM', '🇯🇲'),
  ('Japan',                  'JPN', '🇯🇵'),
  ('Jordan',                 'JOR', '🇯🇴'),
  ('Kenya',                  'KEN', '🇰🇪'),
  ('Mexico',                 'MEX', '🇲🇽'),
  ('Morocco',                'MAR', '🇲🇦'),
  ('Netherlands',            'NED', '🇳🇱'),
  ('New Zealand',            'NZL', '🇳🇿'),
  ('Nigeria',                'NGA', '🇳🇬'),
  ('Norway',                 'NOR', '🇳🇴'),
  ('Panama',                 'PAN', '🇵🇦'),
  ('Paraguay',               'PAR', '🇵🇾'),
  ('Peru',                   'PER', '🇵🇪'),
  ('Portugal',               'POR', '🇵🇹'),
  ('Qatar',                  'QAT', '🇶🇦'),
  ('Saudi Arabia',           'KSA', '🇸🇦'),
  ('Scotland',               'SCO', '🏴󠁧󠁢󠁳󠁣󠁴󠁿'),
  ('Senegal',                'SEN', '🇸🇳'),
  ('South Africa',           'RSA', '🇿🇦'),
  ('South Korea',            'KOR', '🇰🇷'),
  ('Spain',                  'ESP', '🇪🇸'),
  ('Sweden',                 'SWE', '🇸🇪'),
  ('Switzerland',            'SUI', '🇨🇭'),
  ('Tanzania',               'TAN', '🇹🇿'),
  ('Tunisia',                'TUN', '🇹🇳'),
  ('Turkey',                 'TUR', '🇹🇷'),
  ('Uganda',                 'UGA', '🇺🇬'),
  ('Uruguay',                'URU', '🇺🇾'),
  ('USA',                    'USA', '🇺🇸'),
  ('Uzbekistan',             'UZB', '🇺🇿'),
  ('Venezuela',              'VEN', '🇻🇪')
) AS v(name, fifa_code, flag_emoji)
WHERE t.slug = 'wc2026'
ON CONFLICT (tournament_id, name) DO UPDATE
  SET fifa_code = EXCLUDED.fifa_code, flag_emoji = EXCLUDED.flag_emoji;

SELECT 'Migration 071 complete — tournament_teams seeded for wc2026' AS status;
