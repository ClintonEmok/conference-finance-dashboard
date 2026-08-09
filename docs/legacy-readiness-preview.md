# Legacy Readiness Preview — Operator Note (Phase 47)

> **This is a preview-only operator procedure, NOT a production runbook.**
> The backfill is a **costly write**: Convex has no delete-undone path for the
> inserted `orderAccommodationSelections` rows. It may be run ONLY against the
> sanitized dev/preview deployment `dev:acoustic-tiger-876`. Running it against
> `grateful-pelican-605` or any other deployment is prohibited without a
> separate, explicit production authorization.

## Purpose (LEG-01 / LEG-02 / LEG-03)

Make every legacy `divine-redesign` order canonically editable and its
historical rooming requests visible to admins, without touching live
production:

- **LEG-01** — orders with zero `orderAccommodationSelections` get exactly one
  first included-Standard preference (ticket-derived occupancy).
- **LEG-02** — legacy `orderAssignments` surface as buyer rooming-group
  suggestions on the allocation board; buyers have no physical slot picker.
- **LEG-03** — the transformation only ever runs against a PII-safe sanitized
  preview seeded from the audited production shape.

## Audited production shape (the preview must mirror)

| Population | Count |
| --- | --- |
| Orders | 51 |
| Attendees | 116 |
| Orders with NO accommodation preference data | 38 (72 attendees) |
| Orders carrying legacy `orderAssignments` | 13 (44 attendees) |
| Slots / Rooms / Hotels | 160 / 84 / 2 |
| Legacy assignments occupancy | shared Double Room |
| Legacy room types categoryId | absent (default to included Standard) |

## The transformation

`convex/backfillLegacyAccommodationPreferences.ts` — a private, idempotent,
slug-located `internalMutation` that:

1. Refuses to run without `preview: true` and when the detectable deployment
   URL (`CONVEX_SITE_URL`) does not match the allowed preview deployment —
   rejected **before any read or write** (a production URL fails closed).
2. Skips any order that already has a selection row (idempotent re-run).
3. Creates one included-Standard selection per ticketed attendee with
   ticket-derived occupancy (single for capacity-1 room types, shared
   otherwise, shared default for unconstrained tickets), event-config stay
   dates and base night count, no night-before / no options.
4. Fails an order closed as a unit when any attendee is unresolvable (no
   ticket selection, dangling ticket, unresolvable room type/rate) — zero
   partial inserts — and reports it under `unresolved`.
5. Never touches confirmed rows, other events, payments, assignments, order
   totals, or Tikkie links.

## Sanitization (LEG-03)

`lib/domain/legacy/sanitize-preview.ts` strips all PII content fields (names,
emails, phones, locations, dietary restrictions, roommate tokens, notes) into
deterministic preview-safe values while preserving every internal document ID
and relational reference. `serializePreviewSnapshotToJsonl` emits per-table
JSONL compatible with `npx convex import`.

## Preview procedure (requires human approval — Task 3 checkpoint)

1. **Seed the sanitized snapshot** into `dev:acoustic-tiger-876` with
   `npx convex import` per table (JSONL produced by the sanitizer).
2. **Verify preview counts** before running anything: 51 orders / 116
   attendees, 38 orders without preferences, 13 orders / 44 legacy
   assignments.
3. **Approve the costly preview-only run** (blocking human checkpoint):
   ```bash
   npx convex run backfillLegacyAccommodationPreferences \
     --args '{"slug":"divine-redesign","preview":true,"allowedDeploymentUrl":"dev:acoustic-tiger-876"}'
   ```
4. **Expect the first-run report:** `ordersScanned: 51`,
   `ordersAlreadyHandled: 13`, `ordersResolved: 38`,
   `attendeesHandled: 72`, `ordersUnresolved: 0`.
5. **Re-run to confirm idempotency:** the second run reports
   `ordersAlreadyHandled: 51`, `attendeesHandled: 0`, no new rows, no changed
   money.
6. **Confirm no PII** in the preview snapshot and no writes to production.

## Guarantees verified by tests

- 38/72 first-preference backfill, Standard fallback, occupancy derivation,
  idempotent re-run, canonical money readable.
- A backfilled order passes through the hardened manage-booking edit path and
  re-prices canonically (e.g. adding the Superior upgrade increases amount due
  by exactly €10/person/night × base nights).
- All 44 legacy assignments surface as grouped buyer suggestions on the board.
- Deployment guard rejects `preview:false` and a production-like deployment
  URL before any read/write.
- A dangling ticket fails the order closed with zero partial inserts.
- Buyers submit accommodation preferences with `assignments: []` and no
  `slotId`/`roomId`/slot-picker field.

## Prohibitions

- Do NOT run against `grateful-pelican-605` or `conference.dclm-nl.org`.
- Do NOT broadcast anything. Do NOT deploy in this phase.
- A production execution requires a separate runbook (Phase 49 RUN-03) and
  explicit operator authorization.
