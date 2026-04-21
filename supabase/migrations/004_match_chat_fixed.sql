-- ============================================================
-- Migration 004 (fixed) — match-topic chat
-- Run in Supabase SQL Editor
-- ============================================================

-- Add fixture_id column to chat_messages (safe if already exists)
alter table public.chat_messages
  add column if not exists fixture_id integer references public.fixtures(id) on delete cascade;

-- Index for fast lookup by tribe + fixture
create index if not exists idx_chat_tribe_fixture
  on public.chat_messages(tribe_id, fixture_id, created_at desc);

-- Verify the column was added
select column_name, data_type 
from information_schema.columns 
where table_name = 'chat_messages' 
  and column_name = 'fixture_id';
