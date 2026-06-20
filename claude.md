# WC2026 - Claude Context Guide

## Project Overview
A Next.js-based World Cup 2026 prediction and competition platform built with TypeScript, Supabase, and Tailwind CSS. Users can make predictions, join tribes, participate in challenges, and compete on leaderboards.

## Tech Stack
- **Framework**: Next.js 14+ with TypeScript
- **Database**: Supabase (PostgreSQL)
- **Styling**: Tailwind CSS
- **Testing**: Jest, Playwright (E2E)
- **Authentication**: Supabase Auth
- **State/Data**: Custom hooks and server-side queries

## Project Structure

### Core Directories
- `src/app/` - Next.js 13+ app router pages and API routes
- `src/components/` - React components (ui, game, layout subdirectories)
- `src/hooks/` - Custom React hooks (useLeaderboard, usePredictions, useTribeChat, etc.)
- `src/lib/` - Utility functions (Supabase clients, timezone, user context)
- `src/types/` - TypeScript type definitions (database types)
- `supabase/migrations/` - Database migrations (numbered sequentially)
- `tests/` - Jest unit tests, integration tests, and Playwright E2E tests

### API Routes
Main API endpoints located in `src/app/api/`:
- `auth/` - Authentication endpoints
- `predictions/` - Prediction management
- `results/` - Match results
- `leaderboard/` - Leaderboard data
- `tribes/` - Tribe management
- `users/` - User management
- `comp-members/`, `comp-announcements/`, `comp-challenges/`, `comp-invitations/` - Competition features
- `admin/` - Admin endpoints
- `chat/` - Tribe chat functionality

### Key Pages
- `predict/` - Make predictions on matches
- `leaderboard/` - View competition standings
- `tribe/` - Tribe hub and chat
- `admin/` - Admin dashboard
- `login/`, `auth/` - Authentication pages
- `rules/`, `terms/`, `privacy/` - Info pages

## Key Files
- `package.json` - Dependencies and scripts
- `next.config.js` - Next.js configuration
- `tsconfig.json` - TypeScript configuration
- `tailwind.config.ts` - Tailwind CSS config
- `jest.config.ts` - Jest testing config
- `playwright.config.ts` - E2E testing config

## Database
- Supabase PostgreSQL backend with RLS (Row-Level Security)
- Migrations tracked in `supabase/migrations/`
- Database setup scripts in `scripts/` (seed.js, reset.js, migrate.js)

## Development
- Run `npm run dev` to start development server
- Run `npm run build` to build for production
- Run tests with `npm test`
- Run E2E tests with `npm run test:e2e`

## Key Conventions
- Use TypeScript for all new code
- Custom hooks for data fetching and state management
- Tailwind CSS for styling
- Test files co-located with implementation files (*.test.ts, *.spec.ts)
- Database types auto-generated from Supabase schema (in `src/types/database.ts`)
- **Spinner**: always use `<Spinner>` from `@/components/ui` — never inline CSS border spinners or custom SVG spinners. The component uses `text-emerald-500` with the standard arc path and accepts a `className` prop for sizing (e.g. `<Spinner className="w-6 h-6" />`).
- **Team selector**: whenever a team needs to be selected anywhere in the app, use the team picker bottom-sheet pattern from `src/components/ui/FavTeamPicker.tsx`. The existing component is coupled to the Bonus Team feature (purple theme, bonus-points copy) — for other contexts (e.g. comp creation, filters), extract the generic sheet/search/flag-grid into a shared `TeamPickerSheet` component and compose from it, rather than duplicating the pattern or building a plain `<input>` or `<select>`.

## Important Notes
- Deployment via Vercel (see `vercel.json`)
- Environment variables needed for Supabase connection
- RLS policies enforce data access control
- Competitions/Organizations referred to as "Comps" in codebase

## Supabase — explicit PostgREST grants required (enforced Oct 30 2026)
Every migration that creates a new table **must** include explicit grants, otherwise the table will be invisible to PostgREST / supabase-js after October 30 2026. Migration 110 retroactively covers all existing tables. Template for new tables:

```sql
GRANT SELECT, INSERT, UPDATE, DELETE ON TABLE public.my_table TO anon, authenticated;
GRANT ALL ON TABLE public.my_table TO service_role;
```
