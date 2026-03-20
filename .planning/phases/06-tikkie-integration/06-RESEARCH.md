# Phase 6: tikkie integration - Research

**Researched:** 2026-03-20
**Domain:** Tikkie payment-link generation, status synchronization, and operator-facing finance UI in Next.js
**Confidence:** HIGH

## Summary

Phase 6 is not a greenfield integration. The repo already has the core Tikkie foundation in place: Prisma models for payment links and transition events, a typed Tikkie HTTP client, protected dashboard APIs, a webhook route, a manual status-sync job, row-level actions in `app/dashboard/reconciliation/page.tsx`, and attendee-level payment history sourced from `lib/domain/finance/attendee-detail.ts`. Planning should therefore focus on aligning the existing implementation with the new operator-flow decisions, tightening validation, and hardening status-trust behavior instead of rebuilding the integration layer.

The standard implementation for this phase is: keep Tikkie as a thin REST integration using the existing `fetch`-based provider client, keep payment-link state authoritative on the server in Prisma, create links from protected Route Handlers, treat webhook delivery as best-effort only, and use provider GET endpoints plus manual/scheduled polling to recover stale or missed updates. The Tikkie API contract currently documented by ABN AMRO is `2.3.3`; it requires `API-Key` and `X-App-Token`, limits `description` and `referenceId` to 35 characters, defaults `expiryDate` to 14 days if omitted, and allows only one active payment-request notification subscription per app.

For planning, the main gap is UX/polish: add the lightweight confirmation modal before creation, show latest-link-first with explicit last-checked recency and a subtle stale badge, surface generate/copy/open/history affordances in attendee detail as well as outstanding balances, and verify the webhook/polling setup end-to-end. Do not expand scope into automated reminders or a new standalone collection workflow.

**Primary recommendation:** Plan Phase 6 as an incremental hardening-and-UX phase on top of the existing Tikkie backend, with latest-link-first UI, explicit recency/staleness signals, and webhook-plus-poll status synchronization.

## Standard Stack

The established libraries/tools for this domain:

### Core
| Library | Version | Purpose | Why Standard |
|---------|---------|---------|--------------|
| Tikkie API | 2.3.3 | Payment-request creation, retrieval, payments lookup, notification subscription | Official provider contract; repo already aligns to `/paymentrequests`, `/paymentrequests/{token}`, `/payments`, and notification endpoints |
| Next.js | 16.1.7 | App Router UI, Route Handlers, webhook/job endpoints | Current project framework; Route Handlers match existing protected API patterns |
| Prisma | 6.19.0 | Persistent payment-link state, transitions, dedupe keys, relational joins | Current project ORM; already models `TikkiePaymentLink` and `TikkiePaymentLinkTransition` |
| Better Auth | 1.5.5 | Session enforcement for operator-only dashboard actions | Existing protected-route pattern across dashboard APIs |

### Supporting
| Library | Version | Purpose | When to Use |
|---------|---------|---------|-------------|
| React | 19.2.4 | Client-side modal state, row-action state, history expand/collapse | For operator UI interactions in dashboard screens |
| Existing shadcn/ui components | Project-local | Modal, button, card, badge composition | Reuse current dashboard component language; do not introduce a new UI kit |
| Native `fetch` | Built into Next.js runtime | Provider calls to Tikkie | Use via `lib/integrations/tikkie/client.ts`; no separate Tikkie SDK is needed |

### Alternatives Considered
| Instead of | Could Use | Tradeoff |
|------------|-----------|----------|
| Existing `fetch`-based Tikkie client | Third-party wrapper/SDK | No official project SDK is needed here; adding one increases surface area and drifts from the verified provider contract |
| Inline row action + lightweight modal | Separate collection page or wizard | Violates locked context decisions and slows the operator loop |
| App status `created | paid | expired` plus raw provider status | Exposing raw provider enums directly in UI | Makes operator language worse and couples UI to provider-specific edge statuses |

**Installation:**
```bash
# No additional packages are required for Phase 6.
```

## Architecture Patterns

### Recommended Project Structure
```text
app/
├── dashboard/reconciliation/page.tsx          # Primary row-level Tikkie actions and latest status
├── dashboard/attendees/[attendeeId]/page.tsx  # Secondary history, copy/open, and follow-up context
├── api/dashboard/tikkie-links/route.ts        # Authenticated create/list/refresh endpoint
├── api/webhooks/tikkie/route.ts               # Provider notification ingestion
└── api/jobs/tikkie/status-sync/route.ts       # Manual/scheduled fallback poll

lib/
├── domain/finance/tikkie-links.ts             # Status mapping, persistence, transitions, sync orchestration
├── domain/finance/attendee-detail.ts          # Order-centric history projection for attendee detail
└── integrations/tikkie/
    ├── client.ts                              # Typed REST adapter
    ├── config.ts                              # Env validation
    └── webhook.ts                             # Notification parsing and optional signature verification

prisma/
└── schema.prisma                              # TikkiePaymentLink + TikkiePaymentLinkTransition models
```

### Pattern 1: Provider Adapter -> Domain Service -> Protected Route
**What:** Keep Tikkie HTTP details in `lib/integrations/tikkie`, business rules in `lib/domain/finance/tikkie-links.ts`, and auth/request parsing in Route Handlers.
**When to use:** For create, list, refresh, webhook, and sync endpoints.
**Example:**
```typescript
// Source: Next.js Route Handlers docs via Context7
import { headers } from "next/headers"

export async function GET() {
  const requestHeaders = await headers()
  const userAgent = requestHeaders.get("user-agent")
  return Response.json({ userAgent })
}
```

### Pattern 2: Canonical App Status + Raw Provider Fidelity
**What:** Persist app-facing status as `created | paid | expired`, but also store `providerStatus`, raw payload, last-checked timestamp, and transition records.
**When to use:** Every create and refresh path.
**Example:**
```typescript
// Source: Tikkie OpenAPI v2.3.3 + project domain pattern
const nextStatus =
  payments.totalElementCount > 0 || payments.payments.length > 0
    ? "paid"
    : request.status === "OPEN"
      ? "created"
      : "expired"
```

### Pattern 3: Webhook First, Polling Recovery Second
**What:** Use Tikkie notifications for fast updates, but always keep GET-based refresh available because the provider explicitly says delivery is best effort with max three retries.
**When to use:** For all non-terminal links in `created` status.
**Example:**
```typescript
// Source: Tikkie OpenAPI v2.3.3 notification docs
await Promise.all([
  getPaymentRequest(paymentRequestToken),
  getPaymentRequestPayments(paymentRequestToken, 0, 50),
])
```

### Pattern 4: Latest Link First, History Behind Disclosure
**What:** Default all operator surfaces to the newest link and expose older links through an expand/collapse history affordance.
**When to use:** Outstanding balances and attendee detail.
**Example:**
```typescript
// Source: existing repo pattern in attendee detail + phase context decisions
const links = await prisma.tikkiePaymentLink.findMany({
  where: { providerOrderId },
  orderBy: [{ createdAt: "desc" }, { id: "desc" }],
})
const latestLink = links[0] ?? null
```

### Pattern 5: Lightweight Confirmation Modal With Server-Side Validation
**What:** Let operators review/edit `amount`, `expiryDate`, and `description/reference` in a small modal, then validate again on the server before provider calls.
**When to use:** Before every link-generation request from either entry point.
**Example:**
```typescript
// Source: Tikkie OpenAPI v2.3.3 payment request schema
const payload = {
  amountInCents,
  description, // maxLength 35
  expiryDate,  // yyyy-mm-dd
  referenceId, // maxLength 35, pattern-constrained
}
```

### Anti-Patterns to Avoid
- **Route-handler business logic bloat:** Do not put status mapping, provider reconciliation, or Prisma transition logic directly in `route.ts`; keep it in domain modules.
- **Webhook-only truth:** Tikkie explicitly documents notifications as best effort; do not assume webhook delivery alone is sufficient.
- **Raw-status UI coupling:** Do not show `OPEN`, `CLOSED`, or `MAX_*` directly as the operator language.
- **Hidden collection flow:** Do not move generation into a separate page, menu, or side panel; the primary trigger must stay a direct row action.
- **Inline full history dump:** Do not render all prior links inline by default; latest link first is a locked decision.

## Don't Hand-Roll

Problems that look simple but have existing solutions:

| Problem | Don't Build | Use Instead | Why |
|---------|-------------|-------------|-----|
| Tikkie HTTP integration | Ad hoc `fetch` calls in components/routes | `lib/integrations/tikkie/client.ts` | Centralizes headers, parsing, and upstream error mapping |
| Payment-state truth | Client-only state or optimistic UI-only status | Prisma-backed `TikkiePaymentLink` plus refresh/webhook flows | Operators need durable, shareable status across screens |
| Duplicate notification handling | Homegrown in-memory dedupe | `TikkiePaymentLinkTransition.providerNotificationKey @unique` | Survives retries/redeploys and matches provider best-effort delivery model |
| Status transitions | Free-form status rewrites | Monotonic transition guard in domain layer | Prevents `paid -> created` regressions from stale refreshes |
| Link-history projection | Separate bespoke attendee/reconciliation history logic | Shared latest-first query + transition timeline model | Keeps both surfaces consistent |

**Key insight:** The hard part is not generating a URL; it is preserving trustworthy payment state across retries, duplicate notifications, stale reads, and multiple operator entry points.

## Common Pitfalls

### Pitfall 1: Creating a webhook subscription per payment link
**What goes wrong:** Later subscriptions overwrite earlier ones, leaving the app silently listening on only one callback target.
**Why it happens:** Tikkie allows only one active payment-request subscription per app.
**How to avoid:** Treat subscription setup as environment/deployment configuration, not per-order workflow logic.
**Warning signs:** Multiple code paths call `POST /paymentrequestssubscription` during normal link generation.

### Pitfall 2: Treating `CLOSED` as automatically paid
**What goes wrong:** Operator UI marks an unusable or manually closed request as paid.
**Why it happens:** Tikkie payment-request status is not the same thing as payment settlement.
**How to avoid:** Derive `paid` from observed payments; otherwise map `OPEN -> created` and all non-open terminal statuses to `expired` for this app-level model.
**Warning signs:** Status mapping code never checks `/payments`.

### Pitfall 3: Missing provider field validation in the modal
**What goes wrong:** Operators can submit descriptions or reference IDs that Tikkie rejects.
**Why it happens:** UI uses local form freedom without mirroring provider constraints.
**How to avoid:** Enforce `description <= 35`, `referenceId <= 35`, `amountMinor > 0`, and valid future `expiryDate` in both client and server validation.
**Warning signs:** Frequent `400` responses with `DESCRIPTION_MAX_LENGTH_EXCEEDED`, `REFERENCE_ID_INVALID`, or `EXPIRY_DATE_*` errors.

### Pitfall 4: Trusting webhook freshness without recency signals
**What goes wrong:** Operators cannot tell whether a `created` status is current or stale.
**Why it happens:** Notification delivery is best effort and polling is manual/scheduled.
**How to avoid:** Show `last checked` on every latest-link summary and add a subtle stale badge when an open link has not been checked recently.
**Warning signs:** UI shows status text only, with no timestamp or refresh affordance.

### Pitfall 5: Replanning the whole collection workflow
**What goes wrong:** Phase scope balloons into reminders, audit logging, or new navigation.
**Why it happens:** Tikkie feels like a standalone product area rather than a finance-follow-up enhancement.
**How to avoid:** Keep this phase anchored to the existing outstanding-balances and attendee-detail surfaces; leave reminders and broader ops hardening deferred.
**Warning signs:** Tasks mention campaigns, messaging automation, or a new dedicated collection module.

## Code Examples

Verified patterns from official sources:

### Authenticated Route Handler Using Request Headers
```typescript
// Source: https://github.com/vercel/next.js/blob/v16.1.6/docs/01-app/01-getting-started/15-route-handlers.mdx
import { headers } from "next/headers"

export async function GET() {
  const headersList = await headers()
  const userAgent = headersList.get("user-agent")

  return Response.json({ userAgent })
}
```

### Tikkie Payment-Request Payload Shape
```typescript
// Source: Tikkie OpenAPI v2.3.3 (`PaymentRequestCreationRequest`)
const requestBody = {
  amountInCents: 1500,
  description: "Invoice 1815",
  expiryDate: "2026-04-03",
  referenceId: "inv_1815",
}
```

### Prisma Nested Create for Transition Events
```typescript
// Source: Prisma docs v6.19.0 nested writes pattern
await prisma.tikkiePaymentLink.update({
  where: { id: existing.id },
  data: {
    status: nextStatus,
    transitionEvents: {
      create: {
        fromStatus: currentStatus,
        toStatus: nextStatus,
        source: "webhook",
      },
    },
  },
})
```

### Dynamic Provider Calls That Bypass Cache
```typescript
// Source: Next.js caching docs via Context7
const dynamicData = await fetch("https://api.tikkie.me/paymentrequests/...", {
  cache: "no-store",
})
```

## State of the Art

| Old Approach | Current Approach | When Changed | Impact |
|--------------|------------------|--------------|--------|
| Webhook-only payment updates | Webhook plus GET-based recovery polling | Current Tikkie 2.3.3 docs | Prevents missed notifications from leaving long-lived stale `created` links |
| Raw provider statuses in UI | App-level `created | paid | expired` with raw payload retained | Existing repo implementation | Gives operators clearer labels without losing audit/debug fidelity |
| Hidden finance actions or separate flow | Inline row actions in outstanding balances, attendee detail as follow-up surface | Project context 2026-03-20 | Matches the command-center workflow already established in Phase 5 |
| Create-link without operator review | Prefilled confirmation modal before provider call | Phase 6 context decision | Reduces accidental bad amounts/descriptions and keeps flow lightweight |

**Deprecated/outdated:**
- Webhook-only freshness assumptions: Tikkie docs explicitly discourage relying solely on notifications.
- Per-link subscription setup: `POST /paymentrequestssubscription` overwrites the existing subscription and is not an order-level action.
- Reconciliation-only Tikkie visibility: current phase requires attendee detail to expose latest link and history/follow-up context too.

## Open Questions

1. **Does Tikkie provide an official webhook-signature contract for payment-request notifications?**
   - What we know: The local official OpenAPI spec documents notification payload shape, subscription setup, and callback URL, but does not document a signature header or HMAC scheme.
   - What's unclear: Whether `x-tikkie-signature` in `lib/integrations/tikkie/webhook.ts` is provider-supported, sandbox-only, or project-local hardening.
   - Recommendation: Plan validation in sandbox before making signature verification mandatory in production rollout; keep the current optional-secret approach unless verified.

2. **Should stale-badge behavior differ for open vs terminal links?**
   - What we know: Operators explicitly want recency metadata and a subtle stale badge; only `created` links materially need trust/freshness.
   - What's unclear: Exact threshold/writing is product judgment rather than provider contract.
   - Recommendation: Use `created` links only, badge after 30 minutes without refresh, wording `Status check stale`; treat `paid` and `expired` as terminal and do not badge unless no check has ever succeeded.

3. **Will Phase 6 include scheduling/automation for status-sync, or only manual refresh plus existing job endpoint?**
   - What we know: The repo already has `POST /api/jobs/tikkie/status-sync`, and Tikkie docs recommend implementing GET monitoring in addition to notifications.
   - What's unclear: Whether deployment infrastructure already exists for cron/scheduled invocation.
   - Recommendation: Plan manual refresh and job correctness as required; make scheduled invocation a small optional hardening task only if deployment support is already present.

## Sources

### Primary (HIGH confidence)
- `/vercel/next.js/v16.1.6` via Context7 - Route Handlers, request headers, dynamic rendering, and `fetch(..., { cache: "no-store" })`
- `/prisma/docs/__branch__v6.19.0` via Context7 - Nested writes, relations, and upsert patterns relevant to transition-event persistence
- `https://developer.abnamro.com/api-products/tikkie` - Tikkie product overview, production prerequisites, supported use cases, and current version `2.3.3`
- `https://developer.abnamro.com/api-products/tikkie/release-notes` - Current release notes confirming version `2.3.3`
- `TikkieAPI_v2.yaml` (official OpenAPI spec checked into repo) - Payment-request endpoints, notification subscription constraints, field validation, and status enum details
- `app/api/dashboard/tikkie-links/route.ts` - Current protected create/list/refresh implementation
- `lib/domain/finance/tikkie-links.ts` - Current canonical mapping, transition guards, and sync logic
- `app/dashboard/reconciliation/page.tsx` - Current primary operator entry point and latest-link row actions
- `app/dashboard/attendees/[attendeeId]/page.tsx` - Current attendee payment-history surface
- `lib/domain/finance/attendee-detail.ts` - Current order-centric payment-history aggregation
- `prisma/schema.prisma` - Current Tikkie link and transition schema

### Secondary (MEDIUM confidence)
- `.planning/deferred-phases/04-tikkie-collection-workflow/04-DISCOVERY.md` - Earlier internal discovery that still matches the verified official contract

### Tertiary (LOW confidence)
- Recommended 30-minute stale threshold and badge wording - product recommendation inferred from current operator workflow; not provider-documented

## Metadata

**Confidence breakdown:**
- Standard stack: HIGH - Official provider docs/spec plus exact repo versions in `package.json`
- Architecture: HIGH - Verified against existing implementation and framework docs
- Pitfalls: HIGH - Derived from official Tikkie constraints and current repo behavior; stale-threshold wording remains MEDIUM/LOW product judgment

**Research date:** 2026-03-20
**Valid until:** 2026-04-19
