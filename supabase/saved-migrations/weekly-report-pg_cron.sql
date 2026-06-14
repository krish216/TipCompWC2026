-- ============================================================================
-- Weekly Intelligence Report auto-post scheduler (Supabase pg_cron + pg_net)
-- ============================================================================
-- RUN THIS ONCE in the Supabase SQL Editor (Dashboard → SQL Editor), NOT via the
-- numbered migration runner — it is environment-specific and reads secrets from
-- Vault, so nothing sensitive is committed to git.
--
-- It schedules a job that calls GET /api/cron/weekly-report every Monday 08:00
-- UTC. The route is authed via CRON_SECRET and is a no-op unless the admin has
-- turned the `weekly_report_card` toggle ON (Admin → Tournament tab). It posts
-- the members-only report link into each eligible tribe's chat (tribes with 4+
-- members), at most once per tribe per week.
-- ============================================================================

-- 1. Enable the extensions (no-op if already enabled)
create extension if not exists pg_cron;
create extension if not exists pg_net;

-- 2. Store the endpoint URL + CRON_SECRET in Vault.
--    The CRON_SECRET must equal the Vercel CRON_SECRET. If you already created a
--    secret with that value for score-sync you can reuse it below instead of
--    creating 'weekly_report_cron_secret'.
select vault.create_secret(
  'https://tribepicks.com/api/cron/weekly-report',  -- ← production URL (apex, no www)
  'weekly_report_url'
);
select vault.create_secret(
  'REPLACE_WITH_YOUR_CRON_SECRET',                  -- ← must equal Vercel CRON_SECRET
  'weekly_report_cron_secret'
);

-- 3. Schedule the job — Monday 08:00 UTC.
select cron.schedule(
  'weekly-report',
  '0 8 * * 1',
  $$
  select net.http_get(
    url     := (select decrypted_secret from vault.decrypted_secrets where name = 'weekly_report_url'),
    headers := jsonb_build_object(
      'Authorization',
      'Bearer ' || (select decrypted_secret from vault.decrypted_secrets where name = 'weekly_report_cron_secret')
    ),
    timeout_milliseconds := 30000
  );
  $$
);

-- ── Useful operations ───────────────────────────────────────────────────────
-- Inspect schedule:        select * from cron.job;
-- Recent runs + status:    select * from cron.job_run_details order by start_time desc limit 20;
-- Pause / remove the job:  select cron.unschedule('weekly-report');
-- Fire once manually:      same net.http_get block as above.
-- Check pg_net responses:  select * from net._http_response order by created desc limit 20;
