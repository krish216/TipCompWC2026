-- Migration 134 — let a sponsor say their logo already contains the name.
--
-- Some sponsor logos are a wordmark (e.g. "Ray White"), so printing the name as text
-- under the logo is redundant. When this is true, the logo blocks (green hero, sponsor
-- insert) suppress the name text and show only the logo + subsidiary/franchise line.

ALTER TABLE public.sponsors
  ADD COLUMN IF NOT EXISTS logo_includes_name boolean NOT NULL DEFAULT false;

SELECT '134 complete — sponsors.logo_includes_name added' AS status;
