-- 181: Per-item co-design feedback. One row per user per item on the /epl/guide brief —
-- the "New with EPL" features (reaction + comment) and the open "Your call" topics
-- (comment only). Upserted, editable. Reactions: love | good | needs_work.

CREATE TABLE IF NOT EXISTS public.codesign_feedback (
  id         uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id    uuid        NOT NULL REFERENCES public.users(id) ON DELETE CASCADE,
  item_key   text        NOT NULL,                                          -- stable per-item key (e.g. 'tiered-scoring')
  reaction   text        CHECK (reaction IN ('love', 'good', 'needs_work')), -- null for open topics
  comment    text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT codesign_feedback_unique UNIQUE (user_id, item_key)
);

CREATE INDEX IF NOT EXISTS codesign_feedback_item ON public.codesign_feedback (item_key);

GRANT SELECT, INSERT, UPDATE, DELETE ON TABLE public.codesign_feedback TO anon, authenticated;
GRANT ALL ON TABLE public.codesign_feedback TO service_role;

ALTER TABLE public.codesign_feedback ENABLE ROW LEVEL SECURITY;

-- Written/read through the service-role API; constrain any direct client access to own rows.
CREATE POLICY "codesign_feedback_own_sel" ON public.codesign_feedback FOR SELECT USING (auth.uid() = user_id);
CREATE POLICY "codesign_feedback_own_ins" ON public.codesign_feedback FOR INSERT WITH CHECK (auth.uid() = user_id);
CREATE POLICY "codesign_feedback_own_upd" ON public.codesign_feedback FOR UPDATE USING (auth.uid() = user_id);
CREATE POLICY "codesign_feedback_own_del" ON public.codesign_feedback FOR DELETE USING (auth.uid() = user_id);

SELECT '181 complete — codesign_feedback table created' AS status;
