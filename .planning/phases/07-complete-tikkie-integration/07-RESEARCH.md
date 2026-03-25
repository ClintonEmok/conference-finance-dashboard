# Phase 7: complete-tikkie-integration - Research

**Researched:** 2026-03-21
**Domain:** Tikkie provider-authoritative status retrieval, subscription readiness, and operational safety
**Confidence:** HIGH

## Summary

Phase 7 should be planned as a hardening/completion phase on top of the existing Phase 6 implementation, not a rebuild. The project already has the core shape in place: a typed Tikkie client (`lib/integrations/tikkie/client.ts`), domain orchestration (`lib/domain/finance/tikkie-links.ts`), fallback job polling (`app/api/jobs/tikkie/status-sync/route.ts`), and webhook ingestion (`app/api/webhooks/tikkie/route.ts`). The remaining gap is to make provider refresh explicitly authoritative from `GET /paymentrequests/{paymentRequestToken}` and to add safe, disabled-by-default subscription setup for `/paymentrequestssubscription`.

The local OpenAPI contract (`TikkieAPI_v2.yaml`, version `2.3.3`) confirms the exact endpoints and constraints needed for this phase: `GET /paymentrequests/{paymentRequestToken}` exists and returns a `PaymentRequest` object, `POST /paymentrequestssubscription` exists and overwrites the current payment-request subscription when repeated, and notification delivery is best effort with max 3 attempts (provider explicitly recommends also implementing GET monitoring). This supports a design of webhook-fast-path plus GET-based recovery as the source of truth.

Primary planning guidance: keep the existing modules, tighten the refresh contract around provider `GET` request state, add idempotent/guarded subscription provisioning behind a non-production toggle, and formalize retries/observability so failures are safe and diagnosable.

**Primary recommendation:** Implement status refresh around `GET /paymentrequests/{paymentRequestToken}` as authoritative provider truth, keep webhook + job polling as delivery mechanisms (not truth), and add a guarded `POST /paymentrequestssubscription` setup path that is prepared now but disabled in production by default.

## Standard Stack

The established libraries/tools for this domain:

### Core
| Library | Version | Purpose | Why Standard |
|---------|---------|---------|--------------|
| Tikkie API | 2.3.3 | Payment request retrieval and notification subscription setup | Official provider contract; endpoints and behavior confirmed in `TikkieAPI_v2.yaml` |
| Next.js | 16.1.7 | Route Handlers for job/webhook/admin setup endpoints | Existing app framework and API pattern |
| Prisma | 6.19.0 | Durable status state, dedupe keys, transition audit records | Existing persistence model already has unique notification-key idempotency |
| Better Auth | 1.5.5 | Protect operator-triggered jobs/setup endpoints | Existing auth gate pattern in job routes |

### Supporting
| Library | Version | Purpose | When to Use |
|---------|---------|---------|-------------|
| Native `fetch` | Runtime built-in | Calls to Tikkie API | Keep using `lib/integrations/tikkie/client.ts`; no SDK required |
| Node `crypto` | Runtime built-in | Optional webhook signature verification | Keep for optional `TIKKIE_WEBHOOK_SECRET` flow |

### Alternatives Considered
| Instead of | Could Use | Tradeoff |
|------------|-----------|----------|
| Current in-repo `fetch` adapter | Third-party Tikkie wrapper | Adds drift/risk from verified OpenAPI contract with little benefit |
| Persisted dedupe in DB | In-memory dedupe | In-memory breaks across deploys/restarts and parallel instances |
| Webhook-only updates | Poll-only updates | Neither alone is reliable enough; provider explicitly states webhook is best effort |

**Installation:**
```bash
# No new package required for planned Phase 7 scope.
```

## Architecture Patterns

### Recommended Project Structure
```text
app/api/
├── jobs/tikkie/status-sync/route.ts          # Poll pending links in bounded batches
├── webhooks/tikkie/route.ts                  # Receive and verify provider notifications
└── (new) admin/tikkie/subscription/route.ts  # Optional setup endpoint (disabled in prod)

lib/
├── integrations/tikkie/client.ts             # Typed provider endpoints (GET payment request + POST subscription)
└── domain/finance/tikkie-links.ts            # Status resolution, transition guards, retry orchestration
```

### Pattern 1: Provider-Authoritative Refresh by Payment Request Token
**What:** Refresh uses provider response from `GET /paymentrequests/{paymentRequestToken}` as the canonical source for link state checks.
**When to use:** In webhook-triggered refresh, dashboard manual refresh, and status-sync job.
**Example:**
```typescript
// Source: TikkieAPI_v2.yaml (paths./paymentrequests/{paymentRequestToken}.get)
const request = await getPaymentRequest(token)

const isPaid =
  (request.numberOfPayments ?? 0) > 0 ||
  (request.totalAmountPaidInCents ?? 0) > 0

const nextStatus = isPaid
  ? "paid"
  : request.status === "OPEN"
    ? "created"
    : "expired"
```

### Pattern 2: Webhook/Job as Triggers, Not Truth
**What:** Webhook and polling only trigger refresh actions; they do not directly set final state without provider reconciliation.
**When to use:** All incoming notifications and scheduled/manual sync runs.
**Example:**
```typescript
// Source: Existing project pattern + Tikkie docs note on best-effort notifications
await refreshTikkiePaymentLinkStatus({
  paymentRequestToken,
  source: "webhook", // or "poll"
  reason: "notification:PAYMENT",
  providerNotificationKey,
})
```

### Pattern 3: Subscription Setup as Controlled Infrastructure Action
**What:** Add a dedicated setup path for `POST /paymentrequestssubscription`; do not run this during normal link generation.
**When to use:** Manual/ops setup (sandbox first), and future automated environment bootstrap.
**Example:**
```typescript
// Source: TikkieAPI_v2.yaml (paths./paymentrequestssubscription.post)
await subscribePaymentRequestNotifications({
  url: "https://example.com/api/webhooks/tikkie",
})
```

### Pattern 4: Idempotent State Transitions with Durable Keys
**What:** Keep `providerNotificationKey` uniqueness and monotonic transition rules (`created -> paid|expired`, never `paid -> created`).
**When to use:** Every refresh call, especially webhook duplicate deliveries.
**Example:**
```typescript
// Source: prisma/schema.prisma + lib/domain/finance/tikkie-links.ts
const seen = await prisma.tikkiePaymentLinkTransition.findUnique({
  where: { providerNotificationKey },
})
if (seen) return { duplicate: true }
```

### Anti-Patterns to Avoid
- **Webhook-only status trust:** Tikkie explicitly says notifications are best effort and GET monitoring should exist.
- **Per-link subscription creation:** `POST /paymentrequestssubscription` overwrites existing subscription; this is app-level setup, not order workflow.
- **Unbounded retry loops:** Retry only transient failures with cap/backoff; never infinite retry in request path.
- **Direct status writes from raw webhook payload:** Always reconcile against provider endpoint before persisting final state.

## Don't Hand-Roll

Problems that look simple but have existing solutions:

| Problem | Don't Build | Use Instead | Why |
|---------|-------------|-------------|-----|
| Notification dedupe | Custom process-memory cache | `TikkiePaymentLinkTransition.providerNotificationKey @unique` | Survives restarts and parallel workers |
| Update-or-create payment links | Manual `find` + `if/else create/update` races | Prisma `upsert` with unique token | Reduces race windows and keeps idempotent writes |
| Provider request plumbing | Endpoint calls spread across routes | Centralized `lib/integrations/tikkie/client.ts` | Shared headers/error mapping and easier retry policy |
| Job scope control | Poll all records each run | Existing `limit` + pending-only selection | Prevents runaway API pressure |

**Key insight:** Reliability comes from durable idempotency + bounded retries + provider-authoritative reconciliation, not from adding more status flags.

## Common Pitfalls

### Pitfall 1: Assuming webhook delivery is guaranteed
**What goes wrong:** Links stay `created` too long after missed callbacks.
**Why it happens:** Tikkie notification delivery is best effort with max three attempts.
**How to avoid:** Keep polling/job refresh active for open links and reconcile with provider GET.
**Warning signs:** Old `created` links with stale `providerLastCheckedAt` despite expected payments.

### Pitfall 2: Accidentally replacing a working subscription
**What goes wrong:** Notifications silently move to wrong callback URL.
**Why it happens:** Repeated `POST /paymentrequestssubscription` overwrites the existing subscription.
**How to avoid:** Gate setup route, require explicit operator action and environment toggle, log target URL and response `subscriptionId`.
**Warning signs:** Sudden webhook drop after deploy/config change.

### Pitfall 3: Retrying non-retriable failures
**What goes wrong:** Wasteful retries and noisy logs on deterministic 4xx errors.
**Why it happens:** Same retry policy applied to all statuses.
**How to avoid:** Retry only transient classes (timeouts/network/5xx, optionally 429), fail fast on 400/401/403/404.
**Warning signs:** Repeated identical 4xx errors in sync jobs.

### Pitfall 4: Missing traceability for upstream failures
**What goes wrong:** Hard to debug provider incidents.
**Why it happens:** Response metadata (like `Trace-Id`) not captured or logged.
**How to avoid:** Record and surface provider trace identifiers in diagnostics payload/logging paths.
**Warning signs:** Upstream errors with no correlation IDs in logs.

## Code Examples

Verified patterns from official/project sources:

### Confirmed Tikkie Endpoints (from local OpenAPI)
```yaml
# Source: TikkieAPI_v2.yaml
paths:
  /paymentrequests/{paymentRequestToken}:
    get:
      operationId: getPaymentRequest

  /paymentrequestssubscription:
    post:
      operationId: subscribePaymentRequestNotifications
```

### Tikkie Notification Reliability Note
```text
# Source: TikkieAPI_v2.yaml (paymentrequestssubscription POST description)
The notification system will follow a best-effort approach to deliver notifications.
It employs a retry mechanism with a maximum of three attempts.
However, you should not rely solely on notifications and are encouraged to have a GET implemented.
```

### Prisma Idempotency/Error Handling
```typescript
// Source: /prisma/docs (Context7) - unique constraints + PrismaClientKnownRequestError
try {
  await prisma.model.create({ data })
} catch (e) {
  if (e instanceof Prisma.PrismaClientKnownRequestError && e.code === "P2002") {
    // duplicate; treat as idempotent success path where appropriate
  }
}
```

### Next.js Route Handler Caching Behavior (v16)
```typescript
// Source: /vercel/next.js/v16.1.6 (Context7)
// GET route handlers are not cached by default in modern Next.js.
// Keep provider refresh routes dynamic by default.
export async function GET() {
  return Response.json({ ok: true })
}
```

## State of the Art

| Old Approach | Current Approach | When Changed | Impact |
|--------------|------------------|--------------|--------|
| Route-triggered refresh calling multiple provider endpoints (`GET payment request` + `GET payments`) | Provider-authoritative refresh centered on `GET /paymentrequests/{paymentRequestToken}` fields, with optional secondary check only if needed | Phase 7 target | Lower API load, clearer source-of-truth contract |
| Webhook as primary status mechanism | Webhook + poll both trigger provider reconciliation | Tikkie v2.3.3 guidance | More robust against missed callbacks |
| No explicit subscription management flow | Controlled setup endpoint for `POST /paymentrequestssubscription` (prepared but disabled in prod) | Phase 7 target | Safer rollout path for production webhook lifecycle |

**Deprecated/outdated:**
- Treating webhook payload alone as final status truth.
- Treating subscription creation as part of payment-link generation flow.

## Open Questions

1. **Should paid detection rely only on `PaymentRequest` fields or keep `/payments` fallback?**
   - What we know: `PaymentRequest` schema includes `numberOfPayments` and `totalAmountPaidInCents`.
   - What's unclear: Whether these fields are always present across all production edge cases.
   - Recommendation: Plan primary logic on `GET /paymentrequests/{token}`; keep fallback query path as a guarded compatibility option if fields are absent.

2. **What exact production toggle should gate subscription setup?**
   - What we know: Requirement says prepare now, not active in production.
   - What's unclear: Preferred flag naming/location and operational ownership.
   - Recommendation: Add explicit env flag (for example `TIKKIE_SUBSCRIPTION_SETUP_ENABLED=false`) and require authenticated/manual invocation.

3. **Do we require webhook signature verification in production, or keep optional?**
   - What we know: Current code supports optional HMAC via `TIKKIE_WEBHOOK_SECRET`.
   - What's unclear: Official Tikkie header/signature contract visibility in current docs/OpenAPI.
   - Recommendation: Keep optional guard as-is for this phase; validate signature contract in sandbox before enforcing hard-fail in prod.

## Sources

### Primary (HIGH confidence)
- `TikkieAPI_v2.yaml` - endpoint paths, operation IDs, request/response schema, subscription overwrite behavior, notification retry guidance, and header requirements
- `lib/integrations/tikkie/client.ts` - existing provider adapter and current endpoint coverage
- `lib/domain/finance/tikkie-links.ts` - existing refresh/orchestration/idempotency transition logic
- `app/api/jobs/tikkie/status-sync/route.ts` - current poll job contract and limits
- `app/api/webhooks/tikkie/route.ts` - current webhook ingestion contract
- `prisma/schema.prisma` - unique constraints and transition model (`providerNotificationKey @unique`)
- `/prisma/docs` via Context7 - idempotent API design, `upsert`, transactions, unique constraint handling (`P2002`)
- `/vercel/next.js/v16.1.6` via Context7 - route-handler behavior and caching defaults

### Secondary (MEDIUM confidence)
- `tests/tikkie/tikkie-links.test.ts` - established expected behavior around duplicate webhook handling and status-sync route contracts

### Tertiary (LOW confidence)
- Suggested retry matrix details (e.g., include/exclude `429`) where Tikkie docs do not prescribe full client retry policy

## Metadata

**Confidence breakdown:**
- Standard stack: HIGH - Versions and stack are directly verifiable in repo and provider OpenAPI
- Architecture: HIGH - Mapped to existing files and confirmed provider endpoint contracts
- Pitfalls: HIGH - Driven by explicit provider notes and existing implementation behavior

**Research date:** 2026-03-21
**Valid until:** 2026-04-20
