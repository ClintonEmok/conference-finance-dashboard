# Technology Stack

**Analysis Date:** 2026-03-30

## Languages

**Primary:**

- TypeScript ^5.9.3 - All application code (frontend, backend, API routes, Convex functions)
- TypeScript (strict mode) - `tsconfig.json` with `"strict": true`

**Secondary:**

- CSS - Tailwind CSS via `app/globals.css`

## Runtime

**Environment:**

- Node.js (Bun also used - `bun.lockb` present)

**Package Manager:**

- npm (primary - `package-lock.json` present)
- Bun (secondary - `bun.lockb` present)
- Lockfile: `package-lock.json` (npm), `bun.lockb` (bun)

## Frameworks

**Core:**

- Next.js 16.1.7 - Full-stack React framework (App Router, Turbopack enabled)
- React 19.2.4 - UI library
- Convex ^1.34.0 - Real-time backend platform (serverless functions, database, crons)

**Testing:**

- Vitest ^4.1.0 - Unit test runner (`vitest.config.ts`)
- Test environment: Node (not jsdom)

**Build/Dev:**

- Turbopack - Next.js dev server via `next dev --turbopack`
- PostCSS ^8 - CSS processing
- Tailwind CSS ^4.2.1 - Utility-first CSS framework

**UI Components:**

- shadcn/ui ^4.0.8 - Component library (style: `radix-nova`, base color: `mauve`)
- Radix UI ^1.4.3 - Headless primitives
- Lucide React ^0.577.0 - Icon library
- class-variance-authority ^0.7.1 - Component variant management
- tailwind-merge ^3.5.0 - Tailwind class deduplication
- tw-animate-css ^1.4.0 - CSS animations

**State/Data:**

- TanStack React Query ^5.94.5 - Server state management and caching
- next-themes ^0.4.6 - Dark/light theme support

**Linting/Formatting:**

- ESLint ^9.39.4 - Linting (Flat config: `eslint.config.mjs`)
- eslint-config-next 16.1.7 - Next.js-specific rules
- Prettier ^3.8.1 - Code formatting (`.prettierrc`)
- prettier-plugin-tailwindcss ^0.7.2 - Tailwind class sorting

## Key Dependencies

**Critical:**

- `@clerk/nextjs` ^7.0.7 - Authentication provider (JWT-based, integrates with Convex)
- `convex` ^1.34.0 - Backend-as-a-service (functions, real-time DB, crons, file storage)

**Infrastructure:**

- `@tanstack/react-query` ^5.94.5 - Data fetching and cache management
- `prisma` (schema present at `prisma/schema.prisma`) - Database schema definition (PostgreSQL target, SQLite dev)

## Configuration

**TypeScript:**

- Config: `tsconfig.json`
- Target: ES2017
- Module: ESNext with bundler resolution
- Path alias: `@/*` maps to project root (`.`)

**Convex:**

- Config: `convex.json`
- Functions dir: `convex/`
- Codegen: static API + static data model enabled

**ESLint:**

- Config: `eslint.config.mjs` (flat config format)
- Extends: `eslint-config-next/core-web-vitals`, `eslint-config-next/typescript`

**Prettier:**

- Config: `.prettierrc`
- No semicolons, double quotes, trailing commas (ES5), 80 char width
- Tailwind plugin configured with `cn` and `cva` functions

**CSS/PostCSS:**

- PostCSS config: `postcss.config.mjs`
- Tailwind v4 via `@tailwindcss/postcss`

**shadcn/ui:**

- Config: `components.json`
- Style: `radix-nova`
- RSC: enabled
- Path aliases: `@/components`, `@/components/ui`, `@/lib/utils`, `@/hooks`

## Platform Requirements

**Development:**

- Node.js (version not pinned - no `.nvmrc` or `.node-version`)
- Bun or npm
- Convex CLI (`npx convex dev`) for backend

**Production:**

- Next.js production build (`next build`)
- Convex Cloud deployment
- PostgreSQL (via Supabase) for Prisma schema reference

---

_Stack analysis: 2026-03-30_
