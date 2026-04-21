-- ============================================================
-- Migration 004 — match-topic chat
-- Run in Supabase SQL Editor
-- ============================================================

-- Add fixture_id column to chat_messages (nullable — null = tribe general chat)
alter table public.chat_messages
  add column if not exists fixture_id integer references public.fixtures(id) on delete cascade;

-- Index for fast lookup by tribe + fixture
create index if not exists idx_chat_tribe_fixture
  on public.chat_messages(tribe_id, fixture_id, created_at desc);

-- Update RLS to still only allow tribe members (existing policy covers this)
-- No new policies needed — fixture_id is just a filter column

-- Enable realtime for chat_messages if not already done
alter publication supabase_realtime add table public.chat_messages;
