# Result auto-sync — activation runbook

Steps to turn on automated match-result syncing (API-Football → fixtures).
Do them in order. Each step has a verification check before moving on.

---

## 1. Apply migration 112 (adds `fixtures.api_fixture_id`)

Run `supabase/migrations/112_fixtures_api_fixture_id.sql` against the production DB —
paste it into **Supabase → SQL Editor**, or `node scripts/run-migration.js 112_fixtures_api_fixture_id.sql`.

**Verify:**
```sql
select column_name from information_schema.columns
where table_name = 'fixtures' and column_name = 'api_fixture_id';
-- → one row
```

---

## 2. Confirm production env vars (Vercel)

In **Vercel → Settings → Environment Variables → Production**, confirm both exist:
- [ ] A football API key — **either** `API_SPORTS_KEY` (direct, from dashboard.api-football.com)
      **or** `API_FOOTBALL_KEY` (RapidAPI). Direct key wins if both are set.
- [ ] `CRON_SECRET`

(Supabase URL + service-role key are already set.) If you add/change either, **redeploy**.

**Verify** (after deploy) — auth works if this returns 200 JSON, not 401:
```bash
curl -s "https://tribepicks.com/api/scores/sync" \
  -H "Authorization: Bearer <YOUR_CRON_SECRET>"
# Before 11 Jun → {"skipped":"Outside tournament window"}  ← 200 = secret is correct
# Wrong/absent secret → {"error":"Unauthorized"}            ← 401
```

---

## 3. (Optional) Confirm league/season

Defaults are World Cup = league `1`, season `2026`. Sanity-check against your account
if unsure (RapidAPI / API-Football): `GET /v3/leagues?search=World Cup`.
Only set `API_FOOTBALL_LEAGUE_ID` / `API_FOOTBALL_SEASON` in Vercel if the defaults are wrong.

---

## 4. Map fixtures → API-Football ids (one-time, with review)

While **logged in as an admin** in the browser:

1. **Preview:** open `https://tribepicks.com/api/admin/map-fixtures` (GET).
   Review the JSON:
   - `summary` — counts by confidence (`exact`, `swapped`, `time`, `ambiguous`, `unmatched`).
   - Scan `matches` for anything `ambiguous`/`unmatched` (expected for some knockouts).
2. **Commit:** when it looks right, POST to the same URL:
   ```bash
   curl -s -X POST "https://tribepicks.com/api/admin/map-fixtures" \
     -H "Cookie: <your browser session cookie>"
   # → { "mode":"commit", "written": N, "unresolved": [...] }
   ```
   (Or trigger the POST from an admin UI button if/when added.)

**Verify:**
```sql
select count(*) from fixtures where api_fixture_id is not null;  -- expect ~104
select round, count(*) from fixtures where api_fixture_id is null group by round;
-- any rows here = still unmapped; map those by hand (see note below)
```

> **Unmapped knockouts:** if a few knockout fixtures didn't match (kickoff times differ
> between our seed and API-Football), set them manually once you know the API id:
> `update fixtures set api_fixture_id = <id> where id = <localId>;`

---

## 5. Schedule the cron (Supabase pg_cron)

In **Supabase → SQL Editor**, run `supabase/saved-migrations/score-sync-pg_cron.sql`
after editing the two placeholders:
- [ ] `score_sync_url` → `https://tribepicks.com/api/scores/sync`
- [ ] `score_sync_cron_secret` → **exact same value** as Vercel's `CRON_SECRET`

**Verify:**
```sql
select jobname, schedule, active from cron.job;          -- 'score-sync', '*/15 * * * *', t
-- after ~15 min:
select status, return_message, start_time
from cron.job_run_details order by start_time desc limit 5;   -- status = 'succeeded'
```

---

## 6. End-to-end smoke test (during tournament window)

After 11 Jun, once a real match has finished:
- Wait up to ~15 min, then check the fixture got a result with `result_set_by IS NULL`
  (null = set by the auto-sync, not an admin):
  ```sql
  select id, home, away, home_score, away_score, pen_winner, result_set_by
  from fixtures where result_set_at is not null order by result_set_at desc limit 10;
  ```
- Confirm tippers received a "score update" notification and any prize challenges settled.

---

## Rollback / pause

```sql
select cron.unschedule('score-sync');   -- stop the cron
```
Manual admin result entry keeps working at all times and overrides auto-synced scores.
