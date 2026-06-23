# Bonus-Team chase — comp-admin outreach

**Goal:** get comp-admins to nudge their members who haven't picked a Bonus Team
before picks close. Bonus was reopened to score **2× on Group Stage 3 + Round of 32**;
window closes **Thu 25 Jun 2026, 5am AEST** (= 24 Jun 19:00 UTC, the `bonus_lock_at`).

**In-app feature (shipped):** Manage Comp → **✉️ Targeted Email** → Recipients →
**⭐ No bonus team (N)** → free **🔔 Nudge** (in-app) or the **⭐ Bonus Team** email template.
Backed by `src/lib/no-bonus-team.ts`, `/api/comps/nudge-no-bonus`, engagement endpoint.

**Refresh the list:** `node scripts/bonus-chase-leads.js` (ranks live comps — members
who've actually tipped — by active members missing a bonus pick).

Status key: ☐ not contacted · ◷ contacted · ✓ done · ⊘ skip

---

## Targets (live comps, ranked by active members missing a bonus pick — pulled 2026-06-22)

| ☐ | Comp | Miss (active) | Tippers | Admin |
|---|---|---|---|---|
| ⊘ | On Portland / Brasil / NYC | 15 / 8 / 5 | — | On — fold into the **sponsor** thread, not a cold email |
| ◷ | TERROIR World Cup of Cups | 6 | 22 | hau@terroir.com.au — already emailed (bonus P.S. included) |
| ☐ | HockeyVic | 7 | 7 | ashbingle@gmail.com |
| ☐ | SEI Bracket Predictor Group | 6 | 24 | jonhoepf97@gmx.de |
| ☐ | Mallu FIFA fans | 5 | 21 | abraham77@gmail.com |
| ☐ | Loanworks WC Predictions | 5 | 11 | a.bhattarai@loanworks.com.au |
| ☐ | WC 2026 | 4 | 25 | ashburns96@gmail.com |
| ☐ | SydneyWC2026 | 4 | 14 | mazza255@hotmail.com |
| ☐ | Foundry World Cup 2026 | 2 | 38 | chrisydavies73@hotmail.com |
| ☐ | BAS 2026 World Cup Bracket Challenge | 3 | 10 | leo@balancedassetsolutions.com |
| ☐ | Eurofins FIFA World Cup Competition | 2 | — | helen.mcculloch@eurofinsanz.com |

**Skip:** TribePicks / Warm-Up Comp (ours) · EPIC + Dawg Walk Gang `paws@petzbff.com.au` (test acct).

---

## Email template

**Subject:** Quick 30-sec favour — nudge your players to lock a Bonus Team (closes Thu 5am)

> Hi {First name},
>
> {Comp name} is flying — {tippers} of your players tipping through the group stage. Quick, high-value heads-up before the knockouts:
>
> We've **reopened Bonus Team picks**, and they now score **2× on Group Stage 3 + the Round of 32**. But **{N} of your players haven't set one yet**, and the window closes **Thursday 25 June, 5am AEST** (when GS3 kicks off).
>
> Would you give them a nudge? Takes 30 seconds and it's free:
> 1. Open your comp's **Manage** page → expand **✉️ Targeted Email**
> 2. Under **Recipients**, tap **⭐ No bonus team ({N})**
> 3. Hit **🔔 Nudge {N}** — a free in-app reminder lands straight in their notifications
>
> (Prefer email? There's a ready-made **⭐ Bonus Team** template right there too.)
>
> With 650+ points at play across the tournament, it's well worth your players locking one in.
>
> Thanks!
> Krish · TribePicks Founder · 0413 247 910
