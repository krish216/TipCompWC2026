-- 170: "Feed the doggies" — record which doggie each donation fed
--
-- The gamified donation flow lets a supporter pick a doggie to feed. Storing the dog on the
-- donation (set from the Checkout metadata, written by the Stripe webhook) powers "collect the
-- pack" (distinct dogs fed), the lucky-doggie-of-the-round charm (latest fed), and keepsakes —
-- all off the existing donations table. Nullable: legacy/anonymous Payment-Link donations have
-- no dog.

ALTER TABLE public.donations
  ADD COLUMN IF NOT EXISTS dog_slug text;

SELECT 'Migration 170 complete — donations.dog_slug' AS status;
