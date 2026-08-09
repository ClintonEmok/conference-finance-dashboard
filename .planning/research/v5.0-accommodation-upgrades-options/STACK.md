# Stack Research

**Domain:** Conference finance dashboard — accommodation upgrades & options (catalog + event rates, booking-ref permalink, re-pricing into canonical amount-due)
**Researched:** 2026-08-05
**Confidence:** HIGH (core stack verified against installed versions + Context7; schema/domain recommendations grounded in existing codebase patterns)

## Executive Finding

This milestone does **not require new runtime libraries**. The new capabilities — configurable accommodation catalog, event-scoped option rates, booking-reference permalink, price re-computation — are all achievable with the validated stack (Next.js 16, React 19, Convex, Clerk, shadcn/ui, Tailwind) plus:

1. **Additive Convex schema** (new tables + indexes — no destructive migrations),
2. **One new pure domain module** (`lib/domain/finance/accommodation-amounts.ts`) wired into the existing canonical amount-due loader,
3. **A dynamic route** (`/track-payment/[bookingRef]`) modeled on the existing `/signup/success/[bookingRef]` server-page pattern,
4. **Two shadcn components** to add via the already-installed shadcn CLI (`checkbox`, `radio-group`).

The "stack work" is concentrated in the Convex data layer and the finance domain layer, because money must continue to flow through `loadOrderAmountDueBreakdowns` → `deriveOrderAmountBreakdown` and never be recomputed in the UI (project constraint, validated v4.0).

## Recommended Stack

### Core Technologies

| Technology | Version (installed / latest) | Purpose | Why Recommended |
|------------|---------|---------|-----------------|
| Convex | 1.34.0 / 1.43.0 | Data layer: catalog tables, event-scoped rate config, order option selections, reactive queries | Already the backend. All new tables/validators/indexes use existing `defineSchema`/`v`/`ctx.db` APIs — verified current via Context7. `.withIndex()` + bounded `.take()` remains the correctness pattern. No feature gap for this milestone. |
| Next.js | 16.1.7 / 16.3.0 | `app/track-payment/[bookingRef]/page.tsx` permalink | Dynamic segments are built-in. Next 15+ made `params` a `Promise` — verified via Context7 — and the app already has a working server-page model (`app/signup/success/[bookingRef]/page.tsx` with `fetchQuery` from `convex/nextjs`). Copy that pattern. |
| React | 19.2.4 | Option-selection UI, re-pricing reactivity | Convex `useQuery`/`useMutation` reactivity means re-pricing after config change is a server-side recompute + automatic client re-render. No state library needed. |
| Clerk | 7.0.7 | Admin Upgrades & Options tab auth | Existing boundary (`requireIdentity` + Clerk middleware). Permalink page stays public (no auth), consistent with current `/track-payment`. |
| shadcn/ui + radix-ui | 4.0.8 (CLI) / 4.16.1; radix-ui 1.4.3 | Admin config form + buyer option pickers | Unified `radix-ui` package already installed. Only `checkbox` and `radio-group` are missing from `components/ui/` for the buyer option-selection step; install via `npx shadcn@latest add checkbox radio-group`. |
| Tailwind | 4.2.1 | Styling | Already in place; no change. |

### Convex Schema Additions (the real "stack work" — new tables, all additive)

Follow the established shape conventions: `priceMinor` integer fields for all money, `v.id()` typed references, `updatedAt` timestamps, lowercase index names, event-scoped indexes, `.take()` caps in every query.

| Table | Key Fields (all minor-unit money as integers) | Indexes | Why |
|-------|-----------------------------------------------|---------|-----|
| `accommodationCategories` (reusable) | `label`, `description`, `defaultOccupancy`, `sortOrder` | `by_sortOrder` | Reusable catalog categories (e.g. "Twin", "Family") defined once, reused across events. This is the "configurable catalog" anchor. |
| `accommodationOptions` (reusable) | `label`, `description`, `kind` (`upgrade` \| `cot` \| `resource`), `defaultPriceMinor`, `sortOrder` | `by_kind` | Reusable priced add-ons (superior upgrade, cot, resources). Base price lives here; per-event override lives in the event config table. |
| `accommodationAgeBands` (reusable) | `label`, `minAge`, `maxAge`, `sortOrder` | — (small table, scanned) | Age bands for pricing (child/adult tiers). |
| `eventAccommodationConfig` (event-scoped) | `eventId`, `categoryId?`, `roomTypeId?`, `optionId?`, `ageBandId?`, `priceMinor`, `isAvailable`, `updatedAt` | `by_eventId`, `by_eventId_and_categoryId`, `by_eventId_and_optionId` | **Event-scoped rates & availability.** One row per (event × catalog entity), with rate override and availability toggle. Mirrors the existing `accommodationEventHotels` pattern (join table keyed by eventId). |
| `orderAccommodationSelections` (order-scoped) | `orderId`, `attendeeId`, `categoryId?`, `roomTypeId?`, `optionIds` (array of `v.id("accommodationOptions")`), `ageBandId?`, `quantity` (=1), `sortOrder` | `by_orderId`, `by_attendeeId`, `by_eventId` | **The selection snapshot for pricing.** Stores *what* was chosen (references), not the price — price is derived from live event config at read time so config changes re-price pending orders. Mirrors `orderTicketSelections`. |
| `accommodationRoomTypes` (extend existing) | add `description?: string` (optional field) | existing `label` index | Room types already exist and are reusable; milestone needs descriptions for the buyer-facing picker. Optional column = additive, non-destructive. |

**Design note (pricing model):** "Reusable catalog + event-scoped rates" means option prices are *derived*, not copied, at selection time. `eventAccommodationConfig.priceMinor` overrides `accommodationOptions.defaultPriceMinor` (fallback chain: event config → default). Age-band pricing is expressed as either per-age-band `priceMinor` rows in `eventAccommodationConfig` or a single multiplier field on `accommodationAgeBands` — **recommend explicit per-age-band price rows** so admin sees the actual number, consistent with the "rates configured by admins" requirement (no hidden multiplier math).

### Supporting Libraries

| Library | Version | Purpose | When to Use |
|---------|---------|---------|-------------|
| zod | 4.3.6 (installed) | Client-side validation of option-selection step + re-pricing form | Reuse existing `components/signup/validation/*` pattern for the new accommodation options step and the permalink config-change form. No new form library. |
| @tanstack/react-query | 5.95.2 (installed) | Mutation orchestration (already used) | No change. Convex hooks (`lib/convex/hooks/`) remain the access boundary; add `useAccommodationCatalog`, `useEventAccommodationConfig`, `useOrderAccommodationSelections` there. |
| vitest | 4.1.0 (installed) | Unit tests for pure pricing functions | Every price-derivation function in `lib/domain/finance/accommodation-amounts.ts` gets a `*.test.ts` sibling, mirroring `lib/domain/finance/` and `lib/domain/signup/` test layout. This is how "money never drifts" is enforced. |
| date-fns | 4.1.0 (installed) | Age-band date math if age is derived from birthdate | Only if age bands are computed from DOB; if attendees self-select a band, not needed. |
| Intl.NumberFormat + `lib/format.ts` | built-in | Money display | Keep using existing `formatMoney`; never format money in domain code. |

### Development Tools

| Tool | Purpose | Notes |
|------|---------|-------|
| `npx convex codegen` | Regenerate typed `_generated/` after schema changes | Required per AGENTS.md after any Convex change. |
| `npx convex dev --once` | Push schema + validate | Required per AGENTS.md. |
| `npx shadcn@latest add checkbox radio-group` | Add the two missing UI primitives | radix-ui is already a dependency; shadcn 4.x CLI pulls only the component files. |
| vitest | Pure-function pricing tests | `npm test` already wired. |

## Installation

```bash
# No new runtime dependencies required.

# Add the two missing shadcn components (uses existing radix-ui dependency)
npx shadcn@latest add checkbox radio-group

# Optional: bump Convex to latest 1.x for bugfixes (NOT required for this milestone)
npm install convex@^1.43.0

# After schema changes (per AGENTS.md)
npx convex codegen
npx convex dev --once
```

## Integration with Canonical Amount-Due (central architecture point)

The existing canonical money path is:

```
convex/finance.ts: loadOrderAmountDueBreakdowns(orders)
  → reads orderTicketSelections + ticketTypes
  → lib/domain/finance/amounts.ts: deriveOrderAmountBreakdown()
  → amountDueMinor + amountDueByAttendeeId
consumed by: convex/publicTracking.ts (getByBookingRef), other order/finance loaders
```

**Recommended integration (Option B — parallel module, do NOT modify `deriveOrderAmountBreakdown`):**

1. New pure module `lib/domain/finance/accommodation-amounts.ts` exporting `deriveAccommodationAmountBreakdown({ selections, priceBySelectionId })` — same return shape as `deriveOrderAmountBreakdown` (`amountDueMinor`, `amountDueByAttendeeId`), fully unit-tested. It maps each `orderAccommodationSelections` row to its derived price: base category/room-type rate (event config → default) + summed option prices (event config → default) + age-band rate, all in minor units.
2. Extend `loadOrderAmountDueBreakdowns` in `convex/finance.ts` to also load `orderAccommodationSelections` for the given orders (bounded `.take(100)` per order, same shape as the existing ticket-selection loading) and **sum the two breakdowns** before returning. This is the single merge point — every consumer (public tracking, order detail, finance totals, allocation) automatically sees accommodation charges.
3. Do **not** touch `deriveOrderAmountBreakdown`'s ticket logic (regression risk) and do **not** add money math to `convex/publicTracking.ts` or any UI component.

**Re-pricing semantics:** because selections store references (not prices) and amount-due is derived on read, a config change on a pending order re-prices automatically when `loadOrderAmountDueBreakdowns` runs again. This satisfies "configuration changes before admin confirmation re-price the order" with zero migration work. For confirmed/finalized orders, snapshot the derived total into `orders.totalAmountMinor` (already exists) at confirmation time — flag as a phase decision, not a stack item.

**Allocation paid-priority:** `loadMatchedPaymentTotalsByOrderId` (convex/finance.ts) already maps orderId → paid totals. The allocation board should join that loader with `amountDueByAttendeeId` (now includes accommodation) to highlight paid attendees. Reuse the loaders; do not re-implement payment math in `convex/accommodation.ts`.

## Alternatives Considered

| Recommended | Alternative | When to Use Alternative |
|-------------|-------------|-------------------------|
| Derive price at read time from `eventAccommodationConfig` | Snapshot price onto `orderAccommodationSelections` at write time | Snapshot only after admin confirmation for auditability; derived pricing is required for the "config changes re-price pending orders" behavior |
| Parallel `accommodation-amounts.ts` module + merge in loader | Extend `deriveOrderAmountBreakdown` signature to accept accommodation selections | If ticket+accommodation pricing ever needs to share weighting logic; not the case here — keep ticket logic untouched |
| Additive new tables (`accommodationCategories`, `accommodationOptions`, `eventAccommodationConfig`) | Denormalize options into a single `v.any()` field on `orders` or `orderAttendees` | `v.any()` loses validation and queryability; per-row tables match the established `orderTicketSelections` pattern and enable per-event rates |
| `convex/nextjs` `fetchQuery` server page for `/track-payment/[bookingRef]` (copy of success page) | Client-only page with `useSearchParams` + query param | Permalink must be shareable/deep-linkable and SEO-visible; the existing success page already proves the server pattern works |
| shadcn `checkbox` + `radio-group` (radix-ui based) | Build custom option pickers | Consistency with existing UI kit; radix-ui already installed; no new dependency |

## What NOT to Use

| Avoid | Why | Use Instead |
|-------|-----|-------------|
| decimal.js / dinero.js / money-js | All money is integer minor units (`priceMinor`, `amountMinor`) by project convention; floats never enter storage. A decimal lib adds a dependency for zero benefit and risks inconsistent rounding vs `deriveSelectionAmountMinor`. | Existing integer math in `lib/domain/finance/amounts.ts` |
| A form library (react-hook-form, formik) | zod + existing `components/signup/validation/` and `useSignupValidation` already cover validation; the option-selection step is a few fields | zod schemas + local component state |
| Redux / zustand / jotai | Convex reactive queries already provide state; adding a client store would duplicate the source of truth and fight optimistic-update semantics | Convex hooks in `lib/convex/hooks/` |
| Stripe / new payment SDK | Tikkie payment links are already integrated (`tikkiePaymentLinks`, `payments`); accommodation charges ride the same amount-due → payment-link flow | Existing Tikkie integration |
| Server-side sessions / custom auth for the permalink | Permalink is public by design (track your booking); Clerk is only for admin surfaces | Existing Clerk middleware + public route |
| Convex vector search / AI features | No semantic search need; overkill | Standard indexed queries |
| A separate microservice / API layer | Everything already lives in Convex functions; a second backend would duplicate `finance.ts` loaders and break reactive reads | Convex queries + mutations |
| Decimal/float pricing columns | Would corrupt the `deriveBalanceAmounts`/`allocateMinorAmountByWeight` invariant | Integer `priceMinor` everywhere (including new tables) |

## Stack Patterns by Variant

**If age bands are derived from attendee birthdate (admin-computed):**
- Use `accommodationAgeBands` min/max age + date-fns age calculation at signup; persist the resolved `ageBandId` on the selection row.
- Because: the selection must be stable for re-pricing even if the band list later changes.

**If age bands are self-declared by the buyer (pick a band):**
- Use `accommodationAgeBands` directly as a selectable option in the signup step; no date math, no date-fns.
- Because: simpler, and consistent with the "buyers select options" milestone framing.

**If the same option must be priced differently per room type (e.g. cot cheaper in a family room):**
- Key `eventAccommodationConfig` on `(eventId, roomTypeId, optionId)` and give the price-derivation function a lookup fallback chain `(roomType-specific → option-level → default)`.
- Because: a flat option price cannot express per-room-type pricing; the join table already supports the extra dimension.

**If admin confirmation should freeze prices:**
- On confirm, snapshot the derived accommodation total into `orders.totalAmountMinor` (existing field) and record `confirmedAt`.
- Because: live derivation stays for pending orders, auditability for confirmed ones.

## Version Compatibility

| Package A | Compatible With | Notes |
|-----------|-----------------|-------|
| convex@1.34.0 (installed) | next@16.1.7, @clerk/nextjs@7.0.7 | Current combination already runs in production; all APIs used by this milestone (schema validators, `.withIndex()`, `.take()`, `.paginate()`, `ctx.scheduler`) exist in 1.34.0 (verified via Context7). Bump to 1.43.0 only for bugfixes, not for feature access. |
| next@16.1.7 | react@19.2.4 | Dynamic route `params` is a `Promise` — must be awaited in server pages; use `use()` in client components (verified via Context7). The existing `/signup/success/[bookingRef]` page already follows this. |
| shadcn@4.0.8 CLI | radix-ui@1.4.3 | `npx shadcn add` components import from the unified `radix-ui` package — already a dependency; no peer conflicts expected. CLI may update itself (latest 4.16.x) without app impact. |
| zod@4.3.6 | react@19.2.4 | Used in signup validation already; safe to reuse for option-selection schema. |

## Sources

- [Context7: /llmstxt/convex_dev_llms-full_txt] — verified `defineTable().index()`, `.withIndex()` preferred over `.filter()`, `.paginate()` + `paginationOptsValidator` for large queries, bounded `.take()` best practices (HIGH)
- [Context7: /vercel/next.js] — verified Next 15/16 `params`/`searchParams` are Promises; `await` in server pages, `use()` in client components; dynamic route segment pattern (HIGH)
- Installed versions verified from `node_modules/*/package.json` (convex 1.34.0, next 16.1.7, react 19.2.4, radix-ui 1.4.3, shadcn 4.0.8, zod 4.3.6, @tanstack/react-query 5.95.2, tailwindcss 4.2.1, @clerk/nextjs 7.0.7); latest from npm registry (convex 1.43.0, next 16.3.0, shadcn 4.16.1) (HIGH)
- Codebase: `convex/schema.ts`, `convex/finance.ts`, `convex/signupSubmission.ts`, `convex/publicTracking.ts`, `convex/signupCatalog.ts`, `convex/accommodation.ts`, `lib/domain/finance/amounts.ts`, `lib/domain/signup/*`, `lib/convex/hooks/*`, `app/track-payment/page.tsx`, `app/signup/success/[bookingRef]/page.tsx` (HIGH — direct source)
- `convex/_generated/ai/guidelines.md` — project-specific Convex API conventions (validators, function registration, `ctx.run*`) (HIGH)

---
*Stack research for: Accommodation Upgrades & Options (v5.0) — reusable accommodation catalog, booking-reference permalink, re-pricing into canonical amount-due.*
*Researched: 2026-08-05*
