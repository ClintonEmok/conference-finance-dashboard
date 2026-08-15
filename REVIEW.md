---
phase: communications-center
reviewed: 2026-08-15T00:00:00Z
depth: deep
files_reviewed: 5
files_reviewed_list:
  - components/dashboard/communications/communications-workspace.tsx
  - components/dashboard/communications/broadcasts-panel.tsx
  - convex/emailBroadcasts.ts
  - tests/communications/communications-workspace.test.ts
  - convex/email-broadcast.handlers.test.ts
findings:
  critical: 5
  warning: 7
  info: 0
  total: 12
status: issues_found
---

# Communications Center: Code Review Report

**Reviewed:** 2026-08-15T00:00:00Z  
**Depth:** deep  
**Files Reviewed:** 5  
**Status:** issues_found

## Summary

The audience search implementation itself performs case-insensitive matching across the fully computed audience, so filtering after `computeAudience` is the correct way to make `total` represent all matching recipients rather than only the first preview page. The search test also exercises name, email, reference, case-insensitivity, and no-match behavior. However, the submitted surface has blocking product and data-safety defects: there is no way to create/send a broadcast, integration-event audiences are not rejected, and a negative `limit` bypasses the advertised 200-row cap. Delivery tracking is also incomplete, timestamps are hydration-sensitive, and the tests do not exercise the React behavior they claim to cover.

The two targeted test commands passed (22 Convex handler tests and 14 communications structure tests), but the structural tests are largely source-string checks and do not protect against the runtime issues below.

## Critical Issues

### CR-01: Communications Center cannot create or send a broadcast

**Severity:** blocker  
**Classification:** BLOCKER  
**File:** `/Users/clintonemok/Work/2026/Church/Deeper Stack/conference-finance-dashboard/components/dashboard/communications/communications-workspace.tsx:87-163`

**Issue:** The workspace only wires `cancelEmailBroadcast` and `retryFailedEmailBroadcast`, and renders an audience preview plus history/detail panel. It never calls `scheduleEmailBroadcast` and has no compose, explicit confirmation, or send control. The only current UI path for the Communications Center therefore cannot execute the broadcast workflow required by the project convention; the test at `tests/communications/communications-workspace.test.ts:25-34` actively codifies the missing send surface.

**Fix:** Restore a compose/send flow in this page (or link to the actual sender), require an explicit confirmation, and call `api.emailBroadcasts.scheduleEmailBroadcast` with the selected audience filters and `authorize: true`.

### CR-02: Audience preview exposes integration-event recipient PII

**Severity:** blocker  
**Classification:** BLOCKER  
**File:** `/Users/clintonemok/Work/2026/Church/Deeper Stack/conference-finance-dashboard/convex/emailBroadcasts.ts:231-255`

**Issue:** `previewAudience` checks only that the caller is authenticated and that the event exists. It never calls the local `assertInternalEvent` guard, despite returning booker names, normalized email addresses, and booking references and despite `scheduleEmailBroadcast` rejecting non-internal events at line 367. An authenticated caller can therefore use the Communications query against an integration event and retrieve an audience that the broadcast feature is explicitly not allowed to use.

**Fix:** Call `assertInternalEvent(event)` before `computeAudience`, or return an explicit unsupported-event result; add an integration-event test that verifies no recipient data is returned.

### CR-03: Negative `limit` bypasses the 200-recipient preview cap

**Severity:** blocker  
**Classification:** BLOCKER  
**File:** `/Users/clintonemok/Work/2026/Church/Deeper Stack/conference-finance-dashboard/convex/emailBroadcasts.ts:265-270`

**Issue:** `Math.min(limit ?? 200, 200)` clamps only the upper bound. An authenticated caller can pass `limit: -1`; `matched.slice(0, -1)` then returns every matching recipient except the last, bypassing the documented 200-row response limit. This also makes the public query contract inconsistent for negative or non-integer values.

**Fix:** Validate `limit` as a finite non-negative integer and clamp both bounds, for example `Math.max(0, Math.min(Math.floor(limit ?? 200), 200))`, or reject invalid values with an argument validator.

### CR-04: Cancellation does not stop an in-flight batch

**Severity:** blocker  
**Classification:** BLOCKER  
**File:** `/Users/clintonemok/Work/2026/Church/Deeper Stack/conference-finance-dashboard/convex/emailBroadcasts.ts:446-462`; cross-file execution in `/Users/clintonemok/Work/2026/Church/Deeper Stack/conference-finance-dashboard/convex/emailBroadcastActions.ts:21-105`

**Issue:** The mutation only changes the broadcast status to `cancelled`. `processBatch` reads a queued/sending job once, fetches a batch, and then sends every recipient without rechecking status. If an operator cancels after that read, the already-running batch still sends mail and records outcomes for a broadcast shown as cancelled.

**Fix:** Make recipient claiming/cancellation atomic, or re-read/claim each batch before sending and stop processing as soon as cancellation is observed; add a deterministic concurrent-cancel test.

### CR-05: Initial selection can retain a stale broadcast ID

**Severity:** blocker  
**Classification:** BLOCKER  
**File:** `/Users/clintonemok/Work/2026/Church/Deeper Stack/conference-finance-dashboard/components/dashboard/communications/communications-workspace.tsx:99-120`

**Issue:** The selection effect only initializes when `selectedBroadcastId` is falsy. It never clears or revalidates an ID when the event/history context changes. The stale ID is then passed to detail queries and to cancel/retry mutations, so a preserved component state can display or mutate a broadcast from the previous event.

**Fix:** Reset selection when `event._id` changes and require the selected ID to belong to the current event/history before enabling detail actions; preferably keep the state typed as `Id<"emailBroadcasts"> | null` and key/remount the workspace by event ID.

## Warnings

### WR-01: Delivery-status table is only a partial and misleading view

**Severity:** major  
**Classification:** WARNING  
**File:** `/Users/clintonemok/Work/2026/Church/Deeper Stack/conference-finance-dashboard/components/dashboard/communications/broadcasts-panel.tsx:194-206,464-509`; `/Users/clintonemok/Work/2026/Church/Deeper Stack/conference-finance-dashboard/convex/emailBroadcasts.ts:315-339`

**Issue:** The query fetches at most 300 recipients, the UI renders only the first 100, and the label says `Showing the first 100 of {recipients.length}`. For broadcasts up to 2,000 recipients this is not the broadcast's total, and status-filtered views are likewise only counts over the fetched subset. Operators cannot inspect the complete delivery status.

**Fix:** Add cursor pagination (or a server-side status summary plus paged rows), and display the actual total from the broadcast/query rather than the locally fetched array length.

### WR-02: Timestamp rendering can disagree between SSR and hydration

**Severity:** major  
**Classification:** WARNING  
**File:** `/Users/clintonemok/Work/2026/Church/Deeper Stack/conference-finance-dashboard/components/dashboard/communications/broadcasts-panel.tsx:157-174`

**Issue:** `toLocaleDateString` and `toLocaleString` specify `en-GB` but not a timezone. The client component may be server-rendered in Vercel's timezone and hydrated in the operator's local timezone, producing hydration mismatches and different displayed dates/times.

**Fix:** Format with an explicit event timezone (pass it through the query/detail data), or render these values client-only after mount if local-time display is intentional.

### WR-03: Skip counts no longer describe the displayed audience

**Severity:** major  
**Classification:** WARNING  
**File:** `/Users/clintonemok/Work/2026/Church/Deeper Stack/conference-finance-dashboard/convex/emailBroadcasts.ts:129-156,224-270`; `/Users/clintonemok/Work/2026/Church/Deeper Stack/conference-finance-dashboard/components/dashboard/communications/communications-workspace.tsx:227-240`

**Issue:** `total` is now the number of search matches, but `skippedNoEmail` and `skippedNoRef` are counted before the status/date/location/ticket filters and are returned unchanged after search. The UI can therefore show “1 booker” alongside hundreds of skipped rows from outside the current search/filter scope, which makes the audience summary internally misleading.

**Fix:** Compute exclusion counts for the same effective audience/search, or explicitly label them as unfiltered event-wide exclusions and keep them separate from the filtered total.

### WR-04: Mutation failures are unhandled and actions have no in-flight state

**Severity:** minor  
**Classification:** WARNING  
**File:** `/Users/clintonemok/Work/2026/Church/Deeper Stack/conference-finance-dashboard/components/dashboard/communications/communications-workspace.tsx:113-120`

**Issue:** `handleCancel` and `handleRetry` await mutations without catching errors or exposing pending state. Because the returned promise is used directly as a button handler, a network/server rejection becomes an unhandled promise with no operator feedback, and repeated clicks can race the mutation.

**Fix:** Track each mutation's pending state, disable the relevant button while pending, and catch errors to show a toast/inline alert.

### WR-05: Manual casts bypass the Convex API's type contract

**Severity:** minor  
**Classification:** WARNING  
**File:** `/Users/clintonemok/Work/2026/Church/Deeper Stack/conference-finance-dashboard/components/dashboard/communications/communications-workspace.tsx:80-85,115,120`; `/Users/clintonemok/Work/2026/Church/Deeper Stack/conference-finance-dashboard/components/dashboard/communications/broadcasts-panel.tsx:189-206,389-391`

**Issue:** Query results and IDs are repeatedly forced into hand-written shapes with `as AudiencePreview`, `as BroadcastHistoryItem[]`, `as Id<"emailBroadcasts">`, and `as AudienceFilters`. The stored broadcast `filters` field is `v.any()`, so the cast can hide schema/API drift and lets malformed historical data reach `describeFilters` without validation.

**Fix:** Use the generated `useQuery`/`useMutation` types directly, type selection state as the generated ID, and validate/normalize the persisted filter object before rendering it.

### WR-06: Structural tests provide false confidence about React behavior

**Severity:** minor  
**Classification:** WARNING  
**File:** `/Users/clintonemok/Work/2026/Church/Deeper Stack/conference-finance-dashboard/tests/communications/communications-workspace.test.ts:14-146`

**Issue:** Every assertion reads source text and checks `toContain`/`not.toContain`. These tests do not render the components or verify hook dependencies, the search-reset effect, reveal-button behavior, selected-ID transitions, unique row keys, loading/error states, or mutation calls. A dead/commented implementation can satisfy many of them.

**Fix:** Add runtime component tests with mocked Convex hooks for search changes, reveal clicks, history selection, and cancel/retry calls; retain only a small number of source-contract tests where necessary.

### WR-07: The new search test does not prove search occurs before the preview limit

**Severity:** minor  
**Classification:** WARNING  
**File:** `/Users/clintonemok/Work/2026/Church/Deeper Stack/conference-finance-dashboard/convex/email-broadcast.handlers.test.ts:444-477`

**Issue:** The test title claims whole-audience search, but it seeds only two bookers, so an implementation that sliced to 200 before searching would pass. It also does not test search combined with audience filters or the meaning of skip counts.

**Fix:** Seed more than 200 recipients with the matching record after the first 200, assert it is returned with `total === 1`, and add combined-filter and exclusion-count cases.

---

_Reviewed: 2026-08-15T00:00:00Z_  
_Reviewer: the agent (gsd-code-reviewer)_  
_Depth: deep_

**Verdict: CHANGES_REQUIRED**
