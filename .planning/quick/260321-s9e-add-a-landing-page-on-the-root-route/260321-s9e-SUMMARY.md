# Quick Task 260321-s9e: Add a Landing Page on the Root Route

## One-liner

Branded auth-aware landing page on `/` matching dashboard aesthetics, redirecting authenticated users to `/dashboard` or presenting a sign-in CTA.

## Tasks Completed

| Task | Name                                                         | Commit  | Files        |
| ---- | ------------------------------------------------------------ | ------- | ------------ |
| 1    | Replace root page with branded landing + auth-aware redirect | 9a2d095 | app/page.tsx |

## What Was Done

- Replaced the placeholder Next.js scaffold page at `app/page.tsx` with a `"use client"` component
- On mount, calls `authClient.getSession()` and checks `response.data?.session` to determine auth state
- Authenticated users receive a silent `router.replace("/dashboard")` redirect
- Unauthenticated visitors see a centered, branded landing page with:
  - Deep purple gradient card (`bg-[linear-gradient(145deg,rgba(113,84,255,0.97),rgba(83,56,171,0.94))]`) matching dashboard style
  - `HandCoins` icon in a frosted-glass container
  - Headline: "Conference Finance Command Center"
  - Subline: "One trusted dashboard for church conference finance operations."
  - "Sign in to dashboard" button with `ArrowRight` icon linking to `/login`
  - `min-h-svh` vertical centering with `max-w-md` constraint
- While checking session, a minimal "Loading..." indicator is shown to prevent content flash
- Fix: Corrected `better-auth` discriminated union type — session lives at `response.data?.session`, not `response.session`

## Deviations from Plan

None — plan executed exactly as written.

## Verification

- `npm run build` completed successfully with no TypeScript errors or import issues
- Only `app/page.tsx` modified in the task commit

## Commits

- `9a2d095` — feat(quick): replace root page with branded landing + auth-aware redirect

## Duration

~2 minutes
