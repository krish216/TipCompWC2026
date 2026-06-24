-- Migration 128 — tournament_teams.fifa_rank: objective favourite signal for Tipster stats.
-- Frozen snapshot of the FIFA/Coca-Cola Men's World Ranking published 11 Jun 2026 (the last
-- update before the WC2026 group stage; next update 20 Jul 2026), so it reflects "who was the
-- favourite at tip time". Lower number = stronger team. Nullable: null = unranked/placeholder.
-- Sources cross-checked: FIFA.com, ESPN, Wikipedia. No live feed — re-run only to re-snapshot.

ALTER TABLE public.tournament_teams ADD COLUMN IF NOT EXISTS fifa_rank smallint;

-- Seed ranks, matched on the exact tournament_teams.name strings (scoped to wc2026).
UPDATE public.tournament_teams tt
SET fifa_rank = v.rank
FROM public.tournaments t,
(VALUES
  ('Argentina',                1),
  ('Spain',                    2),
  ('France',                   3),
  ('England',                  4),
  ('Portugal',                 5),
  ('Brazil',                   6),
  ('Morocco',                  7),
  ('Netherlands',              8),
  ('Belgium',                  9),
  ('Germany',                 10),
  ('Croatia',                 11),
  ('Colombia',                13),
  ('Mexico',                  14),
  ('Senegal',                 15),
  ('Uruguay',                 16),
  ('USA',                     17),
  ('Japan',                   18),
  ('Switzerland',             19),
  ('Iran',                    20),
  ('Turkey',                  22),
  ('Ecuador',                 23),
  ('Austria',                 24),
  ('South Korea',             25),
  ('Nigeria',                 26),
  ('Australia',               27),
  ('Algeria',                 28),
  ('Egypt',                   29),
  ('Canada',                  30),
  ('Norway',                  31),
  ('Ivory Coast',             33),
  ('Panama',                  34),
  ('Sweden',                  38),
  ('Czechia',                 40),
  ('Paraguay',                41),
  ('Scotland',                42),
  ('Tunisia',                 45),
  ('DR Congo',                46),
  ('Venezuela',               49),
  ('Uzbekistan',              50),
  ('Chile',                   51),
  ('Peru',                    52),
  ('Costa Rica',              53),
  ('Qatar',                   56),
  ('Iraq',                    57),
  ('South Africa',            60),
  ('Saudi Arabia',            61),
  ('Jordan',                  63),
  ('Bosnia and Herzegovina',  64),
  ('Honduras',                65),
  ('Cabo Verde',              67),
  ('Jamaica',                 71),
  ('Ghana',                   73),
  ('Bolivia',                 77),
  ('Curacao',                 82),
  ('Haiti',                   83),
  ('New Zealand',             85),
  ('Uganda',                  89),
  ('Kenya',                  109),
  ('Tanzania',               112)
) AS v(name, rank)
WHERE tt.tournament_id = t.id
  AND t.slug = 'wc2026'
  AND tt.name = v.name;

SELECT 'Migration 128 complete — fifa_rank seeded for wc2026' AS status,
       count(*) FILTER (WHERE fifa_rank IS NOT NULL) AS ranked,
       count(*)                                       AS total
FROM public.tournament_teams tt
JOIN public.tournaments t ON t.id = tt.tournament_id AND t.slug = 'wc2026';
