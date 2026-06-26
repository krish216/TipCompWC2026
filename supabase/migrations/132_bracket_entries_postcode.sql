-- Migration 132 — capture entrant postcode on sponsored bracket challenges.
--
-- Real-estate (and local) sponsors value entrants' postcodes as suburb-level leads.
-- Collected only for sponsored (prize) challenges, under the existing marketing
-- consent (consent_marketing) which authorises sharing details with the sponsor.
-- Nullable — generic/Global challenges never collect it.

ALTER TABLE public.bracket_entries
  ADD COLUMN IF NOT EXISTS postcode text;   -- 4-digit AU postcode; sponsored entries only

SELECT '132 complete — bracket_entries.postcode added' AS status;
