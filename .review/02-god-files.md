# God Files / File Granularity Review

The v6.0 change still concentrates several independently evolving domains in a few route modules and client components. The worst cases are not merely long files: they combine public API declarations, database orchestration, policy/validation, projection mapping, and UI composition, so a change to one concern requires navigating and risk-reviewing unrelated concerns. The proposals below preserve existing Convex route names where practical by leaving thin decorated-function facades in place; where a decorated function moves, every `api.*`/`internal.*` reference and generated API entry must be updated deliberately.

## 1. `convex/accommodation.ts`

### Current size

4,044 lines; approximately 70 exported declarations and dozens of Convex queries, mutations, internal mutations, validators, and shared helpers.

### Responsibility inventory

- Shared ID normalization, attendee/location/gender/payment ranking, signal filtering, family detection, and inventory-guard helpers (lines 25-283).
- The complete room-allocation-board read model: event scoping, ticket entitlement projection, payment projection, accommodation preference projection, pending buyer suggestions, submission queue rows, room mapping, sorting, and summary aggregation (lines 284-1200).
- General inventory read models for hotels, room types, rooms, and occupancy summaries (lines 1202-1441).
- Hotel, room, and room-type CRUD, including bulk room creation and slot generation (lines 1443-1630 and 2022-2210).
- Direct attendee assignment/unassignment mutations and their event-hotel, capacity, inventory, and confirmation-lock checks (lines 1632-1841).
- Event-hotel linking/unlinking, deprecated provider-ID compatibility mutations, slot generation/listing, event summaries, and pending buyer assignment confirmation/removal (lines 1843-2677).
- Accommodation catalog and event configuration contracts: validators, catalog reads, categories/options, stay flags, rates, options, resources, and config-version bookkeeping (lines 2680-3582).
- Server-side accommodation confirmation and pricing snapshot resolution, persistence, and the public confirmation mutation (lines 3584-4044).

### Severity: HIGH

This is a genuine multi-domain backend package hidden behind one Convex route file. The allocation-board read model alone spans roughly 900 lines and is coupled to finance, signup preferences, assignments, and inventory. Catalog/configuration and confirmation/pricing are separate policy lifecycles from physical room administration. The current shape makes unrelated edits share a transaction-heavy module and makes route ownership unclear.

### Concrete split proposal

Create these focused modules, keeping the existing file as a thin route facade if the repository's established re-export pattern remains compatible with Convex codegen:

- `convex/accommodation/board.ts`: move `getRoomAllocationBoard`, `attendeeMatchesSignalFilters`, `hasFamilySignal`, payment/priority ranking, and board-only projection/mapping helpers.
- `convex/accommodation/inventory.ts`: move `recalculateRoomOccupancy`, `getHotels`, `getRoomTypesWithCount`, `getRoomsWithDetails`, `listAccommodationInventory`, and the simple hotel/room/room-type reads.
- `convex/accommodation/resources.ts`: move `createHotel`, `updateHotel`, `deleteHotel`, `createRoom`, `createRooms`, `updateRoomLabel`, `deleteRoom`, `createRoomType`, `updateRoomType`, `deleteRoom`, plus `getEventHotels`, `linkHotelToEvent`, `unlinkHotelFromEvent`, provider-ID compatibility routes, and slot generation/listing.
- `convex/accommodation/assignments.ts`: move `assignRoomToAttendee`, `assignAttendeeToRoom`, both unassign routes, `confirmBuyerAssignment`, `removeBuyerAssignment`, and `assertEventRoomInventoryAvailable`; import the confirmation service rather than keeping pricing logic here.
- `convex/accommodation/catalog.ts`: move catalog/config validators, `getAccommodationCatalog`, `getEventAccommodationConfig`, category/option mutations, `upsertEventAccommodationConfig`, `upsertEventAccommodationRate`, `upsertEventAccommodationOption`, and `upsertEventAccommodationResource`.
- `convex/accommodation/confirmation.ts`: move `resolveOrderAccommodationConfirmation`, `persistOrderAccommodationConfirmation`, and `confirmAccommodationOrderConfiguration`, along with snapshot-specific helpers.

Keep `convex/accommodation.ts` only as route declarations/re-exports during the migration, or update references such as `api.accommodation.getRoomAllocationBoard`, `api.accommodation.assignAttendeeToRoom`, and `api.accommodation.upsertEventAccommodation*` in `lib/convex/hooks/accommodation.ts`, `lib/domain/accommodation/*`, dashboard callers, Convex callers, and tests to the new nested routes. Regenerate the Convex API after route changes. Rough effort: 2-4 days, mostly mechanical extraction and route/reference verification; no business-rule rewrite is required.

## 2. `app/dashboard/accommodation/page.tsx`

### Current size

2,588 lines in one client component.

### Responsibility inventory

- The complete server payload/type contract and empty/error state model (lines 57-237).
- URL/search-parameter synchronization, applied-vs-draft filters, pagination, event selection, and filter reset behavior (lines 263-475 and 649-709).
- Workspace fetch lifecycle, error handling, refresh behavior, room/attendee derived indexes, and toast timers (lines 477-610).
- Client-side fulfillment/group-selection policy: requested-room matching, same-order grouping, room selection, and bulk assignment orchestration (lines 711-980 and 2010-2179).
- Assignment, unassignment, pending-assignment confirmation, alternative-room selection, and removal API workflows (lines 851-1134).
- Event-picker presentation (lines 1136-1208).
- Dashboard shell, metrics, buyer-suggestion grouping and presentation (lines 1210-1465).
- Smart-allocation proposal state and rendering, signup submission queue, and submission-detail side panel (lines 1467-1963).
- Unassigned-attendee inbox presentation and action controls (lines 1966-2181).
- Room-board presentation, occupancy slots, pending requests, pagination, and refresh control (lines 2183-2445).
- Confirmation dialog, decline action, alternative-room dialog content, and assignment toast presentation (lines 2447-2585).

### Severity: HIGH

The page is simultaneously a data hook, a mutation controller, a client-side allocation policy, a filter router, a room-board view, an inbox view, a submission queue, a side panel, and two dialogs. It also contains large inline render trees and callback closures over the entire workspace state. This is beyond a single page composition boundary and makes small UI or API changes high-churn and difficult to isolate.

### Concrete split proposal

Extract without changing the route:

- `app/dashboard/accommodation/types.ts`: move `AccommodationWorkspacePayload`, error/toast state, and `emptyPayload`/small display helpers.
- `app/dashboard/accommodation/hooks/useAccommodationWorkspace.ts`: move filter URL synchronization, `loadWorkspace`, refresh/error state, payload state, derived maps, and assignment API callbacks. Return a narrow view model and callback set to the page.
- `app/dashboard/accommodation/lib/fulfillment.ts`: move `pickFulfillRoom`, `getFulfillGroupAttendees`, `pickGroupFulfillRoom`, and the pure buyer-suggestion grouping logic.
- `app/dashboard/accommodation/components/EventSelector.tsx`: move lines 1136-1208 and accept the event list/router callback as props.
- `app/dashboard/accommodation/components/BuyerSuggestionList.tsx`: move lines 1330-1465; pass grouped suggestions and review/confirm callbacks.
- `app/dashboard/accommodation/components/SubmissionQueue.tsx` and `SubmissionDetailPanel.tsx`: move the queue and detail panel from lines 1494-1849.
- `app/dashboard/accommodation/components/UnassignedAttendeeInbox.tsx`: move lines 1966-2181; keep group fulfillment decisions in the hook/lib rather than in JSX event handlers.
- `app/dashboard/accommodation/components/RoomBoard.tsx`: move lines 2183-2445, including room cards and pagination.
- `app/dashboard/accommodation/components/PendingAssignmentDialog.tsx` and `AssignmentToast.tsx`: move lines 2447-2585.

The page should retain event selection, compose the hook, render metrics, and pass explicit callbacks to these children. Rough effort: 2-3 days. This is a targeted extraction with stable HTTP endpoints and no need to alter the dashboard route.

## 3. `convex/signupSubmission.ts`

### Current size

1,354 lines; two public Convex routes plus validation, restore serialization, persistence, pricing integration, idempotency, and email scheduling.

### Responsibility inventory

- Submission envelope validators, restore-payload validators, string normalization, booking-reference/hash generation, and generic error shaping (lines 25-182).
- Full historical-order restore serialization, including attendees, tickets, assignments, accommodation rows, and option child rows (lines 184-346).
- Public `submitSignupEnvelope` security gate, idempotency/replay handling, event/ticket validation, accommodation resolution, cardinality checks, database persistence, sold-count updates, and email scheduling (lines 348-1121).
- Public `getByBookingRef` booking projection: attendee/ticket joins, canonical amount-due loading, assignments/slots/rooms/hotels/room types, and response assembly (lines 1123-1354).

### Severity: HIGH

The submit mutation is already a large application service, but it is co-located with a separate public booking-read projection. The restore serializer is a third contract surface embedded in the write path, while token/idempotency validation, ticket capacity, accommodation policy, persistence, and email side effects have different ownership and change cadence. A booking-read change should not require reviewing the entire public write mutation.

### Concrete split proposal

Keep `convex/signupSubmission.ts` as the route facade so `api.signupSubmission.submitSignupEnvelope` and `api.signupSubmission.getByBookingRef` remain stable, and extract implementation units:

- `convex/signup/submission-contract.ts`: move attendee/ticket/assignment/restore validators and the normalized input/result types.
- `convex/signup/submission-validation.ts`: move `throwSubmissionError`, string/booking-ref helpers, token digest verification, event/ticket capacity checks, and accommodation cardinality/resolution checks. Expose one validated submission plan.
- `convex/signup/submission-persistence.ts`: move order, attendee, ticket, sold-count, accommodation-selection, option-child, and idempotency writes. Keep this as a mutation-context service called by the route handler.
- `convex/signup/restore-payload.ts`: move `buildRestorePayload` and its child-row mapping.
- `convex/signup/booking-projection.ts`: move the `getByBookingRef` handler implementation, including ticket/attendee/assignment joins and room-assignment projection.

The existing decorated functions should only validate args/returns and delegate to these services; the email scheduler remains a single explicit post-persistence step. Rough effort: 1.5-2.5 days. Update only internal imports while retaining the existing two public route names, avoiding a broad client migration.

## 4. `convex/publicTracking.ts`

### Current size

1,286 lines; two public tracking queries, one edit-context query, and one public accommodation-edit mutation.

### Responsibility inventory

- Payment-row loading, payment progress/status calculation, Tikkie-link selection, and the shared tracking projection (lines 29-187).
- Public booking-reference and email/reference lookup routes (lines 189-324).
- Public edit contract validators and edit-choice catalog projection, including ticket/category entitlement and night-before display data (lines 326-483).
- Accommodation-selection loading, paid-total calculation, result shaping, and public `getTrackPaymentEditContext` projection (lines 485-724).
- Public `updateAccommodation` authentication/ownership/signature gates, replay/idempotency handling, selection cardinality checks, ticket/accommodation resolution, rooming-group policy, digest comparison, atomic replacement, canonical repricing, audit persistence, and response generation (lines 726-1286).

### Severity: HIGH

Read-only payment tracking and public write authorization/editing are separate security and data-projection boundaries. The 560-line mutation contains its own contract, authorization, pricing resolution, group policy, row replacement, and audit service, while the first 325 lines are a public tracking projection. Combining them increases the blast radius of changes to either the payment display or ownership gate.

### Concrete split proposal

Retain the four existing decorated routes in `convex/publicTracking.ts` as thin facades and move the implementation behind them:

- `convex/track-payment/tracking-projection.ts`: move `loadAppliedPaymentRowsForOrder`, `computeProgress`, `loadTrackingByOrder`, payment status types, and Tikkie-link projection.
- `convex/track-payment/lookup.ts`: move the handlers for `getByBookingRef` and `getByEmailOrBookingRef`.
- `convex/track-payment/edit-contract.ts`: move edit validators, `buildEditChoices`, `throwEditError`, and `buildEditResult`.
- `convex/track-payment/edit-context.ts`: move selection/option/ticket joins and the `getTrackPaymentEditContext` handler implementation.
- `convex/track-payment/edit-service.ts`: move the `updateAccommodation` mutation service from ownership verification through audit insertion; keep all writes under the supplied `MutationCtx` transaction.

Leave `api.publicTracking.getByBookingRef`, `api.publicTracking.getByEmailOrBookingRef`, `api.publicTracking.getTrackPaymentEditContext`, and `api.publicTracking.updateAccommodation` unchanged by delegating from the current route file. Rough effort: 1.5-2.5 days. This preserves the public contract while isolating the high-risk edit path.

## 5. `convex/signupCatalog.ts`

### Current size

1,384 lines; nine exported declarations, including two public queries and the shared accommodation context/selection resolver used by quote and submission paths.

### Responsibility inventory

- Public catalog validators and response-contract types for tickets, accommodation, slots, categories, options, and receipt lines (lines 18-187).
- Ticket mapping, unavailable-reason normalization, and aggregate capacity policy (lines 189-292).
- Legacy assignable-slot inventory projection for the public catalog (lines 294-401).
- Database-backed public accommodation context loading and category/option resolution (lines 403-520).
- Included-category and night-before display-rate resolution (lines 522-637).
- The shared public selection resolver: occupancy/category entitlement, night-before rules, option validation, superior-upgrade constraints, and normalized pricing inputs (lines 639-861).
- Ticket room-type/category entitlement resolution (lines 863-933).
- `getPublicSignupCatalog`: open-event catalog, source/ticket joins, legacy slots, options-only catalog, and display projections (lines 935-1173).
- `getPublicSignupAccommodationQuote`: quote request validation, aggregate ticket capacity, entitlement checks, selection resolution, canonical amount derivation, and response assembly (lines 1175-1384).

### Severity: HIGH

This file is both the public catalog API and the central accommodation policy library. The same module owns pure rules, database context loading, legacy physical-slot compatibility, a broad event catalog query, and quote calculation. Quote and submission correctness depend on the shared resolver, but catalog presentation and legacy slot behavior do not need to evolve in the same module.

### Concrete split proposal

Keep the two public route names in a small `convex/signupCatalog.ts` facade and extract:

- `lib/domain/signup/accommodation-selection.ts`: move `resolveIncludedStayCategory`, `resolveNightBeforeDisplayRates`, `resolvePublicSignupSelection`, `isTicketCapacityExceeded`, and their validators/types that do not require database access.
- `convex/signup/accommodation-context.ts`: move `loadPublicSignupAccommodationContext` and its DB row-to-context mapping.
- `convex/signup/ticket-entitlements.ts`: move `resolveTicketCategoryById`, `mapTicket`, and unavailable-reason normalization.
- `convex/signup/legacy-slot-catalog.ts`: move `getAssignableSlotSummaries` and the compatibility slot contract.
- `convex/signup/catalog-service.ts`: move the `getPublicSignupCatalog` handler implementation.
- `convex/signup/quote-service.ts`: move the `getPublicSignupAccommodationQuote` handler implementation.

The facade keeps `api.signupCatalog.getPublicSignupCatalog` and `api.signupCatalog.getPublicSignupAccommodationQuote` stable, while `signupSubmission.ts` and `publicTracking.ts` import the shared context/resolver from the new ownership modules. Rough effort: 1.5-2 days. This is extraction around existing boundaries, not a rewrite of pricing policy.

## 6. `components/track-payment/TrackPaymentAccommodationEditor.tsx`

### Current size

920 lines in one client module.

### Responsibility inventory

- Public edit-context/result/draft contracts, request-body serialization, error-message mapping, and idempotency-key generation (lines 23-187 and 821-826).
- Parent editor state hydration, ownership inputs, completion checks, save workflow, status handling, and API submission (lines 189-507).
- Per-attendee accommodation option controls, quantity/night steppers, night-before radio controls, and explanatory copy (lines 508-819).
- HTTP transport (`submitTrackPaymentEdit`) and response coercion (lines 828-870).
- Result/balance panel presentation (lines 872-920).

### Severity: MEDIUM

The parent editor, a reusable fieldset, transport/serialization, and the result panel have separate responsibilities and test/change surfaces. The file is not a backend god module, but it is large enough that changes to request security/transport or balance display are mixed with dense interactive form markup.

### Concrete split proposal

- `components/track-payment/edit-types.ts`: move `TrackPaymentEditSelection`, `TrackPaymentEditResult`, `TrackPaymentEditContext`, `Draft`, and `SubmitStatus`.
- `lib/domain/track-payment/edit-client.ts`: move `buildTrackPaymentEditBody`, `messageForEditError`, `newIdempotencyKey`, and `submitTrackPaymentEdit`.
- `components/track-payment/AttendeePreferenceFieldset.tsx`: move the fieldset from lines 508-819; pass the attendee, draft, context, and `onChange` callback.
- `components/track-payment/TrackPaymentEditResultPanel.tsx`: move the result panel from lines 872-920.

Leave `TrackPaymentAccommodationEditor.tsx` as the stateful coordinator and update its imports. Rough effort: 0.5-1 day; no route or public contract changes.

## 7. `components/signup/SignupFlowShell.tsx`

### Current size

806 lines in one client component.

### Responsibility inventory

- Draft initialization, quote-result/error guards, catalog normalization, and all derived validation/quote state (lines 54-292).
- Step gating, navigation, ticket-change invalidation, attendee/booker/accommodation field updates, CAPTCHA handling, and submission/redirect flow (lines 294-613).
- Desktop/mobile layout, progress sidebar, summary placement, all five step render branches, and navigation composition (lines 615-805).

### Severity: MEDIUM

This is both a flow controller and the complete page layout. Its stateful callbacks close over catalog, draft, quote, validation, CAPTCHA, and router state, while the render portion embeds desktop/mobile shells and all step selection. It is difficult to modify a step without understanding submission and quote lifecycle code.

### Concrete split proposal

- `components/signup/useSignupFlowController.ts`: move draft/catalog/quote state, validation snapshots, step gating, field-change handlers, CAPTCHA state, and `handleSubmitFromReview`; return a typed controller view model.
- `components/signup/SignupStepContent.tsx`: move the active-step branches and per-step incomplete messages from lines 684-755.
- `components/signup/SignupSidebar.tsx`: move progress and desktop summary layout from lines 632-667.
- `components/signup/SignupMobileSummary.tsx`: move the mobile summary block from lines 787-801.

Keep `SignupFlowShell.tsx` as the route-facing composition/layout wrapper, with `SignupHeader` and `SignupNavigation` still owned by their existing modules. Rough effort: 1-1.5 days; preserve the `SignupFlowShell` export and `/signup/[slug]` route.

## 8. `convex/emailActions.ts`

### Current size

332 lines; four Convex actions plus three distinct email workflows.

### Responsibility inventory

- Signup-confirmation argument/return contracts, HTML/text rendering, Resend transport, send logging, and internal/test action exports (lines 16-147 and 221-231).
- Order-confirmation resend data loading, URL construction, send invocation, and resend logging (lines 149-219 and 327-332).
- Announcement test-send argument/return contracts, announcement rendering, single-recipient transport, and announcement logging (lines 233-325).
- Shared environment-based sender configuration and Resend component setup (lines 12-14 and 118-127/294-303).

### Severity: MEDIUM

The file mixes transactional signup confirmation, operator resend behavior, and announcement test delivery. These workflows have different authorization/operational ownership and different templates, but share one module-level Node action runtime and transport setup. The announcement path can be changed or exposed accidentally while working on transactional mail.

### Concrete split proposal

Split the decorated actions into:

- `convex/email/signupConfirmation.ts`: `sendSignupConfirmation` and `sendSignupConfirmationTest`, their args/returns, and signup template rendering.
- `convex/email/orderConfirmationResend.ts`: `resendOrderConfirmation` and the order/event lookup plus resend-specific logging.
- `convex/email/announcementTest.ts`: `sendAnnouncementTest`, its contract, and announcement template rendering.
- `convex/email/transport.ts`: Node-only sender construction, from-address resolution, and small send/log helpers shared by the three actions.

Update `internal.emailActions.sendSignupConfirmation` in `convex/signupSubmission.ts` and `convex/emailMutations.ts`, `api.emailActions.sendSignupConfirmationTest` in `components/dashboard/resend-test-section.tsx`, and `api.emailActions.resendOrderConfirmation` in `components/dashboard/finance/legacy-order-detail-surface.tsx` to the new route paths; regenerate the Convex API. If route stability is mandatory, retain `emailActions.ts` only as a documented compatibility facade rather than continuing to house workflow logic. Rough effort: 0.5-1 day.
