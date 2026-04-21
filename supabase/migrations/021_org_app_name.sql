-- Migration 021 — org custom app name
alter table public.organisations
  add column if not exists app_name text;  -- e.g. "PetzBFF World Cup Tipping"

-- Verify
select id, name, app_name from public.organisations limit 5;
