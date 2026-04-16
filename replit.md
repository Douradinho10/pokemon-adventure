# Pokemon Adventure

A browser-based Pokemon RPG game built with Next.js 15, React 19, Tailwind CSS v4, and Firebase.

## Project Overview

A Pokemon adventure game where players can:
- Choose a starter Pokemon
- Battle wild Pokemon
- Capture Pokemon with Pokeballs
- Level up and evolve Pokemon
- Manage inventory and team
- Save games to multiple slots (locally via localStorage, optionally to Firebase)

The game UI is in Portuguese (Brazilian).

## Tech Stack

- **Framework**: Next.js 15.5.4 (App Router)
- **UI**: React 19, Tailwind CSS v4, Radix UI components (shadcn/ui)
- **Database**: SQLite via Prisma (for user auth), Firebase Realtime Database (for cloud saves)
- **Auth**: bcryptjs for password hashing
- **Package Manager**: pnpm

## Project Structure

```
app/           - Next.js App Router pages
  page.tsx     - Main game page
  layout.tsx   - Root layout
  globals.css  - Global styles (Tailwind v4)
  login/       - Login page
components/    - Reusable components
  ui/          - shadcn/ui components
  BattleArena.tsx, PokemonCard.tsx, etc.
data/          - Game data (Pokemon stats, attacks, etc.)
hooks/         - Custom React hooks for game state
lib/           - Utilities (Firebase, Prisma, auth, game service)
prisma/        - Database schema (SQLite, dev.db)
```

## Development Setup

```bash
pnpm install
npx prisma db push   # Set up SQLite database
pnpm run dev         # Starts Next on :5000 and Socket.io on :4001
```

## Environment Variables (Optional)

Firebase integration requires these env vars for cloud saves:
- `NEXT_PUBLIC_FIREBASE_API_KEY`
- `NEXT_PUBLIC_FIREBASE_AUTH_DOMAIN`
- `NEXT_PUBLIC_FIREBASE_PROJECT_ID`
- `NEXT_PUBLIC_FIREBASE_STORAGE_BUCKET`
- `NEXT_PUBLIC_FIREBASE_MESSAGING_SENDER_ID`
- `NEXT_PUBLIC_FIREBASE_APP_ID`

Without Firebase config, game saves to localStorage only.

## Key Configuration

- **Port**: 5000 for Next.js, 4001 for Socket.io (configured in package.json dev script)
- **Host**: 0.0.0.0 (required for Replit proxy)
- **PostCSS**: Uses `@tailwindcss/postcss` (Tailwind v4 requirement)
- **Deployment**: Autoscale with `pnpm run build` + `pnpm run start`
