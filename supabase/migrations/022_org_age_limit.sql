-- Migration 022 — org minimum age requirement
alter table public.organisations
  add column if not exists min_age int default null;  -- e.g. 18, null = no restriction

-- Verify
select id, name, min_age from public.organisations limit 5;

-- Add date_of_birth to users for age verification
alter table public.users
  add column if not exists date_of_birth date default null;
