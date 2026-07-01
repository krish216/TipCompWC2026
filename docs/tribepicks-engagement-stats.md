# TribePicks — Engagement Stats (for Reddit post)

_As of **26 June 2026**. Figures pulled from the production database; the **250 seed/demo accounts are excluded** so every number below is real players only._

---

## Headline numbers

| Metric | Value |
|---|---|
| **Registered players** | **1,028** |
| Players in the World Cup 2026 comp | 1,026 |
| **Active players** (have made scored picks) | **714** (~70% of signups) |
| **Predictions made** | **40,688** |
| Avg predictions per active player | ~57 |
| **Private leagues** ("comps") created | **213** |
| **Tribes** (group chats) | **205** |
| World Cup matches covered | 104 |

**One-liners you can pull:**
- Over **1,000 players** have made **40,000+ predictions** across the World Cup.
- **~70% of signups are actively predicting** — 714 of 1,028.
- Players have spun up **213 private leagues** and **205 group chats** to play with their mates.
- The average active player has tipped **~57 matches**.

---

## Site traffic (Vercel Analytics — last 30 days)

| Metric | Value |
|---|---|
| **Visitors** | **6,033** |
| **Page views** | **32,913** |
| Pages per visit | **~5.5** |
| **Bounce rate** | **19%** (low — most visitors engage) |

**Top pages (by visitors):** `/predict` 4.7K · `/leaderboard` 4K · `/` (home) 2.9K · `/join` 1.3K · `/tribe` 1.2K · `/bracket` 505
→ the most-visited pages are the **core loop** (predict + leaderboard), not just the homepage — people come to play, not just look.

**Devices:** 73% mobile · 27% desktop &nbsp;|&nbsp; **OS:** iOS 48% · Android 26% · Windows 16% · Mac 10%
**Countries:** Australia 37% · USA 31% · Canada 9% · UK 5% · Poland 3%
**Referrers:** Google 327 · Google sign-in 259 · Gmail 51 · **Reddit 38** · Facebook 37 · Instagram 24

**Feature engagement:** the Tribe Tipsheet ("see what your tribe picked") was opened **185 times by 57 players** (~3.2 each) — people keep coming back to it.

**Pull-quotes:**
- **6,000 visitors → 33,000 page views** in 30 days — **~5.5 pages per visit**, **19% bounce**.
- The two most-visited pages are **/predict** and **/leaderboard** — the core game loop.
- **73% mobile**, and it's already a four-country audience (AU 37% / US 31% / CA 9% / UK 5%).

---

## Draft Reddit post

_Tone tuned for a build-in-public / r/SideProject / r/indiehackers audience. For a football sub (r/soccer, r/worldcup), lead with the community angle and check each sub's self-promotion rules first — Reddit punishes anything that reads as an ad._

> **Title:** We built a World Cup prediction game with our mates — 1,000+ players and 40k predictions in. Some numbers.
>
> **Body:**
> We made **TribePicks** — a free pick'em where you predict every World Cup 2026 match, run private leagues with your mates, and trash-talk in group chats ("tribes"). It's grown way past our friend group, so I pulled the engagement numbers:
>
> - **1,028 players** signed up · **6,000 visitors / 33,000 page views** last month
> - **40,688 predictions** made across the 104 matches
> - **714 actively predicting** (~70% of signups) — the retention surprised us most
> - **213 private leagues** and **205 group chats** created by players
> - **~5.5 pages per visit, 19% bounce** — top pages are /predict and /leaderboard (people come to play, not just look)
> - 73% mobile, and it's spread across AU/US/CA/UK
>
> What's worked: making it social (leagues + chat) rather than a solo pick'em, and adding stuff like per-tribe tipsheets and a "tipster persona" so people come back between matches. Happy to share what flopped too.
>
> [link] if you want a look — knockouts are open now.

---

## Notes / honesty
- "Active players" = players with at least one **scored** prediction (real engagement, not just a signup). The public leaderboard shows ~964 including the 250 demo accounts; the **714** here strips those out.
- All counts exclude the 250 `@tribepicks.dev` seed accounts used to demo the leaderboard.
- Prediction count is real players only (40,688 of 59,688 total once seed picks are removed).
- Suggested subs: **r/SideProject**, **r/indiehackers**, **r/webdev** (show-and-tell) land stats-posts best. Football subs need a softer, community-first framing and usually have strict self-promo rules.
