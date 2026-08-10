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

### 3.3 Frontend deploy (authorization gate C)
> ⛔ **OPERATOR AUTHORIZATION REQUIRED** (gate C).
Deploy the Next.js frontend to `https://conference.dclm-nl.org` per the
project's normal hosting pipeline. Verify the signup flow, manage-booking, and
allocation board in production after deploy.

## 4. Announcement Broadcast (authorization gate D)

> ⛔ **OPERATOR AUTHORIZATION REQUIRED** (gate D). Broadcasting to the full
> audience is a separate, explicitly gated step — the `sendAnnouncementTest`
> action is single-recipient by design and CANNOT broadcast.

1. Confirm the test-send from section 2.5 rendered correctly.
2. Provision a broadcast path (recipient list / queue) OUTSIDE this
   application's email actions — the app ships no broadcast action by design.
3. Authorize and execute the broadcast. Record the send batch + open/click
   verification.

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
