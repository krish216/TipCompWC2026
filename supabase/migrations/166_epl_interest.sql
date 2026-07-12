-- 166: epl_interest — one-click EPL interest poll from the Comp-Chief email
--
-- Each Chief's email has Yes/Maybe/No links to /api/epl-interest?v=..&u=<chiefId>, which
-- upserts a row here (one vote per Chief, latest wins). Reconcilable by joining to the
-- Chief's comps/member counts to weight interest by tribe size — far cleaner than tallying
-- email replies.

CREATE TABLE IF NOT EXISTS public.epl_interest (
  user_id    uuid PRIMARY KEY REFERENCES public.users(id) ON DELETE CASCADE,
  response   text NOT NULL CHECK (response IN ('yes', 'maybe', 'no')),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

GRANT SELECT, INSERT, UPDATE, DELETE ON TABLE public.epl_interest TO anon, authenticated;
GRANT ALL ON TABLE public.epl_interest TO service_role;

SELECT 'Migration 166 complete — epl_interest table created' AS status;

-- Tally (weighted by tribe size) once responses land:
--   select ei.response,
--          count(*) as chiefs,
--          coalesce(sum(m.members),0) as tipsters_reached
--   from epl_interest ei
--   left join (
--     select c.created_by, count(uc.user_id) as members
--     from comps c join user_comps uc on uc.comp_id = c.id
--     group by c.created_by
--   ) m on m.created_by = ei.user_id
--   group by ei.response order by chiefs desc;
