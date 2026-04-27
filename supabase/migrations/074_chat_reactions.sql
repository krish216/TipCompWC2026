-- Migration 074 — emoji reactions for tribe chat messages

CREATE TABLE IF NOT EXISTS public.chat_reactions (
  message_id UUID        NOT NULL REFERENCES public.chat_messages(id) ON DELETE CASCADE,
  user_id    UUID        NOT NULL,
  emoji      TEXT        NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  PRIMARY KEY (message_id, user_id, emoji)
);

CREATE INDEX IF NOT EXISTS idx_chat_reactions_message
  ON public.chat_reactions(message_id);

ALTER TABLE public.chat_reactions ENABLE ROW LEVEL SECURITY;

-- Anyone authenticated can view reactions
CREATE POLICY "reactions_select" ON public.chat_reactions
  FOR SELECT USING (auth.uid() IS NOT NULL);

-- Users can only insert/delete their own reactions
CREATE POLICY "reactions_insert" ON public.chat_reactions
  FOR INSERT WITH CHECK (auth.uid() = user_id);

CREATE POLICY "reactions_delete" ON public.chat_reactions
  FOR DELETE USING (auth.uid() = user_id);

SELECT 'Migration 074 complete — chat_reactions table created' AS status;
