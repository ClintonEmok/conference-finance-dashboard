import { defineSchema, defineTable } from "convex/server"
import { v } from "convex/values"

export default defineSchema({
  users: defineTable(
    v.object({
      name: v.string(),
      email: v.string(),
      emailVerified: v.boolean(),
      image: v.optional(v.string()),
    })
  ).index("email", ["email"]),

  sessions: defineTable(
    v.object({
      expiresAt: v.number(),
      token: v.string(),
      ipAddress: v.optional(v.string()),
      userAgent: v.optional(v.string()),
      userId: v.string(),
    })
  )
    .index("userId", ["userId"])
    .index("token", ["token"]),

  accounts: defineTable(
    v.object({
      accountId: v.string(),
      providerId: v.string(),
      userId: v.string(),
      accessToken: v.optional(v.string()),
      refreshToken: v.optional(v.string()),
      idToken: v.optional(v.string()),
      accessTokenExpiresAt: v.optional(v.number()),
      refreshTokenExpiresAt: v.optional(v.number()),
      scope: v.optional(v.string()),
      password: v.optional(v.string()),
    })
  ).index("userId", ["userId"]),

  verifications: defineTable(
    v.object({
      identifier: v.string(),
      value: v.string(),
      expiresAt: v.number(),
    })
  ).index("identifier", ["identifier"]),

  events: defineTable(
    v.object({
      slug: v.string(),
      title: v.string(),
      startsAt: v.number(),
      endsAt: v.optional(v.number()),
      timezone: v.string(),
      currency: v.string(),
      isPublished: v.boolean(),
      isSignupOpen: v.boolean(),
      accommodationEnabled: v.boolean(),
      defaultRoomTypeId: v.optional(v.id("accommodationRoomTypes")),
      primarySourceKind: v.union(
        v.literal("integration"),
        v.literal("internal")
      ),
      primarySourceProvider: v.optional(v.string()),
      updatedAt: v.number(),
    })
  )
    .index("by_slug", ["slug"])
    .index("by_startsAt", ["startsAt"])
    .index("by_signup_visibility", ["isPublished", "isSignupOpen"]),

  eventSources: defineTable(
    v.object({
      eventId: v.id("events"),
      provider: v.string(),
      externalEventId: v.string(),
      syncStatus: v.union(
        v.literal("active"),
        v.literal("paused"),
        v.literal("error")
      ),
      lastSyncedAt: v.optional(v.number()),
      providerSnapshotRef: v.optional(v.string()),
      updatedAt: v.number(),
    })
  )
    .index("by_provider_and_externalEventId", ["provider", "externalEventId"])
    .index("by_eventId", ["eventId"])
    .index("by_eventId_and_provider", ["eventId", "provider"]),

  ticketTypes: defineTable(
    v.object({
      eventId: v.id("events"),
      label: v.string(),
      priceMinor: v.number(),
      lateSurchargeMinor: v.optional(v.number()),
      lateSurchargeEffectiveAt: v.optional(v.number()),
      maxQuantity: v.optional(v.number()),
      sortOrder: v.optional(v.number()),
      soldCount: v.optional(v.number()),
      isActive: v.boolean(),
      visibility: v.union(v.literal("public"), v.literal("hidden")),
      availabilityState: v.union(
        v.literal("selectable"),
        v.literal("unavailable")
      ),
      unavailableReason: v.optional(v.string()),
      roomTypeId: v.optional(v.id("accommodationRoomTypes")),
      accommodationIncluded: v.optional(v.boolean()),
      requiresBed: v.optional(v.boolean()),
      updatedAt: v.number(),
    })
  )
    .index("by_eventId", ["eventId"])
    .index("by_eventId_and_availabilityState", [
      "eventId",
      "availabilityState",
    ]),

  accommodationSlots: defineTable(
    v.object({
      eventId: v.id("events"),
      hotelId: v.id("accommodationHotels"),
      roomId: v.id("accommodationRooms"),
      slotLabel: v.string(),
      genderPolicy: v.union(
        v.literal("male"),
        v.literal("female"),
        v.literal("mixed")
      ),
      isAssignable: v.boolean(),
      ineligibilityReason: v.optional(v.string()),
      updatedAt: v.number(),
    })
  )
    .index("by_eventId", ["eventId"])
    .index("by_eventId_and_isAssignable", ["eventId", "isAssignable"]),

  orders: defineTable(
    v.object({
      eventId: v.optional(v.id("events")),
      source: v.optional(
        v.union(v.literal("integration"), v.literal("internal"))
      ),
      idempotencyKey: v.optional(v.string()),
      bookingRef: v.optional(v.string()),
      honeypotSeen: v.optional(v.boolean()),
      notes: v.optional(v.string()),
      bookerName: v.optional(v.string()),
      bookerEmail: v.optional(v.string()),
      bookerPhone: v.optional(v.string()),
      submittedAt: v.optional(v.number()),
      currency: v.optional(v.string()),
      totalAmountMinor: v.optional(v.number()),
      status: v.optional(
        v.union(
          v.literal("paid"),
          v.literal("refunded"),
          v.literal("cancelled"),
          v.literal("pending")
        )
      ),
      providerOrderId: v.optional(v.string()),
      providerEventId: v.optional(v.string()),
      orderedAt: v.optional(v.number()),
      // Core merge markers: when an order is merged into a target, these
      // fields mark the source as removed. Internal signup orders without a
      // Ticket Tailor extension are marked merged through these fields rather
      // than through extension-level `removedAt`.
      mergedIntoOrderId: v.optional(v.id("orders")),
      mergedAt: v.optional(v.number()),
      mergeReason: v.optional(v.string()),
    })
  )
    .index("by_eventId", ["eventId"])
    .index("by_bookingRef", ["bookingRef"])
    .index("by_submittedAt", ["submittedAt"])
    .index("by_providerOrderId", ["providerOrderId"])
    .index("by_providerEventId", ["providerEventId"])
    .index("by_status", ["status"])
    .index("by_email", ["bookerEmail"]),

  /**
   * Server-owned, bounded search projections.  These tables intentionally do
   * not add search concerns to the canonical finance documents.
   */
  searchDocuments: defineTable(
    v.object({
      kind: v.union(v.literal("order"), v.literal("attendee")),
      subjectId: v.string(),
      eventId: v.id("events"),
      searchText: v.string(),
      sortAt: v.number(),
      isSearchable: v.boolean(),
      updatedAt: v.number(),
    })
  )
    .index("by_kind_and_eventId_and_sortAt_and_subjectId", [
      "kind",
      "eventId",
      "sortAt",
      "subjectId",
    ])
    .index("by_kind_and_sortAt_and_subjectId_and_eventId", [
      "kind",
      "sortAt",
      "subjectId",
      "eventId",
    ])
    .index("by_kind_and_subjectId", ["kind", "subjectId"])
    .searchIndex("search_text", {
      searchField: "searchText",
      filterFields: ["kind", "eventId"],
    }),

  /**
   * @deprecated Term postings were replaced by the native
   * `searchDocuments.search_text` full-text search index. This table is no
   * longer read or written by application code; it is retained only because
   * dropping a non-empty table is a destructive deploy. Its removal is
   * slated for a separate, operator-gated migration.
   */
  searchDocumentTerms: defineTable(
    v.object({
      documentKey: v.string(),
      kind: v.union(v.literal("order"), v.literal("attendee")),
      eventId: v.id("events"),
      term: v.string(),
      sortAt: v.number(),
      subjectId: v.string(),
    })
  )
    .index("by_kind_and_eventId_and_sortAt_and_subjectId_and_term", [
      "kind",
      "eventId",
      "sortAt",
      "subjectId",
      "term",
    ])
    .index("by_kind_and_sortAt_and_subjectId_and_eventId_and_term", [
      "kind",
      "sortAt",
      "subjectId",
      "eventId",
      "term",
    ])
    .index("by_kind_and_eventId_and_term_and_sortAt_and_subjectId", [
      "kind",
      "eventId",
      "term",
      "sortAt",
      "subjectId",
    ])
    .index("by_kind_and_term_and_sortAt_and_subjectId_and_eventId", [
      "kind",
      "term",
      "sortAt",
      "subjectId",
      "eventId",
    ])
    .index("by_documentKey", ["documentKey"]),

  searchProjectionFanoutJobs: defineTable(
    v.object({
      operation: v.union(
        v.literal("order"),
        v.literal("ticketType"),
        v.literal("family")
      ),
      targetId: v.string(),
      continuationCursor: v.union(v.string(), v.null()),
      status: v.union(
        v.literal("pending"),
        v.literal("running"),
        v.literal("blocked"),
        v.literal("complete")
      ),
      processedCount: v.number(),
      attemptCount: v.number(),
      lastError: v.optional(v.string()),
      createdAt: v.number(),
      updatedAt: v.number(),
      completedAt: v.optional(v.number()),
    })
  )
    .index("by_targetId_and_status", ["targetId", "status"])
    .index("by_status_and_continuationCursor", ["status", "continuationCursor"]),

  /**
   * Booking-reference alias table: one row per source order bookingRef that
   * was preserved when a whole-order merge moved it into a target. The
   * alias-first resolver checks this table before falling back to the
   * orders.by_bookingRef index, so old public tracking links, manage-booking
   * edit-context lookups, and signup-submission booking-ref lookups continue
   * to resolve to the merged target.
   */
  orderBookingRefAliases: defineTable(
    v.object({
      /** The normalized (trim+uppercase) source booking reference. */
      bookingRef: v.string(),
      /** The source order whose booking ref produced this alias. */
      sourceOrderId: v.id("orders"),
      /** The canonical target order that owns all data. */
      targetOrderId: v.id("orders"),
      /** The target order's canonical booking ref (for reference). */
      canonicalBookingRef: v.optional(v.string()),
      createdAt: v.number(),
    })
  )
    .index("by_bookingRef", ["bookingRef"])
    .index("by_sourceOrderId", ["sourceOrderId"])
    .index("by_targetOrderId", ["targetOrderId"]),

  orderAttendees: defineTable(
    v.object({
      orderId: v.id("orders"),
      // D-06 (Phase 62): copied from the attendee's order in the same mutation
      // that inserts the row. An order's event cannot change — both movers
      // (orders.mergeOrders, attendees.moveAttendeeToOrder) refuse cross-event
      // targets — so this copy cannot go stale. It makes the event-scoped
      // attendee search a single `by_eventId` range. Optional for additive
      // deployment: legacy rows predate the field and are filled by the
      // operator-gated `backfillAttendeeEventIds` migration.
      eventId: v.optional(v.id("events")),
      attendeeKey: v.string(),
      name: v.string(),
      email: v.optional(v.string()),
      phone: v.optional(v.string()),
      gender: v.union(
        v.literal("male"),
        v.literal("female"),
        v.literal("mixed"),
        v.literal("unknown")
      ),
      location: v.optional(v.string()),
      dietaryRestrictions: v.optional(v.string()),
      roommatePreference: v.optional(v.string()),
      roommateAvoid: v.optional(v.string()),
      sortOrder: v.number(),
      assignedRoomId: v.optional(v.string()),
      allocationPriority: v.optional(
        v.union(
          v.literal("CRITICAL"),
          v.literal("HIGH"),
          v.literal("NORMAL"),
          v.literal("LOW")
        )
      ),
      allocatedRoomTypeId: v.optional(v.id("accommodationRoomTypes")),
      priorityReason: v.optional(v.string()),
    })
  )
    .index("by_orderId", ["orderId"])
    .index("by_eventId", ["eventId"])
    .index("by_assignedRoomId", ["assignedRoomId"])
    .index("by_allocationPriority", ["allocationPriority"]),

  orderTicketSelections: defineTable(
    v.object({
      orderId: v.id("orders"),
      attendeeId: v.id("orderAttendees"),
      ticketTypeId: v.id("ticketTypes"),
      quantity: v.number(),
      sortOrder: v.number(),
      ticketPriceSnapshot: v.optional(
        v.object({
          basePriceMinor: v.number(),
          surchargeMinor: v.number(),
          unitPriceMinor: v.number(),
          pricedAt: v.number(),
          lateSurchargeEffectiveAt: v.optional(v.number()),
        })
      ),
    })
  )
    .index("by_orderId", ["orderId"])
    .index("by_ticketTypeId", ["ticketTypeId"])
    .index("by_attendeeId", ["attendeeId"]),

  orderAssignments: defineTable(
    v.object({
      orderId: v.id("orders"),
      attendeeId: v.id("orderAttendees"),
      slotId: v.id("accommodationSlots"),
      assignmentIntent: v.union(v.literal("assign"), v.literal("skip")),
      sortOrder: v.number(),
      status: v.optional(
        v.union(
          v.literal("pending"),
          v.literal("confirmed"),
          v.literal("declined"),
          v.literal("converted")
        )
      ),
      confirmedAt: v.optional(v.number()),
      confirmedBy: v.optional(v.string()),
    })
  )
    .index("by_orderId", ["orderId"])
    .index("by_slotId", ["slotId"])
    .index("by_attendeeId", ["attendeeId"])
    .index("by_status", ["status"]),

  orderAccommodationSelections: defineTable(
    v.object({
      orderId: v.id("orders"),
      attendeeId: v.id("orderAttendees"),
      categoryId: v.optional(v.id("accommodationCategories")),
      occupancy: v.optional(
        v.union(
          v.literal("single"),
          v.literal("shared"),
          v.literal("family")
        )
      ),
      // Legacy dual-read fields from v5. New selections are persisted as
      // `orderAccommodationOptionSelections` child rows instead; the booleans
      // and age-band code remain readable for historical rows.
      upgradeSelected: v.optional(v.boolean()),
      cotSelected: v.optional(v.boolean()),
      ageBandCode: v.optional(v.string()),
      checkInAt: v.optional(v.number()),
      checkOutAt: v.optional(v.number()),
      nightCount: v.optional(v.number()),
      // Simplified contract: the independent one-night night-before level.
      // `nightCount` on a new row is the derived total stay (base + 1 when a
      // level is present); this field records which level was chosen so the
      // canonical loader can re-derive the Superior premium line exactly.
      nightBeforeLevel: v.optional(
        v.union(v.literal("standard"), v.literal("superior"))
      ),
      // Independent occupancy for the one-night night-before stay. Historical
      // rows omit this and fall back to the main ticket occupancy.
      nightBeforeOccupancy: v.optional(
        v.union(v.literal("single"), v.literal("shared"))
      ),
      // Phase 44 confirmation contract (schema shape only): the
      // assignment-confirm flow atomically writes confirmedAt,
      // configVersion = eventAccommodationConfig.updatedAt, and the pure
      // helper's immutable priceSnapshot. The Phase 40 loader fails closed
      // when a row is confirmed without a complete snapshot. The snapshot's
      // decision fields are resolved at confirmation so a confirmed row is
      // priced exclusively from the snapshot, never from live selection
      // flags.
      confirmedAt: v.optional(v.number()),
      configVersion: v.optional(v.number()),
      priceSnapshot: v.optional(
        v.object({
          baseRatePerNightMinor: v.number(),
          totalNights: v.number(),
          coveredNights: v.number(),
          nightBeforeRatePerNightMinor: v.optional(v.number()),
          nightBeforeNights: v.optional(v.number()),
          categoryIsSuperior: v.optional(v.boolean()),
          upgradeSelected: v.optional(v.boolean()),
          cotSelected: v.optional(v.boolean()),
          optionLines: v.optional(
            v.array(
              v.object({
                optionKey: v.string(),
                label: v.string(),
                pricePerUnitMinor: v.number(),
                quantity: v.number(),
                nights: v.number(),
                chargeMinor: v.number(),
              })
            )
          ),
        })
      ),
    })
  )
    .index("by_orderId", ["orderId"])
    .index("by_attendeeId", ["attendeeId"])
    .index("by_orderId_and_attendeeId", ["orderId", "attendeeId"]),

  orderAccommodationOptionSelections: defineTable(
    v.object({
      orderId: v.id("orders"),
      attendeeId: v.id("orderAttendees"),
      selectionId: v.id("orderAccommodationSelections"),
      optionKey: v.string(),
      quantity: v.number(),
      nights: v.number(),
      sortOrder: v.number(),
    })
  )
    .index("by_selectionId", ["selectionId"])
    .index("by_orderId", ["orderId"])
    .index("by_orderId_and_attendeeId", ["orderId", "attendeeId"]),

  /**
   * Append-only audit trail for public track-payment accommodation edits
   * (Phase 43). One immutable row is written per applied replace-style edit;
   * an idempotent replay of an already-applied key returns the stored result
   * and never writes a second row. Every value is server-derived — the
   * mutation never accepts a client amount, digest, or money figure. The row
   * persists the COMPLETE canonical response (amount due, paid, remaining,
   * progress, overpayment) so a replay returns the exact originally stored
   * money result (CR-08) instead of re-reading mutable payment rows that may
   * have drifted since the edit was applied. Audit rows are evidence of
   * accepted edits, not a second pricing source.
   */
  orderAccommodationEditAudits: defineTable(
    v.object({
      orderId: v.id("orders"),
      idempotencyKey: v.string(),
      requestDigest: v.string(),
      ownershipMethod: v.union(
        v.literal("email"),
        v.literal("token"),
        v.literal("link")
      ),
      beforeSelectionDigest: v.string(),
      afterSelectionDigest: v.string(),
      amountDueBeforeMinor: v.number(),
      amountDueAfterMinor: v.number(),
      totalPaidMinor: v.number(),
      remainingMinor: v.number(),
      progressPercent: v.number(),
      overpaymentDeltaMinor: v.number(),
    })
  )
    .index("by_orderId_and_idempotencyKey", ["orderId", "idempotencyKey"])
    .index("by_orderId_and_requestDigest", ["orderId", "requestDigest"]),

  orderIdempotency: defineTable(
    v.object({
      eventId: v.id("events"),
      idempotencyKey: v.string(),
      fingerprint: v.string(),
      orderId: v.id("orders"),
      expiresAt: v.number(),
    })
  )
    .index("by_eventId_and_idempotencyKey", ["eventId", "idempotencyKey"])
    .index("by_eventId_and_fingerprint", ["eventId", "fingerprint"])
    .index("by_orderId", ["orderId"])
    .index("by_expiresAt", ["expiresAt"]),

  ticketTailorWebhookEvents: defineTable(
    v.object({
      providerEventId: v.string(),
      eventType: v.string(),
      payload: v.any(),
      canonicalPayload: v.optional(v.any()),
      status: v.optional(
        v.union(
          v.literal("pending"),
          v.literal("processed"),
          v.literal("failed")
        )
      ),
      deliveryCount: v.optional(v.number()),
      attempts: v.optional(v.number()),
      lastError: v.optional(v.string()),
      nextRetryAt: v.optional(v.number()),
      canonicalFetchedAt: v.optional(v.number()),
      processedAt: v.optional(v.number()),
      receivedAt: v.optional(v.number()),
      lastReceivedAt: v.optional(v.number()),
    })
  )
    .index("providerEventId", ["providerEventId"])
    .index("status_nextRetry", ["status", "nextRetryAt"])
    .index("eventType", ["eventType"]),

  ticketTailorEvents: defineTable(
    v.object({
      providerEventId: v.string(),
      name: v.optional(v.string()),
      startsAt: v.optional(v.number()),
      endsAt: v.optional(v.number()),
      timezone: v.optional(v.string()),
      currency: v.optional(v.string()),
      rawPayload: v.any(),
    })
  )
    .index("providerEventId", ["providerEventId"])
    .index("startsAt", ["startsAt"]),

  ticketTailorOrders: defineTable(
    v.object({
      providerOrderId: v.string(),
      providerEventId: v.string(),
      orderId: v.id("orders"),
      providerStatus: v.optional(v.string()),
      normalizedStatus: v.optional(
        v.union(
          v.literal("paid"),
          v.literal("refunded"),
          v.literal("cancelled"),
          v.literal("pending")
        )
      ),
      isArchived: v.optional(v.boolean()),
      archivedAt: v.optional(v.number()),
      archiveReason: v.optional(v.string()),
      removedAt: v.optional(v.number()),
      removedReason: v.optional(v.string()),
      normalizationNote: v.optional(v.string()),
      refundedAt: v.optional(v.number()),
      cancelledAt: v.optional(v.number()),
      rawPayload: v.any(),
    })
  )
    .index("providerOrderId", ["providerOrderId"])
    .index("providerEventId", ["providerEventId"])
    .index("orderId", ["orderId"])
    .index("normalizedStatus", ["normalizedStatus"]),

  ticketTailorAttendees: defineTable(
    v.object({
      providerAttendeeId: v.optional(v.string()),
      providerIssuedTicketId: v.optional(v.string()),
      providerTicketTypeId: v.optional(v.string()),
      providerEventId: v.string(),
      providerOrderId: v.string(),
      orderId: v.id("orders"),
      attendeeId: v.optional(v.id("orderAttendees")),
      ticketTypeLabel: v.optional(v.string()),
      ticketStatus: v.optional(v.string()),
      checkedInAt: v.optional(v.number()),
      rawPayload: v.any(),
      customAnswers: v.optional(v.any()),
      genderType: v.optional(
        v.union(
          v.literal("MALE"),
          v.literal("FEMALE"),
          v.literal("MIXED"),
          v.literal("UNKNOWN")
        )
      ),
      ageGroup: v.optional(v.string()),
      ticketCategory: v.optional(v.string()),
      tikkieAmountOverrideMinor: v.optional(v.number()),
      assignedRoomId: v.optional(v.string()),
      allocationPriority: v.optional(
        v.union(
          v.literal("CRITICAL"),
          v.literal("HIGH"),
          v.literal("NORMAL"),
          v.literal("LOW")
        )
      ),
      priorityReason: v.optional(v.string()),
      name: v.optional(v.string()),
      email: v.optional(v.string()),
      phone: v.optional(v.string()),
      location: v.optional(v.string()),
      dietaryRestrictions: v.optional(v.string()),
      roommatePreference: v.optional(v.string()),
      roommateAvoid: v.optional(v.string()),
    })
  )
    .index("providerAttendeeId", ["providerAttendeeId"])
    .index("providerIssuedTicketId", ["providerIssuedTicketId"])
    .index("providerEventOrder", ["providerEventId", "providerOrderId"])
    .index("orderId", ["orderId"])
    .index("attendeeId", ["attendeeId"])
    .index("genderType", ["genderType"])
    .index("by_assignedRoomId", ["assignedRoomId"])
    .index("by_email", ["email"]),

  accommodationHotels: defineTable(
    v.object({
      name: v.string(),
      city: v.optional(v.string()),
      address: v.optional(v.string()),
      notes: v.optional(v.string()),
    })
  ).index("name", ["name"]),

  accommodationEventHotels: defineTable(
    v.object({
      eventId: v.string(),
      hotelId: v.string(),
    })
  )
    .index("eventId_hotelId", ["eventId", "hotelId"])
    .index("hotelId", ["hotelId"]),

  tikkiePaymentTemplates: defineTable(
    v.object({
      eventId: v.string(),
      ticketTypeLabel: v.string(),
      amountMinor: v.number(),
      descriptionTemplate: v.string(),
      expiryDays: v.optional(v.number()),
      isActive: v.optional(v.boolean()),
    })
  )
    .index("eventId_ticketType", ["eventId", "ticketTypeLabel"])
    .index("eventId", ["eventId"]),

  accommodationRoomTypes: defineTable(
    v.object({
      label: v.string(),
      defaultCapacity: v.number(),
      notes: v.optional(v.string()),
      count: v.optional(v.number()),
      description: v.optional(v.string()),
      categoryId: v.optional(v.id("accommodationCategories")),
    })
  )
    .index("label", ["label"])
    .index("by_categoryId", ["categoryId"]),

  accommodationCategories: defineTable(
    v.object({
      code: v.union(
        v.literal("standard"),
        v.literal("superior"),
        v.literal("family")
      ),
      label: v.string(),
      description: v.optional(v.string()),
      sortOrder: v.number(),
    })
  )
    .index("by_code", ["code"])
    .index("by_sortOrder", ["sortOrder"]),

  accommodationOptions: defineTable(
    v.object({
      code: v.string(),
      label: v.string(),
      description: v.optional(v.string()),
      kind: v.union(
        v.literal("addon"),
        v.literal("upgrade"),
        v.literal("eligibility")
      ),
      unit: v.union(v.literal("per_night"), v.literal("per_person")),
    })
  ).index("by_code", ["code"]),

  accommodationRooms: defineTable(
    v.object({
      hotelId: v.string(),
      roomTypeId: v.string(),
      label: v.string(),
      capacity: v.number(),
      occupiedBeds: v.optional(v.number()),
      notes: v.optional(v.string()),
    })
  )
    .index("hotelId_label", ["hotelId", "label"])
    .index("roomTypeId", ["roomTypeId"])
    .index("hotelId_capacity", ["hotelId", "capacity"]),

  eventAccommodationConfig: defineTable(
    v.object({
      eventId: v.id("events"),
      baseCheckInAt: v.number(),
      baseCheckOutAt: v.number(),
      allowExtendedStayBefore: v.boolean(),
      allowExtendedStayAfter: v.boolean(),
      allowExtendedStayBoth: v.boolean(),
      defaultCategoryId: v.optional(v.id("accommodationCategories")),
      breakfastIncluded: v.boolean(),
      nightCount: v.number(),
      updatedAt: v.number(),
    })
  ).index("by_eventId", ["eventId"]),

  eventAccommodationRates: defineTable(
    v.object({
      eventId: v.id("events"),
      categoryId: v.id("accommodationCategories"),
      occupancy: v.union(
        v.literal("single"),
        v.literal("shared"),
        v.literal("family")
      ),
      pricePerPersonMinor: v.number(),
    })
  )
    .index("by_eventId", ["eventId"])
    .index("by_eventId_and_categoryId", ["eventId", "categoryId"])
    .index("by_eventId_and_categoryId_and_occupancy", [
      "eventId",
      "categoryId",
      "occupancy",
    ]),

  eventAccommodationOptions: defineTable(
    v.object({
      eventId: v.id("events"),
      optionId: v.id("accommodationOptions"),
      enabled: v.boolean(),
      priceMinor: v.number(),
      // Legacy field retained for historical rows; no longer used by any flow.
      eligibilityAgeBandCode: v.optional(v.string()),
      notes: v.optional(v.string()),
    })
  )
    .index("by_eventId", ["eventId"])
    .index("by_eventId_and_optionId", ["eventId", "optionId"])
    .index("by_eventId_and_enabled", ["eventId", "enabled"]),

  eventAccommodationResources: defineTable(
    v.object({
      eventId: v.id("events"),
      kind: v.union(v.literal("room"), v.literal("cot")),
      roomTypeId: v.optional(v.id("accommodationRoomTypes")),
      count: v.number(),
    })
  )
    .index("by_eventId", ["eventId"])
    .index("by_eventId_and_kind", ["eventId", "kind"])
    .index("by_eventId_and_kind_and_roomTypeId", [
      "eventId",
      "kind",
      "roomTypeId",
    ]),

  tikkiePaymentLinks: defineTable(
    v.object({
      providerOrderId: v.string(),
      providerEventId: v.string(),
      orderId: v.optional(v.string()),
      eventId: v.optional(v.string()),
      linkType: v.optional(v.union(v.literal("event"), v.literal("order"))),
      paymentRequestToken: v.string(),
      paymentRequestUrl: v.string(),
      status: v.optional(
        v.union(v.literal("created"), v.literal("paid"), v.literal("expired"))
      ),
      statusSource: v.optional(
        v.union(v.literal("create"), v.literal("webhook"), v.literal("poll"))
      ),
      providerStatus: v.string(),
      amountMinor: v.number(),
      description: v.string(),
      expiryDate: v.number(),
      referenceId: v.optional(v.string()),
      providerPayload: v.optional(v.any()),
      providerLastCheckedAt: v.optional(v.number()),
      statusUpdatedAt: v.optional(v.number()),
      purpose: v.optional(v.union(v.literal("payment"), v.literal("donation"))),
    })
  )
    .index("paymentRequestToken", ["paymentRequestToken"])
    .index("providerOrderEvent", ["providerOrderId", "providerEventId"])
    .index("status_updated", ["status", "statusUpdatedAt"])
    .index("by_linkType_and_status_and_statusUpdatedAt", [
      "linkType",
      "status",
      "statusUpdatedAt",
    ])
    .index("orderId", ["orderId"])
    .index("eventId_linkType", ["eventId", "linkType"])
    .index("eventId", ["eventId"])
    .index("linkType", ["linkType"])
    .index("by_eventId_and_purpose", ["eventId", "purpose"]),

  tikkiePaymentLinkTransitions: defineTable(
    v.object({
      paymentLinkId: v.string(),
      fromStatus: v.union(
        v.literal("created"),
        v.literal("paid"),
        v.literal("expired")
      ),
      toStatus: v.union(
        v.literal("created"),
        v.literal("paid"),
        v.literal("expired")
      ),
      source: v.union(
        v.literal("create"),
        v.literal("webhook"),
        v.literal("poll")
      ),
      providerNotificationKey: v.optional(v.string()),
      providerStatus: v.string(),
      reason: v.optional(v.string()),
      providerPayload: v.optional(v.any()),
    })
    )
    .index("paymentLinkId", ["paymentLinkId"])
    .index("providerNotificationKey", ["providerNotificationKey"]),

  tikkiePayments: defineTable(
    v.object({
      paymentLinkId: v.string(),
      paymentRequestToken: v.string(),
      paymentToken: v.string(),
      payerName: v.string(),
      payerAccountNumber: v.optional(v.string()),
      amountMinor: v.number(),
      paidAt: v.number(),
      description: v.optional(v.string()),
      orderId: v.optional(v.string()),
      matchStatus: v.union(
        v.literal("unmatched"),
        v.literal("auto_matched"),
        v.literal("manual")
      ),
      matchedAt: v.optional(v.number()),
      providerPayload: v.optional(v.any()),
    })
  )
    .index("paymentLinkId", ["paymentLinkId"])
    .index("paymentRequestToken", ["paymentRequestToken"])
    .index("matchStatus", ["matchStatus"])
    .index("paymentToken", ["paymentToken"])
    .index("orderId", ["orderId"]),

  reportShares: defineTable(
    v.object({
      eventId: v.id("events"),
      token: v.string(),
      region: v.optional(v.string()),
      createdAt: v.number(),
      revokedAt: v.optional(v.number()),
      createdByUserId: v.optional(v.string()),
    })
  )
    .index("token", ["token"])
    .index("by_eventId", ["eventId"]),

  ticketTailorSyncRuns: defineTable(
    v.object({
      status: v.optional(
        v.union(
          v.literal("running"),
          v.literal("success"),
          v.literal("partial"),
          v.literal("failed")
        )
      ),
      startedAt: v.optional(v.number()),
      finishedAt: v.optional(v.number()),
      eventsScanned: v.optional(v.number()),
      ordersFetched: v.optional(v.number()),
      ordersUpserted: v.optional(v.number()),
      ordersArchived: v.optional(v.number()),
      normalizedFallbackCount: v.optional(v.number()),
      failedItems: v.optional(v.number()),
      errorSummary: v.optional(v.string()),
      diagnostics: v.optional(v.any()),
    })
  ).index("startedAt", ["startedAt"]),

  attendeeFamilyGroups: defineTable(
    v.object({
      label: v.optional(v.string()),
      primaryAttendeeId: v.optional(v.string()),
    })
  ).index("primaryAttendeeId", ["primaryAttendeeId"]),

  attendeeFamilyMembers: defineTable(
    v.object({
      familyGroupId: v.string(),
      attendeeId: v.string(),
      relationship: v.optional(v.string()),
    })
  )
    .index("attendeeId", ["attendeeId"])
    .index("familyGroupId", ["familyGroupId"]),

  payments: defineTable(
    v.object({
      source: v.union(
        v.literal("tikkie"),
        v.literal("bank_transfer"),
        v.literal("cash")
      ),
      sourceId: v.optional(v.string()),
      payerName: v.string(),
      payerAccountNumber: v.optional(v.string()),
      amountMinor: v.number(),
      paidAt: v.number(),
      eventId: v.optional(v.id("events")),
      orderId: v.optional(v.string()),
      donationKind: v.optional(
        v.union(v.literal("overpayment"), v.literal("standalone"))
      ),
      status: v.optional(
        v.union(
          v.literal("auto_matched"),
          v.literal("manual_assignment"),
          v.literal("ambiguous"),
          v.literal("unassigned"),
          v.literal("donation")
        )
      ),
      matchedAt: v.optional(v.number()),
      matchedBy: v.optional(v.string()),
      reference: v.optional(v.string()),
      notes: v.optional(v.string()),
      providerPayload: v.optional(v.any()),
    })
  )
    .index("orderId", ["orderId"])
    .index("eventId", ["eventId"])
    .index("source_sourceId", ["source", "sourceId"])
    .index("status", ["status"])
    .index("by_eventId_and_status_and_source", [
      "eventId",
      "status",
      "source",
    ])
    .index("by_donationKind_and_paidAt", ["donationKind", "paidAt"])
    .index("by_donationKind_and_eventId_and_paidAt", [
      "donationKind",
      "eventId",
      "paidAt",
    ])
    .index("paidAt", ["paidAt"]),

  /**
   * Donation allocation credit layer (Phase 55, D-01/D-02/D-14/D-22).
   *
   * One credit row per `(donationId, attendeeId)` carrying the operator-chosen
   * `scope` and the amount. The donation's remaining balance is DERIVED from
   * these rows (`donation amount - sum of them`), never stored (D-01). The
   * allocation set is never stored as a child array on the `payments` row
   * (guidelines.md:157) — each allocation is its own bounded row.
   *
   * `orderId` is typed `v.id("orders")` (unlike `payments.orderId`, which is an
   * optional string used for provider aliases, D-22). The D-02 at-most-one-row
   * invariant is backed by `by_donationId_and_attendeeId` — the index the
   * roadmap's proposed list omitted.
   */
  donationAllocations: defineTable(
    v.object({
      donationId: v.id("payments"),
      eventId: v.id("events"),
      orderId: v.id("orders"),
      attendeeId: v.id("orderAttendees"),
      // Integer minor units, always > 0.
      amountMinor: v.number(),
      // D-14: the scope is chosen by the operator and recorded, never inferred
      // from the amount or the balance.
      scope: v.union(v.literal("event_charges"), v.literal("whole_order")),
      createdAt: v.number(),
      // Actor derived from `identity.tokenIdentifier`, never an argument.
      createdBy: v.string(),
      submissionId: v.optional(v.id("donationAllocationSubmissions")),
    })
  )
    .index("by_donationId", ["donationId"])
    .index("by_donationId_and_attendeeId", ["donationId", "attendeeId"])
    .index("by_eventId_and_createdAt", ["eventId", "createdAt"])
    .index("by_orderId", ["orderId"])
    .index("by_attendeeId", ["attendeeId"]),

  /**
   * Donation allocation submission ledger (D-21). Mirrors the
   * `orderAccommodationEditAudits` shape: one immutable row per applied
   * submission, keyed `(donationId, idempotencyKey)` with a `requestDigest`.
   *
   * `rows` is the FROZEN server result returned on replay, so a retry never
   * recomputes money from mutable allocation rows that may have drifted. It is
   * a bounded immutable snapshot (bounded by `MAX_ALLOCATION_PLAN_ROWS` in the
   * pure module), not an unbounded child array (guidelines.md:157).
   *
   * `orderIdempotency` cannot be reused: its `orderId` is a required
   * `v.id("orders")` and a donation has no order.
   *
   * `by_donationId_and_requestDigest` is deliberately NOT declared: nothing in
   * Phase 55 queries by digest — the replay lookup fetches the row through the
   * key index and compares `requestDigest` in memory. Add it only if a
   * digest-scoped reader actually appears.
   *
   * §"Deletion rows (Phase 57)". One row per deleted donation serves BOTH the
   * D-21 replay ledger and the donation-level deletion audit — the same Phase 45
   * `orderAccommodationEditAudits` double duty this table was shaped for. For
   * `operation: "delete"` the fields mean:
   *   - `allocatedTotalMinor` = Σ of the reversed allocation amounts;
   *   - `remainingMinor` = donation amount − Σ reversed (the never-credited
   *     remainder that returns to event donation income);
   *   - `rows` = the FROZEN reversed rows, so `allocationCount = rows.length`
   *     and a replay returns each reversal verbatim;
   *   - `eventId` = the donation's event, and `donationAmountMinor` = the
   *     donation's recorded amount, both stored explicitly so a zero-allocation
   *     deletion still records which event it belonged to and what it was worth
   *     (removal rows carry `eventId` only when N > 0, so they cannot).
   *
   * `donationAmountMinor` is stored rather than inferred from
   * `allocatedTotalMinor + remainingMinor`: a derived amount cannot be audited
   * against, and a future rounding/ceiling change must not silently rewrite the
   * history of a deletion that already happened.
   *
   * The per-allocation `donationAllocationRemovals` rows keep their own
   * `submissionId` pointing at THIS table. Do NOT widen
   * `donationAllocationRemovals.submissionId` (`:1097`, below) — reusing this
   * table is precisely what avoids a second validator widening.
   */
  donationAllocationSubmissions: defineTable(
    v.object({
      donationId: v.id("payments"),
      idempotencyKey: v.string(),
      requestDigest: v.string(),
      operation: v.union(
        v.literal("allocate"),
        v.literal("allocate_one"),
        v.literal("remove"),
        v.literal("delete")
      ),
      actor: v.string(),
      createdAt: v.number(),
      allocatedTotalMinor: v.number(),
      remainingMinor: v.number(),
      // Phase 57 deletion rows only (see the doc comment above). Optional so
      // every existing allocate / allocate_one / remove row validates
      // unchanged — no backfill and no migration.
      eventId: v.optional(v.id("events")),
      donationAmountMinor: v.optional(v.number()),
      rows: v.array(
        v.object({
          attendeeId: v.id("orderAttendees"),
          orderId: v.id("orders"),
          amountMinor: v.number(),
          scope: v.union(
            v.literal("event_charges"),
            v.literal("whole_order")
          ),
        })
      ),
    })
  ).index("by_donationId_and_idempotencyKey", [
    "donationId",
    "idempotencyKey",
  ])
    // The bounded "does this donation already have a delete submission?" lookup
    // behind Phase 57's already-deleted refusal. `donationId` and `operation`
    // are both required fields, so every existing row is indexed.
    .index("by_donationId_and_operation", ["donationId", "operation"]),

  /**
   * Append-only removal audit (D-19). Removing an allocation is a hard delete
   * plus this immutable row, preserving the operator's action while keeping the
   * D-02 per-`(donation, attendee)` invariant intact (no soft-delete rows).
   * Mirrors the `orderAccommodationEditAudits` precedent.
   */
  donationAllocationRemovals: defineTable(
    v.object({
      donationId: v.id("payments"),
      eventId: v.id("events"),
      orderId: v.id("orders"),
      attendeeId: v.id("orderAttendees"),
      amountMinor: v.number(),
      scope: v.union(v.literal("event_charges"), v.literal("whole_order")),
      actor: v.string(),
      removedAt: v.number(),
      submissionId: v.optional(v.id("donationAllocationSubmissions")),
    })
  )
    .index("by_donationId", ["donationId"])
    .index("by_donationId_and_attendeeId", ["donationId", "attendeeId"])
    .index("by_eventId_and_removedAt", ["eventId", "removedAt"]),

  roomAllocations: defineTable(
    v.object({
      eventId: v.string(),
      roomId: v.string(),
      status: v.optional(
        v.union(
          v.literal("proposed"),
          v.literal("confirmed"),
          v.literal("rejected")
        )
      ),
      notes: v.optional(v.string()),
    })
  )
    .index("eventId_roomId", ["eventId", "roomId"])
    .index("eventId_status", ["eventId", "status"]),

  sentEmails: defineTable(
    v.object({
      recipient: v.string(),
      bookingRef: v.string(),
      emailId: v.optional(v.string()),
      emailType: v.string(),
      sentAt: v.number(),
      eventId: v.optional(v.id("events")),
      broadcastId: v.optional(v.id("emailBroadcasts")),
    })
  )
    .index("by_bookingRef", ["bookingRef"])
    .index("by_eventId", ["eventId"])
    .index("by_broadcastId", ["broadcastId"]),

  emailBroadcasts: defineTable(
    v.object({
      eventId: v.id("events"),
      status: v.union(
        v.literal("queued"),
        v.literal("sending"),
        v.literal("completed"),
        v.literal("failed"),
        v.literal("cancelled")
      ),
      title: v.string(),
      message: v.string(),
      eventName: v.string(),
      eventDate: v.string(),
      eventLocation: v.string(),
      paymentUrl: v.optional(v.string()),
      campaignType: v.optional(v.union(v.literal("announcement"), v.literal("paymentReminder"))),
      reminderKind: v.optional(v.union(v.literal("partial"), v.literal("outstanding"))),
      amountOutstandingMinor: v.optional(v.number()),
      nightBeforeNote: v.optional(v.string()),
      signupUrl: v.string(),
      filters: v.any(),
      totalRecipients: v.number(),
      sentCount: v.number(),
      failedCount: v.number(),
      pendingCount: v.number(),
      createdBy: v.optional(v.string()),
      createdAt: v.number(),
      startedAt: v.optional(v.number()),
      completedAt: v.optional(v.number()),
      cancelledAt: v.optional(v.number()),
      error: v.optional(v.string()),
    })
  )
    .index("by_eventId", ["eventId"])
    .index("by_eventId_and_status", ["eventId", "status"]),

  emailBroadcastRecipients: defineTable(
    v.object({
      broadcastId: v.id("emailBroadcasts"),
      orderId: v.id("orders"),
      to: v.string(),
      bookerName: v.optional(v.string()),
      bookingRef: v.optional(v.string()),
      manageBookingUrl: v.optional(v.string()),
      status: v.union(
        v.literal("pending"),
        v.literal("sent"),
        v.literal("failed")
      ),
      error: v.optional(v.string()),
      emailId: v.optional(v.string()),
      sentAt: v.optional(v.number()),
      attempts: v.number(),
    })
  )
    .index("by_broadcastId", ["broadcastId"])
    .index("by_broadcastId_and_status", ["broadcastId", "status"]),

  eventPaymentReminderSettings: defineTable(v.object({
    eventId: v.id("events"), enabled: v.boolean(), automaticEnabled: v.boolean(), dueAt: v.number(), timezone: v.string(), cadenceMinutes: v.number(), repeatPolicy: v.union(v.literal("oncePerPeriod"), v.literal("onceEver")), updatedAt: v.number(),
  })).index("by_eventId", ["eventId"]).index("by_automaticEnabled", ["automaticEnabled"]),

  paymentReminderCampaigns: defineTable(v.object({
    eventId: v.id("events"), campaignId: v.string(), mode: v.union(v.literal("manual"), v.literal("automatic")), period: v.string(), createdAt: v.number(), createdBy: v.optional(v.string()),
  })).index("by_eventId", ["eventId"]).index("by_campaignId", ["campaignId"]),

  paymentReminderDeliveries: defineTable(
    v.object({
      eventId: v.id("events"),
      orderId: v.id("orders"),
      campaignId: v.string(),
      kind: v.union(
        v.literal("unpaid"),
        v.literal("partial"),
        v.literal("overdue")
      ),
      period: v.string(),
      recipient: v.string(),
      bookerName: v.string(),
      bookingRef: v.string(),
      currency: v.string(),
      amountDueMinor: v.number(),
      paidAmountMinor: v.number(),
      outstandingAmountMinor: v.number(),
      status: v.union(
        v.literal("queued"),
        v.literal("sending"),
        v.literal("sent"),
        v.literal("failed"),
        v.literal("skipped")
      ),
      attempts: v.number(),
      sendingAt: v.optional(v.number()),
      providerEmailId: v.optional(v.string()),
      error: v.optional(v.string()),
      createdAt: v.number(),
      sentAt: v.optional(v.number()),
    })
  )
    .index("by_eventId", ["eventId"])
    .index("by_campaignId", ["campaignId"])
    .index("by_campaignId_and_status", ["campaignId", "status"])
    .index("by_campaignId_and_status_and_sendingAt", [
      "campaignId",
      "status",
      "sendingAt",
    ])
    .index("by_idempotency", ["eventId", "orderId", "kind", "period"])
    .index("by_idempotency_period", ["eventId", "orderId", "period"])
    .index("by_status", ["status"]),
})
