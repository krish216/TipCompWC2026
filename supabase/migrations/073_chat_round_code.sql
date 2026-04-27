-- Migration 073 — add round_code to chat_messages for round-scoped tribe chat
-- Replaces per-fixture chat topics with per-round topics (gs, r32, r16, qf, sf, tp, f)

ALTER TABLE public.chat_messages
  ADD COLUMN IF NOT EXISTS round_code TEXT;

CREATE INDEX IF NOT EXISTS idx_chat_messages_round
  ON public.chat_messages(tribe_id, round_code)
  WHERE round_code IS NOT NULL;

SELECT 'Migration 073 complete — round_code added to chat_messages' AS status;
