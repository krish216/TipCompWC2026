-- ============================================================================
-- Nightly challenge-rank refresh (Supabase pg_cron + pg_net)
-- ============================================================================
-- RUN THIS ONCE in the Supabase SQL Editor (Dashboard → SQL Editor), NOT via the
-- numbered migration runner — it's environment-specific scheduling, not schema.
--
-- Recomputes and stores per-user finishing ranks on match_entries / bracket_entries
-- (migration 168) by calling the TS route /api/cron/challenge-ranks, which reuses the
-- SAME scoring as the live leaderboards. Match ranks store once a fixture is settled;
-- bracket ranks refresh as knockout rounds resolve — so a nightly pass keeps the
-- trophy cabinet's challenge podiums/wins current (≤1 day stale).
--
-- Mirrors weekly-report-pg_cron.sql: URL + CRON_SECRET live in Supabase Vault; the
-- Bearer header matches the route's auth check.
-- ============================================================================

create extension if not exists pg_cron;
create extension if not exists pg_net;

-- Store URL + secret in Vault (idempotent-ish: delete any prior copy first).
delete from vault.secrets where name in ('challenge_ranks_url', 'challenge_ranks_cron_secret');
select vault.create_secret('https://tribepicks.com/api/cron/challenge-ranks', 'challenge_ranks_url');
select vault.create_secret('REPLACE_WITH_YOUR_CRON_SECRET',                   'challenge_ranks_cron_secret');

-- (Re)schedule — unschedule first so re-running is idempotent.
select cron.unschedule('challenge-ranks')
where exists (select 1 from cron.job where jobname = 'challenge-ranks');

select cron.schedule(
  'challenge-ranks',
  '30 16 * * *',                     -- nightly, 16:30 UTC (~02:30 AEST), just after chief-scores
  $$
  select net.http_get(
    url     := (select decrypted_secret from vault.decrypted_secrets where name = 'challenge_ranks_url'),
    headers := jsonb_build_object('Authorization',
      'Bearer ' || (select decrypted_secret from vault.decrypted_secrets where name = 'challenge_ranks_cron_secret')),
    timeout_milliseconds := 55000
  );
  $$
);

-- ── Useful operations ───────────────────────────────────────────────────────
-- Inspect schedule:     select * from cron.job where jobname = 'challenge-ranks';
-- Recent runs:          select * from cron.job_run_details where jobid = (select jobid from cron.job where jobname = 'challenge-ranks') order by start_time desc limit 20;
-- Remove the job:       select cron.unschedule('challenge-ranks');
-- Fire once manually:   curl -H "Authorization: Bearer <CRON_SECRET>" https://tribepicks.com/api/cron/challenge-ranks
