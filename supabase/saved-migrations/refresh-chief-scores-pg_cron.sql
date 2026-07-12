-- ============================================================================
-- Comp-Chief ranking refresh scheduler (Supabase pg_cron)
-- ============================================================================
-- RUN THIS ONCE in the Supabase SQL Editor (Dashboard → SQL Editor), NOT via the
-- numbered migration runner — it's environment-specific scheduling, not schema.
--
-- Schedules a nightly REFRESH of the `chief_scores` materialized view (migration
-- 163) so the Comp-Chief profile RANK pin and the VERIFIED badge (which depends on
-- active_tipsters) stay current. Unlike the weekly-report cron, this calls a plain
-- DB function directly — no HTTP, no CRON_SECRET, no pg_net.
--
-- TIMING: 16:00 UTC = 02:00 AEST (UTC+10) — off-peak. pg_cron runs in UTC; exact
-- local time isn't important for a nightly stats refresh, so no DST handling needed.
-- ============================================================================

-- 1. Enable pg_cron (no-op if already enabled)
create extension if not exists pg_cron;

-- 2. (Re)schedule the job. Unschedule first so re-running this file is idempotent.
select cron.unschedule('refresh-chief-scores')
where exists (select 1 from cron.job where jobname = 'refresh-chief-scores');

select cron.schedule(
  'refresh-chief-scores',
  '0 16 * * *',                     -- nightly, 16:00 UTC (~02:00 AEST)
  $$ select public.refresh_chief_scores(); $$
);

-- 3. Run it once now so ranks/Verified are populated immediately (don't wait a day).
select public.refresh_chief_scores();

-- ── Useful operations ───────────────────────────────────────────────────────
-- Inspect schedule:        select * from cron.job where jobname = 'refresh-chief-scores';
-- Recent runs + status:    select * from cron.job_run_details where jobid = (select jobid from cron.job where jobname = 'refresh-chief-scores') order by start_time desc limit 20;
-- Pause / remove the job:  select cron.unschedule('refresh-chief-scores');
-- Fire once manually:      select public.refresh_chief_scores();
-- Spot-check output:       select display_name, score, rank_country, top_pct_country from chief_scores cs join users u on u.id = cs.chief_id order by score desc limit 10;
