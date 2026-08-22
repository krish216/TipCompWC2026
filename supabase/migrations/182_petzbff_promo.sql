-- 182: petzbff_promo — lead + result capture for the PetzBFF Dog Lovers Show Quiz
--
-- PetzBFF is the founder's second business (petzbff.com.au, a Shopify store). The quiz
-- lives on TribePicks because Shopify's storefront will not let a custom form create a
-- customer: Shopify attaches its captcha token only to forms rendered by Liquid's
-- {% form 'customer' %} tag, so every hand-written variant is rejected with "Missing
-- CAPTCHA token". Capturing here instead gives a real row per play, with the score, and
-- lets us email the code. The Shopify discount codes themselves are unchanged.
--
-- Note on the name: unquoted identifiers fold to lower case in Postgres, so this table is
-- the "PetzBFF_Promo" table asked for — SELECT * FROM "PetzBFF_Promo" would not resolve,
-- but SELECT * FROM PetzBFF_Promo does.
--
-- One row per PLAY, not per person. A repeat player produces several rows, which is what
-- makes attempt-count and drop-off answerable.

CREATE TABLE IF NOT EXISTS public.petzbff_promo (
  id            uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  email         text        NOT NULL,
  consent       boolean     NOT NULL DEFAULT false,   -- explicit marketing opt-in (Spam Act)
  stage         text        NOT NULL DEFAULT 'start'  -- 'start' when they enter the gate,
                CHECK (stage IN ('start', 'finish')), -- 'finish' when the run ends
  score         integer     CHECK (score IS NULL OR (score BETWEEN 0 AND 10)),
  outcome       text        CHECK (outcome IS NULL OR outcome IN ('banked', 'busted', 'perfect')),
  discount_pct  integer     CHECK (discount_pct IS NULL OR (discount_pct BETWEEN 3 AND 30)),
  code          text,                                  -- the Shopify code they were shown
  session_id    text,                                  -- ties 'start' and 'finish' together
  emailed_at    timestamptz,                           -- set when the code email is sent
  source        text,                                  -- ?ref= tag: tradeshow, instagram, etc
  user_agent    text,
  created_at    timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS petzbff_promo_email_idx      ON public.petzbff_promo (lower(email));
CREATE INDEX IF NOT EXISTS petzbff_promo_created_idx    ON public.petzbff_promo (created_at DESC);
CREATE INDEX IF NOT EXISTS petzbff_promo_session_idx    ON public.petzbff_promo (session_id);

GRANT SELECT, INSERT, UPDATE, DELETE ON TABLE public.petzbff_promo TO anon, authenticated;
GRANT ALL ON TABLE public.petzbff_promo TO service_role;

ALTER TABLE public.petzbff_promo ENABLE ROW LEVEL SECURITY;

-- Written and read only through the service-role API route. No client-side policy is
-- granted on purpose: these are marketing leads, not user-owned rows, and nothing in the
-- browser should be able to read the list back.

SELECT '182 complete — petzbff_promo table created' AS status;

-- Useful reads once leads land:
--   -- every unique lead, newest first
--   select distinct on (lower(email)) email, created_at, source
--   from petzbff_promo order by lower(email), created_at desc;
--
--   -- how far people get
--   select outcome, count(*), round(avg(score), 1) as avg_score, round(avg(discount_pct), 1) as avg_pct
--   from petzbff_promo where stage = 'finish' group by outcome order by count(*) desc;
--
--   -- gate drop-off: started but never finished
--   select count(*) from petzbff_promo s where stage = 'start'
--   and not exists (select 1 from petzbff_promo f where f.session_id = s.session_id and f.stage = 'finish');
