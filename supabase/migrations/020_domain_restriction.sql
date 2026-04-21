-- ============================================================
-- Migration 020 — email domain restriction for organisations
-- ============================================================

alter table public.organisations
  add column if not exists email_domain text;  -- e.g. "acmecorp.com" — enterprise only

-- Index for fast lookup on join
create index if not exists idx_orgs_email_domain on public.organisations(email_domain)
  where email_domain is not null;

-- Verify
select id, name, email_domain from public.organisations limit 5;
