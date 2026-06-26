-- Migration 138 — Record the entrant's 18+ confirmation on prize-draw entries
--
-- AU prize promotions require entrants to be 18 or older. The entry modals collect
-- this as a required checkbox for prize challenges; persist it for audit alongside
-- the existing consent_terms / consent_marketing flags. Purely additive.

ALTER TABLE public.bracket_entries
  ADD COLUMN IF NOT EXISTS consent_over18 boolean NOT NULL DEFAULT false;

SELECT '138 complete — bracket_entries.consent_over18 added' AS status;
