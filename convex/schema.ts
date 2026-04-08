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
    })
  )
    .index("by_eventId", ["eventId"])
    .index("by_bookingRef", ["bookingRef"])
    .index("by_submittedAt", ["submittedAt"])
    .index("by_providerOrderId", ["providerOrderId"])
    .index("by_providerEventId", ["providerEventId"])
    .index("by_status", ["status"]),

  orderAttendees: defineTable(
    v.object({
      orderId: v.id("orders"),
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
    .index("by_assignedRoomId", ["assignedRoomId"])
    .index("by_allocationPriority", ["allocationPriority"]),

  orderTicketSelections: defineTable(
    v.object({
      orderId: v.id("orders"),
      attendeeId: v.id("orderAttendees"),
      ticketTypeId: v.id("ticketTypes"),
      quantity: v.number(),
      sortOrder: v.number(),
    })
  )
    .index("by_orderId", ["orderId"])
    .index("by_ticketTypeId", ["ticketTypeId"]),

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
          v.literal("declined")
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
    .index("eventId_linkType", ["eventId", "linkType"])
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

  sentEmails: defineTable(
    v.object({
      recipient: v.string(),
      bookingRef: v.string(),
      emailId: v.optional(v.string()),
      emailType: v.string(),
      sentAt: v.number(),
    })
  ).index("by_bookingRef", ["bookingRef"]),
})
