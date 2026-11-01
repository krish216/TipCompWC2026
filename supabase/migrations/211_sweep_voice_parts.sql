-- 211_sweep_voice_parts.sql
-- tournaments.sweep_voice_parts — Vicky & Gordo one part at a time, under the master switch
-- (sweep_voices, migration 210). Keys set to false are off; a missing key is on:
--   draw_calls     Vicky's "you drew" call as the wheel lands
--   gordo_luck     Gordo's good-luck sign-off after it
--   intro          the sweep intro by the race countdown (My Sweeps, My Pool)
--   practice_race  the voiced practice race (off → the plain animation)
--   outro          their banter after the line in a voiced practice race
--   request_call   Vicky's "new ticket request" call on sweep-admin
-- Switched by a platform admin on /admin (src/lib/sweep/voices.ts lists the parts).
--
-- Column on an existing table, so no new PostgREST grants are needed.

ALTER TABLE public.tournaments
  ADD COLUMN IF NOT EXISTS sweep_voice_parts jsonb NOT NULL DEFAULT '{}'::jsonb;
