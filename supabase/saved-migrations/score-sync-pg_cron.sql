-- ============================================================================
-- Score auto-sync scheduler (Supabase pg_cron + pg_net)
-- ============================================================================
-- RUN THIS ONCE in the Supabase SQL Editor (Dashboard → SQL Editor), NOT via the
-- numbered migration runner — it is environment-specific and reads secrets from
-- Vault, so nothing sensitive is committed to git.
--
-- It schedules a job that calls GET /api/scores/sync every 15 minutes. The route
-- itself is gated to the tournament window (11 Jun – 21 Jul 2026) and authed via
-- CRON_SECRET, so running year-round is harmless.
--
-- Why 15 min: the route only calls API-Football on runs where a finished match is
-- still unrecorded (it returns early otherwise), and caps at one batched request
-- per run — so daily API usage stays inside the free tier's 100 req/day. The only
-- cost is that a result can take up to ~15 min to appear instead of ~5.
-- ============================================================================

-- 1. Enable the extensions (no-op if already enabled)
create extension if not exists pg_cron;
create extension if not exists pg_net;

-- 2. Store the endpoint URL + CRON_SECRET in Vault.
--    Replace the two placeholder values with your real production values.
--    (Re-running create_secret with the same name errors — use vault.update_secret
--     to change them later, or delete from vault.secrets first.)
select vault.create_secret(
  'https://tribepicks.com/api/scores/sync',       -- ← your production URL (apex, no www)
  'score_sync_url'
);
select vault.create_secret(
  'REPLACE_WITH_YOUR_CRON_SECRET',                -- ← must equal Vercel CRON_SECRET
  'score_sync_cron_secret'
);

-- 3. Schedule the job — every 15 minutes.
select cron.schedule(
  'score-sync',
  '*/15 * * * *',
  $$
  select net.http_get(
    url     := (select decrypted_secret from vault.decrypted_secrets where name = 'score_sync_url'),
    headers := jsonb_build_object(
      'Authorization',
      'Bearer ' || (select decrypted_secret from vault.decrypted_secrets where name = 'score_sync_cron_secret')
    ),
    timeout_milliseconds := 30000
  );
  $$
);

-- ── Useful operations ───────────────────────────────────────────────────────
-- Inspect schedule:        select * from cron.job;
-- Recent runs + status:    select * from cron.job_run_details order by start_time desc limit 20;
-- Pause / remove the job:  select cron.unschedule('score-sync');
-- Check pg_net responses:  select * from net._http_response order by created desc limit 20;
