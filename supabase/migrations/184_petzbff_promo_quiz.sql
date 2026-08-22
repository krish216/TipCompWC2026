-- 184: petzbff_promo.quiz — label each quiz lead by species (dog | cat)
--
-- The PetzBFF quiz now has a dog edition (/petzbff/quiz) and a cat edition (/petzbff/catquiz),
-- sharing one capture route and table. This column tells the two apart, so the lead list is
-- filterable and the 3-play replay cap counts per species (three dog plays and three cat plays
-- are independent). Existing rows are all from the dog quiz, so 'dog' is the correct default.

ALTER TABLE public.petzbff_promo
  ADD COLUMN IF NOT EXISTS quiz text NOT NULL DEFAULT 'dog'
  CHECK (quiz IN ('dog', 'cat'));

CREATE INDEX IF NOT EXISTS petzbff_promo_quiz_email_idx ON public.petzbff_promo (quiz, lower(email));

SELECT '184 complete — petzbff_promo.quiz added' AS status;
