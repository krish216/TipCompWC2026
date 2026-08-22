# PetzBFF Dog Lovers Show Quiz — handover

**Branch:** `petzbff-quiz` (not pushed) · **Status:** built and unit-tested, **not deployed, not verified against the database**
**Written:** 23 Aug 2026

PetzBFF (petzbff.com.au) is the founder's second business, a Shopify store selling custom pet
merchandise. This is a lead-capture quiz for it, hosted on TribePicks.

---

## Why this lives on TribePicks and not on Shopify

It was built on Shopify first, four different ways, and none of them can work. **Shopify attaches
its captcha token only to forms rendered by Liquid's `{% form 'customer' %}` tag.** Any custom form
is rejected with `Missing CAPTCHA token` — by `fetch()`, by native submit, in page-body HTML, in a
page template. Documented at https://shopify.dev/docs/storefronts/themes/trust-security

The failure mode is the dangerous part: **a background `fetch()` to `/contact` fails silently.**
A quiz ran at a trade show on 22 Aug 2026 with that capture path. Shopify analytics recorded
**54 sessions landing on the quiz page and 77 unique visitors that day** (against a ~12/day
baseline). **Zero leads were captured.** Nobody found out until the evening.

That is the requirement this build exists to meet: **capture must be able to report its own
failure.** The endpoint returns a non-200 when the insert fails, and the UI refuses to start the
quiz until the lead is stored. Do not "improve" this by letting play continue on a failed capture.

---

## What is built

| File | Purpose |
| --- | --- |
| `supabase/migrations/182_petzbff_promo.sql` | `petzbff_promo` table — one row per play |
| `src/app/api/petzbff-promo/route.ts` | POST capture endpoint, plus the Resend code email |
| `src/app/petzbff/page.tsx` | Route `/petzbff`, metadata |
| `src/app/petzbff/PetzBffQuizClient.tsx` | The quiz UI |
| `src/lib/petzbff-quiz.ts` | Question bank + run assembly. **Generated — see below** |
| `src/lib/petzbff-quiz.test.ts` | 6 tests |

### The game

Ten questions, each correct answer adds 3%. After each one the player **banks** what they hold or
**stakes** it on the next. One wrong answer ends the run at the 3% floor. Ten from ten is 30%.

The bank button only appears from the second correct answer. Banking 3% is identical to busting, so
offering it earlier is a fake choice. Do not "fix" this.

Questions 1–5 are a fixed easy ladder. 6–7 are drawn from a 9-question medium pool, 8–10 from a
10-question hard pool, and every question's options are shuffled — 4,320 distinct question sets, so
replaying to farm a 30% means learning the whole bank rather than one path.

### Data captured

Two POSTs per play: `stage: 'start'` at the email gate (this is the lead) and `stage: 'finish'`
when the run ends (score, outcome, discount, code — and this one sends the email).

Row holds: `email, consent, stage, score, outcome, discount_pct, code, session_id, emailed_at,
source, user_agent, created_at`. `session_id` ties the two rows together, which is what makes
gate drop-off answerable. Useful queries are in the migration footer.

---

## What remains

1. **Apply the migration.** Paste `182_petzbff_promo.sql` into the Supabase SQL editor.
   `npm run db:migrate` is a **no-op** — `scripts/migrate.js` cannot execute DDL and just prints a
   note saying to use the SQL editor.
2. **Deploy the branch.**
3. **Verify end to end.** The route returns `ok: true` *only* if the row inserted, so:
   ```bash
   curl -s -X POST https://tribepicks.com/api/petzbff-promo \
     -H 'Content-Type: application/json' \
     -d '{"email":"verify@example.com","consent":true,"stage":"start","sessionId":"handover-check-001"}'
   ```
   A 200 with `{"ok":true}` proves table + insert. Then confirm the row, and delete the test row.
4. **Play it once in a real browser.** Nobody has yet. See "not verified" below.

### Then, optionally

- **Push leads into Shopify Customers too.** Now that there is a server in the loop this is easy —
  the Admin API has no captcha. Needs a Shopify custom app token in env; roughly 20 lines in the
  `finish` branch of the route. This is the thing that finally gets these emails into Shopify.
- **Meet the Pack page** — see "open decisions".

---

## Verified vs not

**Verified:**
- 6 unit tests pass, including 2,000 simulated runs asserting the option shuffle never breaks the
  answer index, the fixed five never move, and pool slots draw from the right pools
- `npx tsc --noEmit` clean
- Dev server boots; `/petzbff` returns 200 with the expected content
- All API paths exercised by curl: bad email → 400, no consent → 400 `consent_required`, short
  session id → 400, bad discount → 400 `unknown_discount`, **valid request with the table absent →
  500 `store_failed`** (the loud-failure requirement)

**Not verified — do these first:**
- **No database write has ever succeeded.** Supabase was unreachable from the build environment
  (connection timeout), so the migration was never applied and no row has ever landed.
- **No email has ever been sent.** The Resend path is written but unexercised.
- **The page has never been seen in a browser**, only its rendered HTML. Layout, mobile, and the
  progress pips are unreviewed.

---

## Gotchas

- **`src/lib/petzbff-quiz.ts` is generated** from
  `Projects/PetBff/Dog IQ Quiz/questions.json` (a sibling project folder, not in this repo).
  Edit the JSON and regenerate, or the Shopify copy and this one drift apart.
- **Never write a question separating Archie from Ange by coat colour.** Both are apricot doodles
  and Rosie is golden too — such a question has more than one correct answer. This was caught by
  checking the actual photos, not the written bios.
- **Jest cannot run normally here.** `jest.config.ts` needs `ts-node`, which is not installed, so
  `npm test` fails for everyone. Run with an inline config:
  ```bash
  npx jest --config '{"preset":"ts-jest","testEnvironment":"node","rootDir":".","testMatch":["**/petzbff-quiz.test.ts"]}'
  ```
  Installing `ts-node` would fix the repo-wide problem but was out of scope.
- **`RESEND_FROM`** defaults to `PetzBFF <noreply@mail.tribepicks.com>`. Sending PetzBFF mail from a
  TribePicks domain is a deliverability and brand smell — worth a PetzBFF sending domain in Resend.
- The `/petzbff` page renders inside the normal TribePicks layout, so it inherits TribePicks
  nav/footer. That may be wrong for a co-branded PetzBFF page; nobody has looked yet.

---

## Shopify side — current state

The discount codes are real and active, and the quiz uses them. **Do not delete them.**

| Score | Off | Code | | Score | Off | Code |
| --- | --- | --- | --- | --- | --- | --- |
| 1 or busted | 3% | `PETZBFF3` | | 6 | 18% | `Maisey18` |
| 2 | 6% | `PETZBFF6` | | 7 | 21% | `Bear21` |
| 3 | 9% | `PETZBFF9` | | 8 | 24% | `Waffles24` |
| 4 | 12% | `PETZBFF12` | | 9 | 27% | `Murph27` |
| 5 | 15% | `PETZBFF15` | | 10 | 30% | `QNeve30` |

All: percentage off, everything in store, no minimum, **one use per customer**, active to
**30 Nov 2026**, not combinable. The top five are dog names so a shared code does not advertise its
percentage. **No usage limits are set** — a leaked `QNeve30` is currently unbounded; consider
`usageLimit` on the top three.

**Scaffolding left on the Shopify store that should be cleaned up:**
- Page `/pages/dogloversshowquiz` — the old quiz, **still live**, plays but captures nothing to
  Shopify (on-device log only, readable at `?leads=1`). Decide whether to redirect it to
  `tribepicks.com/petzbff` or take it down.
- Page `/pages/capture-test` — blank, delete
- Page `/pages/quiz-preview` — blank, delete
- Theme **"PetzBFF Dawn + Quiz Section (test)"** — unpublished duplicate containing
  `sections/pbff-quiz.liquid` and two test files. Delete unless the Liquid route gets revived.
- URL redirects `/DogLoversShowQuiz` and `/doglovershowquiz` → `/pages/dogloversshowquiz`.
  **Repoint these at the TribePicks URL** once it is live, since the marketing URL is already out.
- Customer segment **PetzBFF_Promo** (`customer_tags CONTAINS 'petzbff-promo'`) — currently empty.

---

## Open decisions for the founder

1. **Code names do not match the dogs.** Codes say `Maisey18` and `Murph27`; the dogs are
   **Maisie** and **Murphy**. And **Waffles is not one of the ten dogs** at all. On a quiz about
   knowing these dogs, that mismatch is noticeable.
2. **"Meet the Pack" page** — agreed in principle, not built. The plan: a page on PetzBFF with the
   ten dogs, and a fourth `pack` question pool supplying question 10 always, so 30% requires brand
   knowledge that cannot be Googled. 8 pack questions are drafted and validated in
   `Projects/PetBff/Dog IQ Quiz/pack-questions.draft.json`. **Blocked on nothing except a decision
   about where the answers live** — they must be findable on a page, or the question is a coin flip.
3. **Replay limits.** Currently unlimited. Attempt caps are unenforceable client-side (incognito
   defeats them); `usageLimit` on the codes is the lever that actually bounds the cost.
4. **Trade show follow-up.** ~54 plays were lost on 22 Aug. If a booth device was used, its
   browser still holds a local log at `/pages/dogloversshowquiz?leads=1`. If people played on their
   own phones — which the 77-unique-visitor count suggests — those leads are unrecoverable.
