# v6.0 Production Readiness — Testing & Verification Coverage Review

## Summary

The suite is green (`468 passed / 5 skipped`, `66 passed / 1 skipped` files), and the change adds substantial Convex coverage for the happy paths and several adversarial token/edit cases. The strongest coverage is the track-payment edit contract: ownership re-checks, exact request signatures, stored replay responses, payment drift, key conflicts, confirmed locks, and cross-order attempts are exercised.

The production-readiness gates are not fully verified, however. Signup idempotency does not test same-key/different-payload conflict or the complete stored response; the backfill “zero partial inserts” test only uses a one-attendee failing order; the preview seed does not assert all seeded partitions, including inventory resources; and the email/runbook tests are mostly substring/source audits rather than behavior tests. The fixture and expected counts are also self-referential, so the current `72` expectation is consistent internally but is not independently reconciled to the known `71`/`72` rehearsal discrepancy.

## Coverage Table

| Requirement / behavior | Tested? | Test file:line | Quality note |
|---|---|---|---|
| OWN-01: no-token degraded signup mode | **Yes, partial** | `convex/signup-submission.test.ts:396-453`; `lib/domain/signup/submission.test.ts:89-107` | Convex degraded mode asserts persistence and warning; the domain test only mocks the mutation. There is no end-to-end environment matrix proving Next-absent/Convex-present fails closed versus Next-present/Convex-absent degrades. |
| OWN-01: enforced signup mode, valid token, forged/tampered/expired/mis-bound token | **Yes** | `convex/signup-submission.test.ts:1181-1305`; `lib/domain/signup/submission-token.test.ts:48-216` | Good direct-mutation coverage, including event/digest/key binding and no-write assertions. |
| OWN-02: edit ownership re-check and direct-call fail-closed | **Yes** | `convex/track-payment-edit.handlers.test.ts:565-700,1694-1772`; `app/api/track-payment/[bookingRef]/route.test.ts:292-380` | Email ownership, wrong token, cross-order ownership, forged signatures, and missing secret are covered. The route tests mock Convex, so they do not prove route-to-mutation enforcement together. |
| CR-03/CR-08 signup idempotency: exact retry/replay | **Yes, partial** | `convex/signup-submission.test.ts:1485-1521`; `app/api/signup/submit/route.test.ts:401-500` | The Convex test checks only the repeated `submissionId` and order count. It does not compare the full stored response or verify `soldCount`, idempotency rows, selections, and scheduled side effects remain unchanged. |
| CR-03/CR-08 edit idempotency: stored response after payment/config changes | **Yes** | `convex/track-payment-edit.handlers.test.ts:1139-1331,1610-1686` | Strong: it proves replay returns the frozen money result after a payment and after confirmation. |
| CR-03/CR-08 conflict on idempotency-key reuse | **Yes for edits; missing for signup** | `convex/track-payment-edit.handlers.test.ts:1531-1608` | Edit conflict is exact and checks no duplicate audit. No signup test reuses a live key with a changed payload and a freshly valid token; that path is especially important because `convex/signupSubmission.ts:501-504` only searches for a matching fingerprint and does not assert/reject an existing mismatched key. |
| Digest-bound retry / token cannot be replayed with changed payload or key | **Yes** | `convex/signup-submission.test.ts:1417-1483,1801-1877`; `lib/domain/signup/submission.test.ts:140-181`; `tests/finance/track-payment-edit-token.test.ts:157-249` | Good breadth for payload, night-before, key, booking ref, expiry, and malformed signatures. |
| Backfill full population counts and first run | **Yes, partial** | `convex/legacy-readiness.handlers.test.ts:137-197`; `convex/preview-simulation.handlers.test.ts:127-190,249-294` | Orders/attendees/rooms/slots/hotels and the two selection partitions are checked. Not every seeded table/partition is checked, and `insertedByTable` is not asserted. |
| Backfill idempotent re-run | **Yes, partial** | `convex/legacy-readiness.handlers.test.ts:184-196`; `convex/preview-simulation.handlers.test.ts:192-217,269-277` | Re-run counts are checked, but not zero inserts per table, reference integrity, or protection of unrelated pre-existing rows/events. |
| Backfill preview=false and production deployment guard | **Yes, partial** | `convex/legacy-readiness.handlers.test.ts:255-286`; `convex/preview-simulation.handlers.test.ts:219-247` | Error codes and no order writes are asserted. No test covers the detectable-URL-absent path, an unrelated existing event, or all-table no-write protection. |
| Per-order backfill fail-closed / zero partial inserts | **Insufficient** | `convex/legacy-readiness.handlers.test.ts:288-361` | The failing order has only one attendee, so the test cannot detect a valid first attendee being inserted before a later attendee fails. It does not prove the stated unit-level atomicity. |
| Inventory guard on direct assignment and buyer Confirm | **Yes, partial** | `convex/legacy-readiness.handlers.test.ts:514-654` | Both write paths block a second room and unassign/reassign is covered. No zero-resource, missing-resource, shared-bed, existing-target-room, cross-event, or room-move matrix is covered. |
| Mixed Standard/Superior group blocking | **Yes, partial** | `convex/legacy-readiness.handlers.test.ts:363-431,433-512` | Board flag and manage-booking rejection are covered. There is no non-mixed control case, multi-member group with all members consistent, or exact member/slot mapping assertion. |
| Night-before mismatch indicator and fail-safe false | **Insufficient** | `convex/legacy-readiness.handlers.test.ts:729-807` | Two positive mismatch cases are good. The claimed fail-safe behavior is only asserted as `toBeTypeOf("boolean")`; no attendee with no night-before or a matching room is explicitly required to be `false`. |
| Buyer suggestion board | **Yes, weak** | `convex/legacy-readiness.handlers.test.ts:814-846`; `convex/preview-simulation.handlers.test.ts:249-294` | Counts and non-empty room/hotel fields are checked, but not that each suggestion maps to the corresponding legacy assignment/attendee/slot. A board returning 44 plausible duplicate suggestions could pass. |
| Sanitization / PII-free preview | **Yes, partial** | `lib/domain/legacy/sanitize-preview.test.ts:43-82` | Exact values and relational IDs are checked for a small sample. `address`, `notes`, blank values, arbitrary-table rows, and an independently implemented PII detector are not covered; the test calls the sanitizer’s own scanner. |
| Accommodation money formula and snapshots | **Yes** | `tests/finance/accommodation-amounts.test.ts:35-483`; `convex/signup-submission.test.ts:455-500,1594-1709,1879-1965` | Strong exact minor-unit assertions across live and confirmed paths, options, extended/night-before stays, malformed inputs, and snapshots. |
| Announcement email content, buttons, logo, dark mode, mobile CSS, prefilled booking links | **Insufficient** | `lib/email/templates/announcement.test.ts:19-43` | Tests only check supplied strings/URLs are present or absent. They do not assert button labels/classes, logo URL, dark-mode CSS, mobile CSS, or that the manage URL contains the booking reference/encoding. |
| Announcement action is single-recipient and non-broadcast | **Weak static check** | `tests/production-deployment-runbook.test.ts:58-72` | It searches source text for forbidden words and `args.to`; it does not invoke/mock Resend, inspect recipient count, render HTML/text, or verify logging/error behavior. |
| Production runbook | **Weak static check** | `tests/production-deployment-runbook.test.ts:11-56` | Section/keyword presence is useful, but substring checks do not validate command JSON, exact expected count lines, selector safety, or that authorization gates actually prevent execution. |
| Known rehearsal discrepancy (71 vs 72 attendees) | **Internally consistent, not independently verified** | `tests/fixtures/legacy-preview.snapshot.ts:19-29,81-84`; `convex/legacy-readiness.handlers.test.ts:137-157`; `tests/production-deployment-runbook.test.ts:33-40` | The fixture and runbook lock `72`, and no relevant test locks `71`; this agrees with the current fixture. However, most assertions consume `LEGACY_AUDIT_COUNTS` from the same fixture generator, so they cannot detect an erroneous fixture/audit reconciliation. |

## Gaps

### BLOCKER gaps

1. **Signup same-key/different-payload conflict is untested and appears unimplemented.** `convex/signupSubmission.ts:494-505` only treats a key as a replay when its fingerprint also matches; a live key with a different payload is not rejected before the insert path. Add a test in `convex/signup-submission.test.ts` that submits once, re-mints a valid token for a changed payload using the same `idempotencyKey`, and asserts `SUBMISSION_CONFLICT`, one order, unchanged ticket `soldCount`, one idempotency record, and no second selection set.

2. **Signup replay does not verify the complete stored response.** `convex/signup-submission.test.ts:1485-1521` asserts only the ID and order count. Add exact assertions for booking reference, submitted timestamp, restore payload (attendees/tickets/accommodation/options), selection and child-row counts, ticket counters, and scheduler/email behavior on the second call. This is required to catch a replay that returns a recomputed or incomplete response while still preserving the ID.

3. **The backfill atomicity test cannot exercise partial-order failure.** `convex/legacy-readiness.handlers.test.ts:288-361` creates a one-attendee dangling order. Add a two- or three-attendee order where an earlier attendee resolves and a later ticket/room/rate is dangling; assert the order reports unresolved and has zero selection rows while all other orders retain their expected counts.

4. **The preview seed’s full partition is not verified, especially inventory resources.** `convex/preview-simulation.handlers.test.ts:26-75,127-154` omits counts for categories, options, room types, event hotels/config/rates/options/resources, and ticket types; the independent seeder in `convex/legacy-readiness.handlers.test.ts:40-73` omits `eventAccommodationResources` entirely. Assert exact `insertedByTable` counts and all reference-bearing rows, including the resource rows used by the inventory rehearsal. Otherwise a seed that silently omits inventory/config data can pass.

5. **The OWN-01 runtime matrix is not tested through the route and mutation together.** `lib/domain/signup/submission.test.ts:89-107` mocks Convex, while the Convex test independently toggles only the backend environment. Add an integration-style test matrix for: both secrets present (valid token accepted), Convex secret present/Next secret absent (route cannot mint and mutation rejects), Next secret present/Convex secret absent (token-less degraded write plus warning), and empty/whitespace secret values.

### WARNING gaps

1. **The `72` count is self-referential around the known 71/72 discrepancy.** Add an independent audit contract fixture or a literal expected partition assertion that is not generated from `LEGACY_AUDIT_COUNTS`; assert 51/116 overall, 38/72 no-selection, and 13/44 legacy-assignment counts against that independent source.

2. **Night-before “fail safe false” is not actually asserted.** In `convex/legacy-readiness.handlers.test.ts:796-806`, add a no-night-before occupant and a matching category/capacity occupant, then assert `nightBeforeMismatch === false` for both.

3. **Inventory edge behavior is under-matrixed.** Extend `convex/legacy-readiness.handlers.test.ts:514-654` with resource count `0`, no resource row (legacy no-op), two beds in one shared room, repeated assignment to an already occupied target, and moving an attendee between rooms/types; assert atomic state after every rejected mutation.

4. **Rooming-group and buyer-suggestion assertions are too permissive.** Add a non-mixed control group, an all-Superior/all-Standard group, and an exact map from each suggestion to its attendee/order/legacy slot/room. Assert no duplicate attendee suggestions and that the board’s mixed flag is false for consistent groups.

5. **Announcement email tests omit the v6.0 presentation/security contract.** In `lib/email/templates/announcement.test.ts:20-43`, assert `Manage Booking`, `Register for the Conference`, and `Review Payment` labels; the `dlbc-logo.png` URL; `.email-button-primary`, `.email-button-secondary`, dark-mode selectors, and `max-width: 600px` mobile CSS. Also pass a booking reference in the URL and assert the exact encoded path/query.

6. **The runbook test is a substring test rather than a verification test.** `tests/production-deployment-runbook.test.ts:33-72` should parse the fenced commands and assert exact args (`scope`, `preview`, `allowedDeploymentUrl`), exact expected count lines, production selector separation, and that all production write/broadcast commands are explicitly authorization-gated. Static absence of a few words is not proof that a new recipient path cannot be added.

7. **Sanitization coverage relies on the implementation’s own detector.** Add cases for every `PII_FIELDS` entry, blank preservation, numeric/non-string values, notes/address, and relational IDs across all seeded tables; validate with an independent test-side detector rather than only `scanPreviewSnapshotForPii`, whose exemptions are defined beside the sanitizer.

8. **The real authentication contract is skipped in the normal suite.** The optional Clerk suite should have a credentialed CI job (or a deterministic contract test in addition to the live test) so v6.0 production readiness does not rely on five skipped auth tests.

## Skipped Tests

All five skipped tests are in `tests/auth/clerk-jwt.integration.test.ts`:

- `:123` obtains and validates a real Clerk JWT.
- `:153` rejects a tampered signature.
- `:168` rejects a wrong issuer.
- `:180` rejects a wrong audience.
- `:192` sends the token to the protected Convex query when `NEXT_PUBLIC_CONVEX_URL` is set.

They are skipped because `describe.skipIf(!hasCredentials)` at `:42` sees missing `CLERK_SECRET_KEY` and/or `CLERK_JWT_ISSUER_DOMAIN`; the nested test additionally requires `NEXT_PUBLIC_CONVEX_URL`. This is acceptable for a local suite because these tests require live external credentials and create disposable Clerk resources, but it is not acceptable as the only auth verification for production readiness. The credentialed suite must run in CI and remain a visible required check.

---

_Reviewed: 2026-08-09_
_Reviewer: testing & verification coverage agent_
