-- 161: comps.group_chat_url — the Chief's community group-chat invite link
--
-- The group chat (WhatsApp/Telegram/Discord) is where a tribe's banter actually lives.
-- Letting the Chief attach a self-serve join link deepens the community and frees them
-- from adding members by hand. We store only a URL — no phone numbers, no PII.
--
-- Visibility is gated to MEMBERS at the API layer (a WhatsApp group link exposes phone
-- numbers + is open-join, so it must not leak to strangers on public open-comp pages).
-- The URL is validated to known chat hosts before it's stored.

ALTER TABLE public.comps ADD COLUMN IF NOT EXISTS group_chat_url text;

COMMENT ON COLUMN public.comps.group_chat_url IS
  'Chief-set community chat invite (chat.whatsapp.com / t.me / discord.gg). Shown to members only; validated on write.';

SELECT 'Migration 161 complete — comps.group_chat_url added' AS status;
