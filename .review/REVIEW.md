---
phase: branch-d085ae3-to-27820d7
reviewed: 2026-08-20T12:17:37Z
depth: deep
files_reviewed: 19
files_reviewed_list:
  - convex/_generated/api.d.ts
  - convex/_generated/dataModel.d.ts
  - convex/autoSync.ts
  - convex/crons.ts
  - convex/emailActions.ts
  - convex/emailBroadcastActions.ts
  - convex/finance.ts
  - convex/orders.ts
  - convex/payment-sync.handlers.test.ts
  - convex/payments.ts
  - convex/schema.ts
  - convex/sync.ts
  - convex/sync/internal.ts
  - convex/tikkie-payment-matching.optimization.test.ts
  - lib/domain/finance/payment-matching.ts
  - lib/email/templates/announcement.test.ts
  - lib/email/templates/announcement.tsx
  - tests/finance/tikkie-matching.performance.test.ts
  - tests/finance/tikkie-polling.test.ts
findings:
  critical: 10
  warning: 5
  info: 0
  total: 15
status: issues_found
---

# Phase branch-d085ae3-to-27820d7: Code Review Report

**Reviewed:** 2026-08-20T12:17:37Z  
**Depth:** deep  
**Files Reviewed:** 19  
**Status:** issues_found

## Summary

**Verdict: BLOCK.** The branch is not safe to ship: it can permanently omit Tikkie links/payments, duplicate legacy payments, misassign bank transfers across events, and display incorrect payment totals when legacy provider-order aliases are involved. It also leaves the live dashboard “Sync Tikkie” path on the older unsafe matcher. The announcement-email booking-reference wiring itself is present, but its action/broadcast path is not behavior-tested.

Verification: `npm test -- --run` passed (552 tests, 5 skipped); `npm run typecheck` passed. Repository lint remains non-green (140 errors, 218 warnings across 112 files); targeted changed-file lint reports 4 errors and 6 warnings, including existing `any`/unused declarations.

## Critical Issues

### CR-01: Active Tikkie links are permanently starved after the first 50

**Severity:** BLOCKER  
**File:** `convex/sync/internal.ts:168-189`; `convex/autoSync.ts:245-269`  
**Issue:** The loader takes only 100 `created` and 100 `paid` links, sorts them, and then returns only 50. There is no cursor or rotation. Open links whose `statusUpdatedAt` does not change remain outside that first 50 forever, so their payments are never polled or recorded.
**Fix:** Paginate all active event links, or persist a fair polling cursor/priority based on `providerLastCheckedAt`; do not silently discard links beyond a fixed first page.

### CR-02: Removing cleanup from the sync transaction can duplicate legacy payments

**Severity:** BLOCKER  
**File:** `convex/autoSync.ts:238-276`; `convex/crons.ts:6-17`; `convex/payments.ts:104-107,845-876`  
**Issue:** The base sync cleaned legacy Tikkie rows immediately before upserting. HEAD moves cleanup to an independent hourly cron with no ordering guarantee. If a sync runs first, a legacy row whose `sourceId` is still missing is not found and a new row is inserted; the later cleanup can then assign the same provider token to both rows. The schema has no uniqueness constraint to prevent this.
**Fix:** Run the migration/cleanup before every upsert until completion, or make the upsert atomically identify legacy payload tokens and enforce a unique `(source, sourceId)` invariant before enabling the new cron.

### CR-03: Provider-order aliases still produce zero payment totals on UI projections

**Severity:** BLOCKER  
**File:** `convex/payments.ts:279-285`; `convex/publicTracking.ts:47-57,105-115`; `convex/reports.ts:153-164,200-206`; `components/dashboard/orders/order-detail-surface.tsx:101-107,189-220`  
**Issue:** The new alias-aware `loadMatchedPaymentTotalsByOrderId` is not the source for the order-detail payment list, public tracking, or region reports. Those paths query only `payments.orderId === canonicalOrderId`. A legacy payment assigned under `providerOrderId` is therefore absent from the UI, even though the new ledger/reconciliation test and `getPaymentSummary` report it as paid. The order-detail UI computes its totals from `getPayments`, not from `getPaymentSummary`.
**Fix:** Centralize alias resolution and deduplicated payment-row loading, including the Ticket Tailor extension alias, and use it in every payment projection. Add tests for `getPayments`, public tracking, and reports with provider-keyed payment rows.

### CR-04: Event-scoped auto-match still cross-matches bank transfers

**Severity:** BLOCKER  
**File:** `convex/payments.ts:688-694,734-749`  
**Issue:** `autoMatchPayments({ eventId: A })` loads all unassigned bank transfers, including transfers for event B, then compares them with event A orders and overwrites the matched payment’s `eventId` with A. A name/amount collision can permanently assign a payment to the wrong event.
**Fix:** Query bank transfers by the requested event, or leave rows without a trusted event scope for explicit manual review. Never match a global bank-transfer set against one event’s candidate orders.

### CR-05: Canonical order IDs lose to provider aliases during mutation resolution

**Severity:** BLOCKER  
**File:** `convex/payments.ts:189-217`  
**Issue:** `resolveCanonicalOrderId` searches `orders.providerOrderId` before normalizing and loading the canonical Convex order ID. Because provider IDs are arbitrary strings and not constrained to be distinct from Convex IDs, a canonical ID that is also another order’s provider alias resolves to the wrong order. This is inconsistent with the canonical-first lookup in `getPaymentSummary` and can misassign a payment.
**Fix:** Resolve a valid existing canonical order ID first; only fall back to an exact provider alias when canonical resolution fails, and reject ambiguous collisions.

### CR-06: A malformed link event ID can abort all auto-matching

**Severity:** BLOCKER  
**File:** `convex/autoSync.ts:354-363`; `convex/sync/internal.ts:36-55`; `convex/payments.ts:841-844`  
**Issue:** `tikkiePaymentLinks.eventId` is an optional arbitrary string, but the action filters only on truthiness and casts each value to `Id<"events">`. A legacy/provider event string is passed to an internal query whose validator requires a Convex event ID, so the matching phase throws after ingestion. The outer action catch only logs the error, making the cron appear successful while all matching is skipped.
**Fix:** Normalize and validate event IDs in the query/action boundary; skip and report malformed links individually. Do not use a truthiness type cast, and return/rethrow a failed sync result when the matching phase cannot run.

### CR-07: The live dashboard sync still uses the unsafe legacy Tikkie pipeline

**Severity:** BLOCKER  
**File:** `lib/domain/finance/tikkie-sync.ts:57-99`; `lib/domain/finance/payments.ts:362-420,439-483`; `app/dashboard/payments/page.tsx:107-133`  
**Issue:** The dashboard’s “Sync Tikkie” button still calls the old Next route. That path fetches one page only, does not persist event IDs/checkpoints, and matches all unassigned payments against globally fetched `paid` orders using name-only matching; it does not enforce amount compatibility or the new event boundary. The safer Convex cron path is not used by this still-live operator workflow.
**Fix:** Route manual sync through the same paginated, event-scoped, amount-safe pipeline as the cron, or remove/disable the legacy route. There must be one matching implementation and one polling contract.

### CR-08: Extension-only provider IDs are omitted before alias-aware totals are calculated

**Severity:** BLOCKER  
**File:** `convex/orders.ts:480-501,1044-1092`; `convex/payments.ts:772-790`  
**Issue:** The schema makes `orders.providerOrderId` optional while `ticketTailorOrders.providerOrderId` is required. `getOrdersForReconciliation` and `syncFullyPaidOrders` call the alias-aware loader with core orders before merging extensions; `getPaymentSummary` also reads only the core order. For a valid legacy row with the provider ID only on the extension, provider-keyed payments are not counted and the order can remain outstanding/unpaid.
**Fix:** Merge the extension/provider alias before every payment-total calculation, or make the shared loader resolve the extension itself. Backfill the canonical field only as a controlled migration, not as an assumption.

### CR-09: Event-scoped matching has non-advancing 500-row caps

**Severity:** BLOCKER  
**File:** `convex/sync/internal.ts:36-55,67-86`  
**Issue:** Each event’s unassigned Tikkie payments and candidate orders are read with `.take(500)` and no continuation. The auto-sync action matches only those rows. Once an event exceeds the cap, a stable first page is repeatedly processed and later payments/orders can remain unmatched indefinitely.
**Fix:** Paginate or schedule bounded continuation mutations/actions with a cursor, and report incomplete batches. Do not treat a capped page as the complete event set.

### CR-10: Provider-order lookup exposes personal order data without authentication

**Severity:** BLOCKER  
**File:** `convex/orders.ts:129-151`; `convex/payments.ts:306-312`  
**Issue:** `getOrderByProviderId` does not call `requireIdentity` and returns the merged order/extension, including buyer contact data, to any caller who knows or guesses a provider order ID. `getPaymentById` likewise has no identity check and returns payment/account/provider payload data. Provider IDs are not an authorization factor.
**Fix:** Require an authenticated operator (and preferably an explicit role) for both queries, or make them internal and expose only a narrowly scoped, ownership-checked projection through the intended route.

## Warnings

### WR-01: Tikkie pagination can loop forever on a non-progressing page

**Severity:** WARNING  
**File:** `convex/autoSync.ts:75-98`  
**Issue:** The loop continues while `payments.length < totalElementCount` without verifying that `response.payments` is an array with progress. A response claiming a positive total with an empty page causes unbounded page requests and prevents the action from completing.
**Fix:** Validate `Array.isArray(response.payments)`, throw on an empty non-final page, and enforce a maximum page count derived from `totalElementCount` and page size.

### WR-02: Public payment pagination discards its continuation cursor

**Severity:** WARNING  
**File:** `convex/payments.ts:295-303`  
**Issue:** `getPayments` accepts `paginationOpts` but returns only `.page` under an array validator. Callers cannot obtain `continueCursor`, so any caller using the advertised pagination argument silently receives only the first page.
**Fix:** Either remove `paginationOpts` from this array-returning contract or return the complete Convex pagination object and update every consumer to page it.

### WR-03: Account tie-breaking does not see provider-keyed historical payments

**Severity:** WARNING  
**File:** `convex/sync/internal.ts:88-102`; `convex/payments.ts:713-731`  
**Issue:** The new account-number hint is built by querying only `payments.orderId = canonicalOrderId`. Historical Tikkie payments assigned under `providerOrderId` are invisible, so the intended unique-account tie-breaker remains ambiguous for precisely the legacy records the alias work is meant to preserve.
**Fix:** Load prior payment account numbers through the same canonical/provider alias set, including the extension alias, and deduplicate payment IDs.

### WR-04: The announcement booking-reference change lacks end-to-end behavior coverage

**Severity:** WARNING  
**File:** `lib/email/templates/announcement.test.ts:24-47`; `convex/emailBroadcastActions.ts:57-69`; `convex/emailActions.ts:275-326`  
**Issue:** The new test renders only the React HTML template. It does not verify the broadcast recipient’s `bookingRef` reaches the sender, nor that the plain-text multipart body contains it. A regression in the action wiring can therefore pass all new tests despite the email sent to users omitting the reference.
**Fix:** Mock the Resend component and exercise both `sendAnnouncementTest` and `processBatch`, asserting the HTML and text payloads contain the recipient-specific reference.

### WR-05: Fatal auto-sync failures are swallowed as successful cron executions

**Severity:** WARNING  
**File:** `convex/autoSync.ts:349-379`  
**Issue:** Per-link failures are collected, but failures in the matching phase hit the outer catch and are only logged; the action returns normally and emits no partial result. Monitoring/scheduler retry behavior cannot distinguish a completed sync from one that ingested payments but skipped all matching.
**Fix:** Return a structured failure/partial result and/or rethrow after durable error recording so the cron is observable and retryable.

---

_Reviewed: 2026-08-20T12:17:37Z_  
_Reviewer: the agent (gsd-code-reviewer)_  
_Depth: deep_
