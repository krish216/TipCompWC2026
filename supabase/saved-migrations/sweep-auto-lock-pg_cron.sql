-- ============================================================================
-- Sweep auto-lock scheduler (Supabase pg_cron + pg_net)
-- ============================================================================
-- RUN THIS ONCE in the Supabase SQL Editor (Dashboard → SQL Editor), NOT via the numbered
-- migration runner — it is environment-specific and reads secrets from Vault, so nothing
-- sensitive is committed to git. Same pattern as weekly-report-pg_cron.sql.
--
-- It calls GET /api/cron/sweep-auto-lock every 5 minutes. That route locks every sweep
-- tribe whose tournament's race_start_at is within 30 minutes, so new picks/joins/ticket
-- requests stop even if the organiser never clicks the manual "stop new joins"/"close pool"
-- toggle. A no-op whenever no sweep tournament has race_start_at set within that window.
-- ============================================================================

create extension if not exists pg_cron;
create extension if not exists pg_net;

-- Reuse the same CRON_SECRET/vault secret as the other cron jobs if you already created one
-- (e.g. 'weekly_report_cron_secret') — only the URL needs to be sweep-specific.
select vault.create_secret(
  'https://tribepicks.com/api/cron/sweep-auto-lock',  -- ← production URL (apex, no www)
  'sweep_auto_lock_url'
);
select vault.create_secret(
  'REPLACE_WITH_YOUR_CRON_SECRET',                    -- ← must equal Vercel CRON_SECRET
  'sweep_auto_lock_cron_secret'
);

select cron.schedule(
  'sweep-auto-lock',
  '*/5 * * * *',
  $$
  select net.http_get(
    url     := (select decrypted_secret from vault.decrypted_secrets where name = 'sweep_auto_lock_url'),
    headers := jsonb_build_object(
      'Authorization',
      'Bearer ' || (select decrypted_secret from vault.decrypted_secrets where name = 'sweep_auto_lock_cron_secret')
    ),
    timeout_milliseconds := 15000
  );
  $$
);

-- ── Useful operations ───────────────────────────────────────────────────────
-- Inspect schedule:        select * from cron.job;
-- Recent runs + status:    select * from cron.job_run_details order by start_time desc limit 20;
-- Pause / remove the job:  select cron.unschedule('sweep-auto-lock');
-- Fire once manually:      same net.http_get block as above.
