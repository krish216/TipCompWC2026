-- ============================================================
-- Migration 014 — tribe description
-- ============================================================
alter table public.tribes
  add column if not exists description text;

-- Verify
select id, name, description from public.tribes limit 5;
