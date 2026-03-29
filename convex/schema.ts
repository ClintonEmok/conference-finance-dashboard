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

  signupEvents: defineTable(
    v.object({
      source: v.union(v.literal("integration"), v.literal("internal")),
      sourceEventRef: v.string(),
      slug: v.string(),
      title: v.string(),
      startsAt: v.number(),
      isPublished: v.boolean(),
      isSignupOpen: v.boolean(),
      accommodationEnabled: v.boolean(),
      currency: v.string(),
    })
  )
    .index("by_source_and_sourceEventRef", ["source", "sourceEventRef"])
    .index("by_slug", ["slug"])
    .index("by_isPublished_and_isSignupOpen", ["isPublished", "isSignupOpen"])
    .index("by_startsAt_and_title", ["startsAt", "title"]),

  signupTicketTypes: defineTable(
    v.object({
      signupEventId: v.string(),
      label: v.string(),
      priceMinor: v.number(),
      isActive: v.boolean(),
      visibility: v.union(v.literal("visible"), v.literal("hidden")),
      availabilityState: v.union(
        v.literal("selectable"),
        v.literal("unavailable")
      ),
      unavailableReason: v.optional(
        v.union(
          v.literal("sold_out"),
          v.literal("disabled"),
          v.literal("hidden"),
          v.literal("not_on_sale")
        )
      ),
    })
  )
    .index("by_signupEventId", ["signupEventId"])
    .index("by_signupEventId_and_availabilityState", [
      "signupEventId",
      "availabilityState",
    ]),

  signupAccommodationSlots: defineTable(
    v.object({
      signupEventId: v.string(),
      hotelId: v.string(),
      roomId: v.string(),
      slotLabel: v.string(),
      genderPolicy: v.union(
        v.literal("male"),
        v.literal("female"),
        v.literal("mixed"),
        v.literal("unknown")
      ),
      isAssignable: v.boolean(),
      ineligibilityReason: v.optional(
        v.union(
          v.literal("accommodation_disabled"),
          v.literal("no_assignable_inventory"),
          v.literal("event_closed")
        )
      ),
    })
  )
    .index("by_signupEventId", ["signupEventId"])
    .index("by_signupEventId_and_isAssignable", [
      "signupEventId",
      "isAssignable",
    ]),

  signupSubmissions: defineTable(
    v.object({
      signupEventId: v.string(),
      source: v.union(v.literal("integration"), v.literal("internal")),
      idempotencyKey: v.string(),
      payloadFingerprint: v.string(),
      bookingRef: v.string(),
      honeypotSeen: v.boolean(),
      notes: v.optional(v.string()),
      bookerName: v.string(),
      bookerEmail: v.string(),
      bookerPhone: v.optional(v.string()),
      submittedAt: v.number(),
    })
  )
    .index("by_signupEventId", ["signupEventId"])
    .index("by_bookingRef", ["bookingRef"])
    .index("by_idempotencyKey", ["idempotencyKey"])
    .index("by_signupEventId_and_payloadFingerprint", [
      "signupEventId",
      "payloadFingerprint",
    ]),

  signupSubmissionAttendees: defineTable(
    v.object({
      submissionId: v.string(),
      attendeeKey: v.string(),
      fullName: v.string(),
      email: v.string(),
      gender: v.union(
        v.literal("male"),
        v.literal("female"),
        v.literal("mixed"),
        v.literal("unknown")
      ),
      location: v.string(),
      dietaryRestrictions: v.string(),
      roommatePreference: v.string(),
      roommateAvoid: v.string(),
      phone: v.string(),
      sortOrder: v.number(),
    })
  )
    .index("by_submissionId", ["submissionId"])
    .index("by_submissionId_and_attendeeKey", ["submissionId", "attendeeKey"]),

  signupSubmissionTicketSelections: defineTable(
    v.object({
      submissionId: v.string(),
      attendeeKey: v.optional(v.string()),
      ticketTypeId: v.string(),
      quantity: v.number(),
      sortOrder: v.number(),
    })
  )
    .index("by_submissionId", ["submissionId"])
    .index("by_submissionId_and_ticketTypeId", ["submissionId", "ticketTypeId"])
    .index("by_ticketTypeId", ["ticketTypeId"]),

  signupSubmissionAssignments: defineTable(
    v.object({
      submissionId: v.string(),
      attendeeKey: v.string(),
      slotId: v.string(),
      sortOrder: v.number(),
    })
  )
    .index("by_submissionId", ["submissionId"])
    .index("by_submissionId_and_slotId", ["submissionId", "slotId"])
    .index("by_slotId", ["slotId"]),

  signupSubmissionIdempotency: defineTable(
    v.object({
      signupEventId: v.string(),
      idempotencyKey: v.string(),
      payloadFingerprint: v.string(),
      submissionId: v.string(),
      expiresAt: v.number(),
    })
  )
    .index("by_signupEventId_and_idempotencyKey", [
      "signupEventId",
      "idempotencyKey",
    ])
    .index("by_expiresAt", ["expiresAt"])
    .index("by_submissionId", ["submissionId"]),

  ticketTailorOrders: defineTable(
    v.object({
      providerOrderId: v.string(),
      providerEventId: v.string(),
      eventId: v.string(),
      isArchived: v.optional(v.boolean()),
      archivedAt: v.optional(v.number()),
      archiveReason: v.optional(v.string()),
      removedAt: v.optional(v.number()),
      removedReason: v.optional(v.string()),
      normalizedStatus: v.optional(
        v.union(
          v.literal("paid"),
          v.literal("refunded"),
          v.literal("cancelled"),
          v.literal("pending")
        )
      ),
      providerStatus: v.optional(v.string()),
      normalizationNote: v.optional(v.string()),
      buyerEmail: v.optional(v.string()),
      buyerName: v.optional(v.string()),
      currency: v.optional(v.string()),
      totalAmountMinor: v.optional(v.number()),
      orderedAt: v.optional(v.number()),
      refundedAt: v.optional(v.number()),
      cancelledAt: v.optional(v.number()),
      rawPayload: v.any(),
    })
  )
    .index("providerOrderId", ["providerOrderId"])
    .index("providerEventId", ["providerEventId"])
    .index("eventId", ["eventId"])
    .index("orderedAt", ["orderedAt"])
    .index("normalizedStatus", ["normalizedStatus"]),

  ticketTailorAttendees: defineTable(
    v.object({
      providerAttendeeId: v.optional(v.string()),
      providerIssuedTicketId: v.optional(v.string()),
      providerTicketTypeId: v.optional(v.string()),
      providerEventId: v.string(),
      providerOrderId: v.string(),
      eventId: v.string(),
      orderId: v.string(),
      assignedRoomId: v.optional(v.string()),
      name: v.optional(v.string()),
      email: v.optional(v.string()),
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
      allocationPriority: v.optional(
        v.union(
          v.literal("CRITICAL"),
          v.literal("HIGH"),
          v.literal("NORMAL"),
          v.literal("LOW")
        )
      ),
      priorityReason: v.optional(v.string()),
      tikkieAmountOverrideMinor: v.optional(v.number()),
    })
  )
    .index("providerAttendeeId", ["providerAttendeeId"])
    .index("providerIssuedTicketId", ["providerIssuedTicketId"])
    .index("eventId", ["eventId"])
    .index("orderId", ["orderId"])
    .index("assignedRoomId", ["assignedRoomId"])
    .index("providerEventOrder", ["providerEventId", "providerOrderId"])
    .index("email", ["email"])
    .index("genderType", ["genderType"])
    .index("allocationPriority", ["allocationPriority"]),

  accommodationHotels: defineTable(
    v.object({
      name: v.string(),
      city: v.optional(v.string()),
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
    })
  ).index("label", ["label"]),

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
    })
  )
    .index("paymentRequestToken", ["paymentRequestToken"])
    .index("providerOrderEvent", ["providerOrderId", "providerEventId"])
    .index("status_updated", ["status", "statusUpdatedAt"])
    .index("orderId", ["orderId"])
    .index("eventId", ["eventId"])
    .index("linkType", ["linkType"]),

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
      orderId: v.optional(v.string()),
      status: v.optional(
        v.union(
          v.literal("auto_matched"),
          v.literal("manual_assignment"),
          v.literal("ambiguous"),
          v.literal("unassigned")
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
    .index("source_sourceId", ["source", "sourceId"])
    .index("status", ["status"])
    .index("paidAt", ["paidAt"]),

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
})
