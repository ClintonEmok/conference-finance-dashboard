# Technology Stack — v2.0 Event Signup & Internal Events

**Project:** Conference Finance Dashboard
**Researched:** 2026-03-27
**Scope:** Additions/changes for public event signup, internal event management, dual-source architecture

## Existing Stack (DO NOT CHANGE)

These are validated and operational. No additions to these categories.

| Technology            | Version  | Purpose                                   |
| --------------------- | -------- | ----------------------------------------- |
| Next.js               | 16.1.7   | App Router, server components, Turbopack  |
| React                 | 19.2.4   | UI framework                              |
| Convex                | ^1.34.0  | Backend: database, functions, real-time   |
| Clerk                 | ^7.0.7   | Auth runtime (dashboard + API boundaries) |
| shadcn/ui             | ^4.0.8   | Component library (Radix Nova style)      |
| Tailwind CSS          | ^4.2.1   | Styling                                   |
| @tanstack/react-query | ^5.94.5  | Client-side data fetching/caching         |
| lucide-react          | ^0.577.0 | Icons                                     |

## New Dependencies Required

### 1. Form Handling: React Hook Form + Zod

| Package               | Version | Purpose               | Why                                                                                                                                                                                                                                                                    |
| --------------------- | ------- | --------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `react-hook-form`     | ^7.66.0 | Form state management | Industry standard for React forms. Minimal re-renders, great DX. Shadcn's Form component is built around it.                                                                                                                                                           |
| `@hookform/resolvers` | ^4.1.3  | Zod ↔ RHF bridge      | Connects Zod schemas to RHF validation. Required by shadcn Form.                                                                                                                                                                                                       |
| `zod`                 | ^3.24.2 | Schema validation     | TypeScript-first validation. Shared schemas between client forms and Convex mutations. **Use v3, not v4** — shadcn Form's documented integration targets v3, and `@hookform/resolvers` `zodResolver` auto-detects v3/v4 but v4 is still stabilizing ecosystem support. |

**Installation:**

```bash
npm install react-hook-form@^7 @hookform/resolvers@^4 zod@^3
```

**Why these and not alternatives:**

- shadcn/ui's `Form` component is literally a wrapper around React Hook Form. Using anything else (Formik, Unform) means you can't use shadcn Form primitives — you'd be fighting the component library.
- Zod is already the implicit standard in the Convex ecosystem. Convex validators (`v.string()`, `v.object()`) mirror Zod's API. Sharing validation logic between client and server is natural.
- No need for Yup (older, less TypeScript-native) or Valibot (smaller but less ecosystem support).

**shadcn components to install:**

```bash
npx shadcn@latest add form select textarea checkbox radio-group
```

The `form.tsx` component provides `FormField`, `FormItem`, `FormLabel`, `FormControl`, `FormMessage`, `FormDescription` — all wired to React Hook Form context. This is the foundation for every signup and admin form.

### 2. Rate Limiting: @convex-dev/rate-limiter

| Package                    | Version | Purpose                    | Why                                                                                                                                                                                     |
| -------------------------- | ------- | -------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `@convex-dev/rate-limiter` | latest  | Public endpoint protection | Convex-native component. Transactional (rolls back if mutation fails). Supports fixed-window and token-bucket algorithms. **Critical** for public signup mutation to prevent bot abuse. |

**Installation:**

```bash
npm install @convex-dev/rate-limiter
```

**Configuration (convex/convex.config.ts):**

```typescript
import { defineApp } from "convex/server"
import rateLimiter from "@convex-dev/rate-limiter/convex.config"

const app = defineApp()
app.use(rateLimiter)
export default app
```

**Why Convex-native and not middleware-level:**

- Public signup is a Convex mutation — the rate limit should be at the data layer, not just HTTP layer.
- Transactional: if the mutation fails after rate limit check, the "token" is returned. No false positives.
- Per-event-key limiting: `rateLimiter.limit(ctx, "eventSignup", { key: eventId })` prevents one event from being overwhelmed while others remain open.

### 3. Nothing Else Needed

**Intentionally NOT adding:**

| Library                    | Why Not                                                                                                            |
| -------------------------- | ------------------------------------------------------------------------------------------------------------------ |
| Formik                     | Superseded by React Hook Form. Not compatible with shadcn Form.                                                    |
| react-select               | shadcn's `Select` (Radix-based) covers dropdown needs. Custom combobox possible with existing primitives.          |
| next-intl / i18n libraries | Not in scope. Conference is Dutch-language focused. Add later if needed.                                           |
| Sentry / error tracking    | Not signup-specific. Separate concern.                                                                             |
| date-fns / dayjs           | Already have JS `Date` + Convex timestamps. Only add if complex date math needed for event scheduling.             |
| uuid / nanoid              | Convex generates IDs. If we need short public-facing codes, Convex `Math.random()` or a custom hash is sufficient. |
| resend / email service     | Not in scope for signup MVP. Confirmation emails are a post-MVP feature.                                           |
| react-phone-input          | Simple `<Input type="tel">` is sufficient for MVP phone collection.                                                |

## Architecture Decisions for New Code

### Public vs Protected Convex Functions

The existing app uses `ConvexProviderWithClerk` which sends Clerk JWTs with every Convex request. For public pages (event listing, signup), this is fine — Convex functions that don't call `ctx.auth.getUserIdentity()` work regardless of whether a token is present.

**Pattern for public queries (event listing):**

```typescript
// convex/events/public.ts
import { query } from "./_generated/server"
import { v } from "convex/values"

export const listPublic = query({
  args: {
    source: v.optional(
      v.union(v.literal("integration"), v.literal("internal"))
    ),
  },
  handler: async (ctx, args) => {
    // No auth check — this is public data
    // Filter by source, return published events only
  },
})
```

**Pattern for public mutations (signup) — MUST have rate limiting:**

```typescript
// convex/events/signup.ts
import { mutation } from "./_generated/server"
import { RateLimiter } from "@convex-dev/rate-limiter"
import { components } from "../_generated/api"

const rateLimiter = new RateLimiter(components.rateLimiter, {
  eventSignup: { kind: "fixed window", rate: 50, period: 60 * 60 * 1000 }, // 50/hour global
  signupPerIp: {
    kind: "token bucket",
    rate: 5,
    period: 60 * 1000,
    capacity: 2,
  }, // 5/min per IP
})

export const submit = mutation({
  args: {
    /* validated signup fields */
  },
  handler: async (ctx, args) => {
    // Rate limit before any writes
    await rateLimiter.limit(ctx, "eventSignup")
    // IP-based key requires passing IP from client or using action wrapper
    // Proceed with registration...
  },
})
```

### Zod ↔ Convex Validator Alignment

Keep validation schemas in `convex/shared/schemas.ts` (or similar) so Zod schemas and Convex validators can reference the same type definitions. The pattern:

```typescript
// Shared Zod schema (client-side form validation)
export const signupSchema = z.object({
  firstName: z.string().min(1).max(100),
  lastName: z.string().min(1).max(100),
  email: z.string().email(),
  ticketTypeId: z.string(),
  // ...
})

// Convex mutation args mirror the shape
export const submit = mutation({
  args: {
    firstName: v.string(),
    lastName: v.string(),
    email: v.string(),
    ticketTypeId: v.id("internalTicketTypes"),
  },
  handler: async (ctx, args) => {
    /* ... */
  },
})
```

TypeScript will enforce compatibility. Don't try to auto-generate Convex validators from Zod — keep them manually aligned for clarity.

### Route Structure for Public Pages

```
app/
  (public)/              ← Route group, no auth required
    events/
      page.tsx           ← Event listing (/events)
      [eventId]/
        page.tsx         ← Event detail + signup form (/events/:id)
        success/
          page.tsx       ← Signup confirmation (/events/:id/success)
  dashboard/             ← Existing, auth-protected
    ...
```

The root `layout.tsx` already wraps everything in `<ClerkProvider>` + `<ConvexClientProvider>`. Public pages live inside that provider but don't require auth — the Convex functions they call simply don't check `ctx.auth.getUserIdentity()`.

### Middleware for Route Protection

Currently no `middleware.ts` exists. The dashboard protects itself via `requirePageUser()` in the layout server component. This pattern should continue. **Do not add Clerk middleware** unless you want to redirect unauthenticated users away from `/dashboard` at the edge. The current server-component approach is sufficient and simpler.

## Summary Table

| What to Add            | Package                    | Version | Install Command                     |
| ---------------------- | -------------------------- | ------- | ----------------------------------- |
| Form handling          | `react-hook-form`          | ^7.66.0 | `npm i react-hook-form`             |
| Form validation bridge | `@hookform/resolvers`      | ^4.1.3  | `npm i @hookform/resolvers`         |
| Schema validation      | `zod`                      | ^3.24.2 | `npm i zod`                         |
| Rate limiting          | `@convex-dev/rate-limiter` | latest  | `npm i @convex-dev/rate-limiter`    |
| Form components        | shadcn `form`              | —       | `npx shadcn@latest add form`        |
| Select inputs          | shadcn `select`            | —       | `npx shadcn@latest add select`      |
| Long text input        | shadcn `textarea`          | —       | `npx shadcn@latest add textarea`    |
| Toggle inputs          | shadcn `checkbox`          | —       | `npx shadcn@latest add checkbox`    |
| Radio selection        | shadcn `radio-group`       | —       | `npx shadcn@latest add radio-group` |

**Total new runtime dependencies: 4** (`react-hook-form`, `@hookform/resolvers`, `zod`, `@convex-dev/rate-limiter`)
**Total new shadcn components: 5** (`form`, `select`, `textarea`, `checkbox`, `radio-group`)

## Sources

- React Hook Form + Zod resolver: Context7 `/react-hook-form/resolvers` — HIGH confidence
- shadcn Form integration: Context7 `/shadcn-ui/ui` docs — HIGH confidence
- Zod v3 vs v4: Context7 `/colinhacks/zod` — v3.24.2 confirmed stable, v4 available but ecosystem still catching up — HIGH confidence
- Convex rate limiter: Context7 `/websites/convex_dev_components` — HIGH confidence
- Convex public function patterns: Context7 `/get-convex/convex-backend` — HIGH confidence
- Existing stack versions: `package.json` — HIGH confidence (direct read)
- shadcn config: `components.json` (radix-nova style, RSC enabled) — HIGH confidence (direct read)
