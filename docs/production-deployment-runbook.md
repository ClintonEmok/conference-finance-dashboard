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

## 2A. Phase 46 Search-Projection Rollout (preview rehearsal first)

> **Status: DOCUMENTED, NOT EXECUTED.** This section is the operator procedure
> for the Phase 46 indexed-search rollout. The preview rehearsal is safe to
> run only against the exact preview deployment URL. The production backfill
> remains an explicit, operator-only write; no command in this phase executes
> a production seed, backfill, broadcast, or other production write.

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

Backfill each canonical subject kind separately, always starting with
`cursor: null` and using the implementation-enforced **`batchSize: 1`**. This
batch size is not the UI page size: one canonical row per invocation keeps the
projection upsert (and its bounded related reads) atomic with its canonical
page. Repeat the same command with the returned `nextCursor` until
`isDone: true`, then repeat the complete cursor sequence for attendees. If a
run stops after a valid completed batch, resume with that returned cursor; do
not invent or edit an opaque cursor.

```bash
npx convex run backfillSearchProjections \
  --args '{"kind":"order","cursor":null,"batchSize":1,"authorize":true,"allowedDeploymentUrl":"https://<PREVIEW_DEPLOYMENT_SLUG>.convex.site"}'
# Repeat with the returned nextCursor, then run the same sequence with kind "attendee".
npx convex run verifySearchProjections \
  --args '{"authorize":true,"allowedDeploymentUrl":"https://<PREVIEW_DEPLOYMENT_SLUG>.convex.site"}'
```

`verifySearchProjections` is read-only. Continue only when `missing`, `stale`,
`blockedJobs`, and `pendingJobs` are all zero and `truncated` is false. (Native
full-text search replaced the former posting table, so verification no longer
reports duplicate or orphaned postings.) The sanitized fixture source is
`tests/fixtures/legacy-preview.snapshot.ts`; its 51/116 coverage is the
expected full-fixture status, not a claim about production data.

Native full-text search is served by the `searchDocuments.search_text` index.
That index is **not staged**, so a deploying build synchronously backfills it
from the existing `searchDocuments` rows. Order matters: deploy the schema first
(which builds the index over already-projected rows), then run the projection
backfill above (each upsert updates the index automatically), then verify, then
promote the search UI. Search returns only documents that are both projected and
indexed, so an incomplete projection backfill means incomplete search results.

### Production backfill (operator-only; not executed by this phase)

After the preview rehearsal and a reviewed deployment, an authenticated
operator may run the production procedure below. Replace the placeholder with
the exact production slug only; this document intentionally does not run it
and does not provide credentials. The production guard requires both
`authorize: true` and an exact deployment-slug match between the runtime
`CONVEX_SITE_URL` and `allowedDeploymentUrl`. It accepts the exact
`https://<PRODUCTION_DEPLOYMENT_SLUG>.convex.cloud` or corresponding
`.convex.site` URL for the same slug, but rejects selectors, suffix/prefix
matches, malformed URLs, missing identity, and missing allowlists before any
read or write.

```bash
# OPERATOR RUNBOOK ONLY — do not run as part of Phase 46 automation.
npx convex run backfillSearchProjections \
  --args '{"kind":"order","cursor":null,"batchSize":1,"authorize":true,"allowedDeploymentUrl":"https://<PRODUCTION_DEPLOYMENT_SLUG>.convex.cloud"}'
# Repeat with each returned nextCursor until isDone:true; then repeat from
# cursor:null for kind:"attendee" and continue until isDone:true.
npx convex run verifySearchProjections \
  --args '{"authorize":true,"allowedDeploymentUrl":"https://<PRODUCTION_DEPLOYMENT_SLUG>.convex.cloud"}'
```

The order-then-attendee sequence is required so each kind has complete
historical coverage. A completed batch can be rerun safely: projection
replacement is an idempotent upsert of the single `searchDocuments` row whose
native full-text search index Convex maintains. Do not skip
historical backfill merely because live fan-out maintenance is enabled.
Verification must be authorized but read-only and must pass before enabling or
promoting the production search UI. Stop immediately and do not proceed to the
next cursor, kind, or rollout gate when any of the following occurs: guard
failure; invalid cursor; a skipped/diagnostic row that is not understood;
missing or stale coverage; `blockedJobs` or `pendingJobs`; `truncated: true`;
an incomplete pass; or any unexpected write or deployment identity. Rehearse
the failed step in preview and investigate before resuming from the last
known-good returned cursor.

### Attendee `eventId` backfill (operator-only)

> ⛔ **OPERATOR AUTHORIZATION REQUIRED.** The additive `orderAttendees.eventId`
> copy (Phase 62, D-06) is written with every new attendee row at all four
> production insert sites, but rows that predate the field carry no `eventId`
> and are invisible to the event-scoped attendee ledger / donation-allocation
> picker until they are filled. Phase 62 ran this backfill against the DEV
> deployment only (149 rows processed, 149 patched, 0 skipped; a re-run
> patched 0). This section is the production carry-forward.

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
guessed) and must be understood before continuing. Run this before promoting
the Phase 62 search surfaces in production.

### Production attendee-key rekey (operator-only)

> ⛔ **OPERATOR AUTHORIZATION REQUIRED.** This repair is separate from the
> search-projection and legacy-accommodation backfills. It repairs existing
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
