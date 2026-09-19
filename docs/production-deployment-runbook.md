# Production Deployment & Broadcast Runbook — `divine-redesign`

> **Status:** WRITTEN, NOT EXECUTED (Phase 49). This document is a reviewable
> authorization plan. Executing any step that writes to production, deploys,
> runs a migration/backfill against production, or broadcasts requires
> **explicit operator authorization** at the marked gate. Phase 49 performs
> none of them.
>
> Deployments: dev/preview `dev:acoustic-tiger-876` · production
> `https://grateful-pelican-605.convex.cloud` · frontend
> `https://conference.dclm-nl.org` · event `divine-redesign`
> (`n1715ecageahv1500jhtyc5re5841ryx`).

---

## 1. Preflight & Environment Inventory

| Env var | Where | Required by |
| --- | --- | --- |
| `SIGNUP_SUBMISSION_SECRET` | **BOTH** Next server AND Convex backend | signup token gate (OWN-01) |
| `TURNSTILE_SECRET_KEY` | Next server | signup CAPTCHA |
| `RESEND_API_KEY` | Convex (Resend component) | confirmation + announcement emails |
| `RESEND_FROM_NAME` / `RESEND_FROM_EMAIL` | Next server (used by email actions) | email sender identity |
| `NEXT_PUBLIC_SITE_URL` | Next server build | email link URLs |

**Provisioning rule (OWN-01):** `SIGNUP_SUBMISSION_SECRET` must be set on BOTH
runtimes together. Half-provisioned states are: Next-absent/Convex-present →
signups fail closed with `CAPTCHA_REQUIRED`; Next-present/Convex-absent →
signups run degraded with a Convex warning. Provision both, then verify.

## 2. Sanitized Preview Rehearsal (dev only — safe to run)

> These commands target `dev:acoustic-tiger-876` ONLY. They write rows into the
> preview deployment (no delete-undone path) — but never production.
>
> The deployment guard requires an EXACT match between the detected deployment
> URL (`CONVEX_SITE_URL`) and the `allowedDeploymentUrl`, and fails closed
> (no writes) when the deployment identity or allowlist is unavailable. The
> commands below therefore pass the exact site URL
> (`https://acoustic-tiger-876.convex.site`) rather than a selector.

1. **Seed the sanitized preview:**
   ```bash
   npx convex run seedPreviewSimulation \
     --args '{"scope":"full","preview":true,"allowedDeploymentUrl":"https://acoustic-tiger-876.convex.site"}'
   ```
   Expected: 1 event, 51 orders, 116 attendees, 160 slots, 84 rooms, 2 hotels,
   44 legacy assignments, 44 legacy selections; PII-free (preview placeholders).

2. **Verify preview counts** (51/116, 38 orders / 72 attendees with no
   selections, 13 orders / 44 attendees with legacy assignments).

3. **Run the Phase 47 legacy backfill (costly write):**
   ```bash
   npx convex run backfillLegacyAccommodationPreferences \
     --args '{"slug":"divine-redesign","authorize":true,"allowedDeploymentUrl":"https://acoustic-tiger-876.convex.site"}'
   ```
   Expected first run: `ordersResolved: 38`, `attendeesHandled: 72`,
   `ordersAlreadyHandled: 13`, `ordersUnresolved: 0`,
   `assignmentsConverted: 44`.
   Expected re-run: `ordersAlreadyHandled: 51`, `attendeesHandled: 0`,
   `assignmentsConverted: 0` (no-op).

4. **Rehearse signup, manage-booking, and allocation** against the preview:
   submit a signup, edit accommodation via `/booking/[bookingRef]/manage`
   (verify mixed Standard/Superior group rejection), confirm an assignment on
   the allocation board (verify inventory guard + night-before mismatch chip).

5. **Controlled-inbox announcement test-send:**
   ```bash
   npx convex run emailActions:sendAnnouncementTest \
     --args '{"to":"<your@inbox>","title":"...","message":"...","eventName":"Divine Conference","eventDate":"...","eventLocation":"...","manageBookingUrl":"...","signupUrl":"...","paymentUrl":"...","nightBeforeNote":"..."}'
   ```
   Logs `emailType: "announcement_test"`. Never a broadcast.

## 2A. Phase 46/62 Search Rollout (preview rehearsal first)

> **Status: DOCUMENTED, NOT EXECUTED.** This section is the operator procedure
> for indexed search. Phase 62 Stage 1 retired the hand-maintained projection:
> search reads the source tables (`orders`, `orderAttendees`) and the
> projection is unread and unwritten, so no projection backfill exists. The
> preview rehearsal is safe to run only against the exact preview deployment
> URL. The remaining operator-gated production writes for search and legacy
> data (attendee `eventId` repair, legacy accommodation backfill, attendee
> rekey) are named below; no command in this phase executes a production
> seed, backfill, broadcast, or other production write.

### Preview rehearsal (safe, sanitized, and repeatable)

Run the existing internal `seedPreviewSimulation` mutation with the full,
PII-free fixture. The fixture creates **51 orders / 116 attendees** (plus its
audited accommodation shape), so the UI's page size of 25 can prove that
search results continue beyond the first page. Never paste credentials, and do
not substitute a production URL or selector for the preview URL.

```bash
npx convex run seedPreviewSimulation \
  --args '{"scope":"full","preview":true,"allowedDeploymentUrl":"https://<PREVIEW_DEPLOYMENT_SLUG>.convex.site"}'
```

The preview seed is idempotent by stable keys and does not overwrite existing
rows. Re-running it is therefore safe. The preview guard checks `preview: true`
and requires an exact canonical match between the runtime `CONVEX_SITE_URL`
and `allowedDeploymentUrl`; it fails closed before reads or writes when the
deployment identity or allowlist is absent, malformed, or mismatched.

### Stage 1 retirement record (no projection backfill exists)

Phase 62 Stage 1 (D-03) stopped maintaining the derived search projection:
search reads the source tables directly, so **no projection backfill exists
and none is required**. The three projection tables — `searchDocuments`,
`searchProjectionFanoutJobs`, and the already-deprecated
`searchDocumentTerms` — remain in `convex/schema.ts`, unread and unwritten;
nothing in production references them. The event-scoped attendee ledger and
the order-first donation-allocation picker resolve ownership through
`orders.eventId` and `orderAttendees.orderId`, so the additive attendee
`eventId` repair is not required to make those surfaces visible. It remains an
optional compatibility repair for other consumers that explicitly require the
copied field.

**Stage 2 (operator-gated; not attempted in Phase 62):** drop **all three**
tables — `searchDocuments`, `searchProjectionFanoutJobs`, and the
already-`@deprecated` `searchDocumentTerms` — in one operator-gated
migration. Dropping a non-empty table is a destructive deploy, so it must
not be attempted before that migration, and the three must be dropped
together: clearing only some of them compounds the deprecated-table debt
instead of retiring it.

### Attendee `eventId` repair (operator-only)

> ⛔ **OPERATOR AUTHORIZATION REQUIRED.** The additive `orderAttendees.eventId`
> copy (Phase 62, D-06) is written with every new attendee row at all four
> production insert sites. Rows that predate the field can still be repaired
> for compatibility, but the event-scoped attendee ledger and order-first
> donation-allocation picker do not depend on this copy. Phase 62 ran this
> repair against the DEV deployment only (149 rows processed, 149 patched, 0
> skipped; a re-run patched 0). This section documents the optional production
> carry-forward.

The mutation is batched, resumable, and idempotent (rows already carrying
`eventId` are counted and skipped), and it is production-guarded: it fails
closed before any read or write unless `authorize: true` AND the runtime
`CONVEX_SITE_URL` resolves to the exact allowed deployment slug. Start at
`cursor: null`, batch 200, and repeat with each returned opaque `nextCursor`
until `isDone: true`:

```bash
npx convex run backfillAttendeeEventIds \
  '{"cursor":null,"batchSize":200,"authorize":true,"allowedDeploymentUrl":"https://grateful-pelican-605.convex.cloud"}' \
  --prod
# Repeat with each returned nextCursor until isDone:true. A completed pass is
# safe to re-run: the second pass patches 0.
```

Discipline: stop immediately on a guard failure, an invalid cursor, an
unexpected skip diagnostic, or any incomplete pass; investigate before
resuming from the last known-good returned cursor. A `skipped` row with the
diagnostic `eventless or missing order` is left unpatched by design (never
guessed) and must be understood before continuing. Run this only when the
compatibility copy is explicitly required by a separate production consumer.

### Production attendee-key rekey (operator-only)

> ⛔ **OPERATOR AUTHORIZATION REQUIRED.** This repair is separate from the
> attendee `eventId` and legacy-accommodation backfills. It repairs existing
> duplicate or blank `orderAttendees.attendeeKey` values one order at a time;
> it does not alter attendee IDs or any child foreign keys.

Run the guarded migration with `batchSize: 1`, repeating the command with the
returned opaque `nextCursor` until `isDone: true`:

```bash
npx convex run rekeyDuplicateAttendeeKeys \
  '{"cursor":null,"batchSize":1,"authorize":true,"allowedDeploymentUrl":"https://grateful-pelican-605.convex.cloud"}' \
  --prod
```

The response reports `rekeyed` rows and the affected attendee IDs. Stop on an
`ORDER_TOO_LARGE` or any unexpected error; do not invent a cursor. Then run the
read-only verification from `cursor: null`, again continuing until complete:

```bash
npx convex run rekeyDuplicateAttendeeKeys:verifyAttendeeKeys \
  '{"cursor":null,"batchSize":1,"authorize":true,"allowedDeploymentUrl":"https://grateful-pelican-605.convex.cloud"}' \
  --prod
```

Proceed only when `duplicateOrders`, `duplicateAttendees`, and
`blankAttendees` are zero on the complete pass. Re-running the migration is
idempotent and should report `rekeyed: 0`.

## 3. Production Cutover (PRODUCTION — REQUIRES OPERATOR AUTHORIZATION)

> ⛔ **OPERATOR AUTHORIZATION REQUIRED** before executing any of the following.
> Each sub-step is gated individually.

### 3.1 Provision secrets on production (authorization gate A)
> ⛔ **OPERATOR AUTHORIZATION REQUIRED** (gate A).
Set `SIGNUP_SUBMISSION_SECRET` on BOTH the production Next server env and the
production Convex backend (`grateful-pelican-605`) **together**; verify
Turnstile + Resend are already configured. After provisioning, confirm a
signup with a valid token succeeds and a token-less signup is rejected
(`CAPTCHA_REQUIRED`).

### 3.2 Accommodation migration on production (authorization gate B)
> ⛔ **OPERATOR AUTHORIZATION REQUIRED** (gate B). This task performs no production execution — every command below is documented for the operator
> to run later, and each command re-validates authorization on every run.
> The migrations' `authorize` argument is the explicit **write-authorization
> marker**; the deployment-URL guard binds the write to a target. The guard
> requires `authorize: true` AND an EXACT deployment-slug match between the
> detected `CONVEX_SITE_URL` and the `allowedDeploymentUrl` — both
> `https://grateful-pelican-605.convex.cloud` and
> `https://grateful-pelican-605.convex.site` are accepted as the same
> deployment. A suffix, selector, malformed URL, or mismatched slug fails
> closed before any write.

**Step 0/1 — locked tickets + configuration:**
```bash
npx convex run applySimplifiedDivineConferenceAccommodation \
  --args '{"slug":"divine-redesign","authorize":true,"allowedDeploymentUrl":"https://grateful-pelican-605.convex.cloud"}'
```
Renames the four entry tickets to `under 3` / `3-11` / `12-17` / `18+` at
€0/€125/€150/€250, keeps `Single Room` at €350, anchors every ticket to the
existing `Double Room` / `Single Room` room anchors with accommodation
included, and upserts the three categories, ten locked room types, four
per-person/night rates, Standard default config, and the enabled
`superior_upgrade` + `cot` event options. Never touches orders, assignments,
payments, or inventory. Re-run is a no-op.

**Step 2 — preferences + legacy assignment conversion:**
```bash
npx convex run backfillLegacyAccommodationPreferences \
  --args '{"slug":"divine-redesign","authorize":true,"allowedDeploymentUrl":"https://grateful-pelican-605.convex.cloud"}'
```
> ⚠ This writes `orderAccommodationSelections` rows (no delete-undone path).
> Expected: 38 resolved / 72 handled, 13 already handled, 0 unresolved,
> 44 assignments converted to status `converted` (slot references retained;
> converted rows no longer surface as pending buyer suggestions). Re-run is a
> no-op. Rehearse on preview (section 2) FIRST.

**Step 3 — Koningshof inventory replacement (bounded/resumable):**
```bash
npx convex run applyKoningshofAccommodationInventory \
  --args '{"slug":"divine-redesign","authorize":true,"allowedDeploymentUrl":"https://grateful-pelican-605.convex.cloud"}'
```
Re-run the command until it reports `done: true` (each run is bounded and
idempotent). Creates the NH Eindhoven Conference Centre Koningshof hotel and
event link, upserts the eleven event resources, materializes 374 rooms and
648 mixed/assignable slots from the locked counts, then — only after the new
inventory is complete and a reference preflight is clear — deletes the old
Holiday Inn Express / Ibis Styles Almere slots, rooms, event-hotel links, and
hotel rows. The preflight fails closed (`OLD_SLOT_REFERENCED`, reporting the
blocking assignment IDs) if any ACTIVE assignment (pending/undefined/
confirmed/declined) — but not a `converted` audit row — still references an
old slot; `converted` rows are inert (their rooming intent lives in the
backfilled preferences) and do not block the cleanup.

**Read-only verification (no writes):**
```bash
npx convex run verifyDivineRedesignAccommodationMigration --args '{}'
```
Returns the event ID and bounded counts for tickets (locked prices/anchors),
categories, room types, room/cot resources, rates, event options, stay config,
event accommodation preferences, converted assignments, linked hotels, rooms,
slots, and the absence of the two old hotels. Never mutates data.

**Zero-proof paid-order report and correction (NOT EXECUTED — operator-gated):**
> ⛔ **OPERATOR AUTHORIZATION REQUIRED**. The report and correction below are
> documented but **not executed** by this task. The correction flips
> `orders.status` from `paid` to `pending` only for event-scoped Ticket Tailor
> orders (extension `normalizedStatus` = `paid`) whose ledger has no
> applied-payment proof — proof being a `payments` row with the exact canonical
> order ID and status `auto_matched` or `manual_assignment`. It never creates,
> patches, or deletes payment rows, leaves the extension's historical
> `normalizedStatus` unchanged (so a re-run is a no-op), and returns
> `ordersScanned`, `flipped`, `alreadyPending`, and `skippedWithProof`. The
> same deployment guard as the accommodation migrations applies: `authorize:
> true` AND an exact deployment-slug match.

```bash
npx convex run correctUnprovenPaidOrders:reconcileUnprovenPaidOrdersReport \
  --args '{"slug":"divine-redesign"}'
```
Read-only, event-scoped reconciliation report: per-canonical-status counts for
the event's orders plus the order IDs, buyer names, and canonical amount due
for the zero-proof currently-paid Ticket Tailor orders the correction would
flip. Never mutates data; returns an empty well-typed report when the slug has
no event.

```bash
npx convex run correctUnprovenPaidOrders:correctUnprovenPaidOrders \
  --args '{"slug":"divine-redesign","authorize":true,"allowedDeploymentUrl":"https://grateful-pelican-605.convex.cloud"}'
```
Correction command — flips only the zero-proof paid orders to `pending`.
**NOT EXECUTED**; for the operator to run later against production with
explicit authorization.

### 3.3 Frontend deploy (authorization gate C)
> ⛔ **OPERATOR AUTHORIZATION REQUIRED** (gate C).
Deploy the Next.js frontend to `https://conference.dclm-nl.org` per the
project's normal hosting pipeline. Verify the signup flow, manage-booking, and
allocation board in production after deploy.

## 4. Announcement Broadcast (authorization gate D)

> ⛔ **OPERATOR AUTHORIZATION REQUIRED** (gate D). Production broadcasts remain
> operator-gated and are executed **inside the app** through the Communications
> Center at `/dashboard/events/{slug}/communications` — there is no CLI command
> that broadcasts, and `sendAnnouncementTest` remains a single-recipient
> diagnostic that CANNOT broadcast.

The in-app flow enforces the operator gate:

1. **Compose + review** — an authenticated operator composes the announcement
   (title, message, event details, optional Tikkie payment URL and
   night-before note) and reviews the rendered `AnnouncementEmail`.
2. **Audience + preview** — filters (location, order status, submitted date
   range, has-accommodation-selection, ticket type) build the order-booker
   audience with a live count and recipient preview. Bookers without an email
   or booking reference are skipped and reported.
3. **Controlled test-send** — send to exactly one controlled inbox first
   (emailType `announcement_test`); re-send until the render is correct.
4. **Explicit Send confirmation** — the Send button opens a confirmation
   dialog showing the recipient count and applied filters. Confirming calls
   `scheduleEmailBroadcast`, which **snapshots the audience and schedules
   delivery**; it never sends inline.
5. **Async delivery + history** — a scheduler-driven batch loop delivers in
   bounded batches (25/step), tracking the job status
   (`queued`/`sending`/`completed`/`failed`/`cancelled`) and per-recipient
   status (`pending`/`sent`/`failed`) with sent/failed/pending counters.
   Successful sends log `emailType: "announcement_broadcast"` with event and
   broadcast IDs. The History panel shows live progress reactively; the
   operator can **Cancel** while queued/sending and **Retry failed** recipients
   after completion.

This supersedes the earlier "provision a broadcast path OUTSIDE this
application" guidance: the app now ships the operator-gated broadcast, and
delivery is asynchronous by design. The legacy backfill (`Step 2`) remains
separately guarded and is not part of the broadcast flow.

## 5. Rollback & Stop Conditions

| Condition | Action |
| --- | --- |
| Signups rejected after secret provisioning | Secret mismatch (one runtime only) — re-provision BOTH runtimes together |
| Backfill created duplicate preferences | Re-run is idempotent (no new rows); inspect `orderAccommodationSelections` counts vs audit (116) |
| Backfill reported unresolved orders | Fix the underlying data and re-run (unresolved orders are skipped as units, never partially written) |
| Announcement rendering wrong | No broadcast — re-send test to a controlled inbox; do NOT broadcast until correct |
| Allocation/inventory behaving unexpectedly | No production data migration is irreversible on its own — confirm assignments via the board; unassign/reassign |
| Any production step failed mid-way | STOP, do not proceed to the next gate; report and rehearse the failed step on preview first |

## 6. Non-Execution Statement

Phase 49 (this milestone window) performs **no production deploy, no
production write, no production migration, no rollback, and no announcement
broadcast**. The guarded accommodation migration (Steps 0-3 above) and the
read-only verification query are documented but **not executed** — no
production execution is performed by this task. All of the above are gated
behind explicit operator authorization at gates A-D and are for the operator
to execute later.
