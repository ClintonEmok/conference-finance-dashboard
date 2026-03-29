/* eslint-disable */
/**
 * Generated `api` utility.
 *
 * THIS CODE IS AUTOMATICALLY GENERATED.
 *
 * To regenerate, run `npx convex dev`.
 * @module
 */

import type { FunctionReference } from "convex/server";
import type { GenericId as Id } from "convex/values";

/**
 * A utility for referencing Convex functions in your app's public API.
 *
 * Usage:
 * ```js
 * const myFunctionReference = api.myModule.myFunction;
 * ```
 */
export declare const api: {
  accommodation: {
    assignAttendeeToRoom: FunctionReference<
      "mutation",
      "public",
      { attendeeId: string; roomId: string },
      any
    >;
    assignRoomToAttendee: FunctionReference<
      "mutation",
      "public",
      { attendeeId: string; roomId: string },
      any
    >;
    attachHotelToEventByProviderId: FunctionReference<
      "mutation",
      "public",
      { eventProviderEventId: string; hotelId: string },
      any
    >;
    createHotel: FunctionReference<
      "mutation",
      "public",
      { city?: string; name: string; notes?: string },
      any
    >;
    createRoom: FunctionReference<
      "mutation",
      "public",
      {
        capacity: number;
        hotelId: string;
        label: string;
        notes?: string;
        roomTypeId: string;
      },
      any
    >;
    createRooms: FunctionReference<
      "mutation",
      "public",
      {
        hotelId: string;
        labels?: Array<string>;
        notes?: string;
        quantity: number;
        roomTypeId: string;
      },
      any
    >;
    createRoomType: FunctionReference<
      "mutation",
      "public",
      { defaultCapacity: number; label: string; notes?: string },
      any
    >;
    deleteHotel: FunctionReference<
      "mutation",
      "public",
      { hotelId: string },
      any
    >;
    deleteRoom: FunctionReference<
      "mutation",
      "public",
      { roomId: string },
      any
    >;
    deleteRoomType: FunctionReference<
      "mutation",
      "public",
      { roomTypeId: string },
      any
    >;
    detachHotelFromEventByProviderId: FunctionReference<
      "mutation",
      "public",
      { eventProviderEventId: string; hotelId: string },
      any
    >;
    getEventByProviderId: FunctionReference<
      "query",
      "public",
      { providerEventId: string },
      any
    >;
    getEventHotels: FunctionReference<
      "query",
      "public",
      { eventId: string },
      any
    >;
    getHotelById: FunctionReference<
      "query",
      "public",
      { hotelId: string },
      any
    >;
    getHotels: FunctionReference<"query", "public", {}, any>;
    getRoomAllocationBoard: FunctionReference<
      "query",
      "public",
      {
        allocationPriority?: "CRITICAL" | "HIGH" | "NORMAL" | "LOW";
        eventId?: string;
        familyGroupId?: string;
        genderType?: "MALE" | "FEMALE" | "MIXED" | "UNKNOWN";
        hasPriority?: boolean;
        hotelId?: string;
        location?: string;
        roomTypeId?: string;
      },
      any
    >;
    getRoomById: FunctionReference<"query", "public", { roomId: string }, any>;
    getRooms: FunctionReference<
      "query",
      "public",
      { hotelId?: string; roomTypeId?: string },
      any
    >;
    getRoomsWithDetails: FunctionReference<"query", "public", {}, any>;
    getRoomTypeById: FunctionReference<
      "query",
      "public",
      { roomTypeId: string },
      any
    >;
    getRoomTypes: FunctionReference<"query", "public", {}, any>;
    getRoomTypesWithCount: FunctionReference<"query", "public", {}, any>;
    linkHotelToEvent: FunctionReference<
      "mutation",
      "public",
      { eventId: string; hotelId: Id<"accommodationHotels"> },
      any
    >;
    listAccommodationInventory: FunctionReference<"query", "public", {}, any>;
    unassignAttendeeFromRoom: FunctionReference<
      "mutation",
      "public",
      { attendeeId: string },
      any
    >;
    unassignRoomFromAttendee: FunctionReference<
      "mutation",
      "public",
      { attendeeId: string },
      any
    >;
    unlinkHotelFromEvent: FunctionReference<
      "mutation",
      "public",
      { eventId: string; hotelId: Id<"accommodationHotels"> },
      any
    >;
    updateHotel: FunctionReference<
      "mutation",
      "public",
      { city?: string; hotelId: string; name?: string; notes?: string },
      any
    >;
    updateRoomLabel: FunctionReference<
      "mutation",
      "public",
      { label: string; roomId: string },
      any
    >;
    updateRoomType: FunctionReference<
      "mutation",
      "public",
      {
        defaultCapacity?: number;
        label?: string;
        notes?: string;
        roomTypeId: string;
      },
      any
    >;
  };
  attendees: {
    assignRoom: FunctionReference<
      "mutation",
      "public",
      { attendeeId: Id<"ticketTailorAttendees">; roomId: string },
      any
    >;
    checkInAttendee: FunctionReference<
      "mutation",
      "public",
      { attendeeId: Id<"ticketTailorAttendees"> },
      any
    >;
    createAttendee: FunctionReference<
      "mutation",
      "public",
      {
        ageGroup?: string;
        allocationPriority?: "CRITICAL" | "HIGH" | "NORMAL" | "LOW";
        customAnswers?: any;
        email?: string;
        eventId: string;
        genderType?: "MALE" | "FEMALE" | "MIXED" | "UNKNOWN";
        name?: string;
        orderId: string;
        providerAttendeeId?: string;
        providerEventId: string;
        providerIssuedTicketId?: string;
        providerOrderId: string;
        providerTicketTypeId?: string;
        rawPayload: any;
        ticketCategory?: string;
        ticketStatus?: string;
        ticketTypeLabel?: string;
      },
      any
    >;
    getAttendeeByEmail: FunctionReference<
      "query",
      "public",
      { email: string; eventId: string },
      any
    >;
    getAttendeeById: FunctionReference<
      "query",
      "public",
      { attendeeId: Id<"ticketTailorAttendees"> },
      any
    >;
    getAttendeeByStringId: FunctionReference<
      "query",
      "public",
      { attendeeId: string },
      any
    >;
    getAttendees: FunctionReference<
      "query",
      "public",
      {
        allocationPriority?: "CRITICAL" | "HIGH" | "NORMAL" | "LOW";
        assignedRoomId?: string;
        eventId?: string;
        genderType?: "MALE" | "FEMALE" | "MIXED" | "UNKNOWN";
        orderId?: Id<"ticketTailorOrders">;
        paginationOpts?: {
          cursor: string | null;
          endCursor?: string | null;
          id?: number;
          maximumBytesRead?: number;
          maximumRowsRead?: number;
          numItems: number;
        };
      },
      any
    >;
    unassignRoom: FunctionReference<
      "mutation",
      "public",
      { attendeeId: Id<"ticketTailorAttendees"> },
      any
    >;
    updateAttendee: FunctionReference<
      "mutation",
      "public",
      {
        allocationPriority?: "CRITICAL" | "HIGH" | "NORMAL" | "LOW";
        assignedRoomId?: string;
        attendeeId: Id<"ticketTailorAttendees">;
        email?: string;
        genderType?: "MALE" | "FEMALE" | "MIXED" | "UNKNOWN";
        name?: string;
        priorityReason?: string;
        tikkieAmountOverrideMinor?: number;
      },
      any
    >;
    upsertAttendee: FunctionReference<
      "mutation",
      "public",
      {
        ageGroup?: string;
        allocationPriority?: "CRITICAL" | "HIGH" | "NORMAL" | "LOW";
        customAnswers?: any;
        email?: string;
        eventId: string;
        genderType?: "MALE" | "FEMALE" | "MIXED" | "UNKNOWN";
        name?: string;
        orderId: string;
        providerAttendeeId?: string;
        providerEventId: string;
        providerIssuedTicketId?: string;
        providerOrderId: string;
        providerTicketTypeId?: string;
        rawPayload: any;
        ticketCategory?: string;
        ticketStatus?: string;
        ticketTypeLabel?: string;
      },
      any
    >;
  };
  events: {
    createEvent: FunctionReference<
      "mutation",
      "public",
      {
        currency?: string;
        endsAt?: number;
        name?: string;
        providerEventId: string;
        rawPayload: any;
        startsAt?: number;
        timezone?: string;
      },
      any
    >;
    getEventById: FunctionReference<
      "query",
      "public",
      { eventId: string },
      any
    >;
    getEventByProviderId: FunctionReference<
      "query",
      "public",
      { providerEventId: string },
      any
    >;
    getEvents: FunctionReference<
      "query",
      "public",
      {},
      Array<{
        _creationTime: number;
        _id: Id<"ticketTailorEvents">;
        currency?: string;
        endsAt?: number;
        name?: string;
        providerEventId: string;
        rawPayload: any;
        startsAt?: number;
        timezone?: string;
      }>
    >;
    getEventsForLedger: FunctionReference<
      "query",
      "public",
      {},
      Array<{ name: string | null; providerEventId: string }>
    >;
    upsertEvent: FunctionReference<
      "mutation",
      "public",
      {
        currency?: string;
        endsAt?: number;
        name?: string;
        providerEventId: string;
        rawPayload: any;
        startsAt?: number;
        timezone?: string;
      },
      any
    >;
  };
  orders: {
    createOrder: FunctionReference<
      "mutation",
      "public",
      {
        buyerEmail?: string;
        buyerName?: string;
        currency?: string;
        eventId: string;
        normalizedStatus?: "paid" | "refunded" | "cancelled" | "pending";
        orderedAt?: number;
        providerEventId: string;
        providerOrderId: string;
        providerStatus?: string;
        rawPayload: any;
        totalAmountMinor?: number;
      },
      any
    >;
    getOrderById: FunctionReference<
      "query",
      "public",
      { orderId: string },
      any
    >;
    getOrderByProviderId: FunctionReference<
      "query",
      "public",
      { providerOrderId: string },
      any
    >;
    getOrderCount: FunctionReference<
      "query",
      "public",
      {
        eventId?: string;
        from?: number;
        status?: "paid" | "refunded" | "cancelled" | "pending";
        to?: number;
      },
      any
    >;
    getOrderLedger: FunctionReference<
      "query",
      "public",
      { eventId: string },
      any
    >;
    getOrderPaymentStatus: FunctionReference<
      "query",
      "public",
      {},
      {
        bySource: { bank_transfer: number; cash: number; tikkie: number };
        legacyPaymentStatus: {
          ambiguous: number;
          auto_matched: number;
          manual_assignment: number;
          unassigned: number;
        };
        summary: {
          overpaid: number;
          paid: number;
          partial: number;
          totalOrders: number;
          unassigned: number;
        };
        totalAmountMinor: number;
      }
    >;
    getOrders: FunctionReference<
      "query",
      "public",
      {
        eventId?: string;
        status?: "paid" | "refunded" | "cancelled" | "pending";
      },
      any
    >;
    getOrdersForReconciliation: FunctionReference<
      "query",
      "public",
      {
        eventId?: string;
        from?: number;
        status?: "paid" | "refunded" | "cancelled" | "pending";
        to?: number;
      },
      Array<{
        archiveReason: string | null;
        archivedAt: string | null;
        buyerEmail: string | null;
        buyerName: string | null;
        currency: string | null;
        eventId: string;
        eventName: string | null;
        isArchived: boolean;
        normalizedStatus: "paid" | "refunded" | "cancelled" | "pending";
        orderedAt: string | null;
        providerEventId: string;
        providerOrderId: string;
        refundedAt: string | null;
        totalAmountMinor: number;
      }>
    >;
    getOrdersWithFilters: FunctionReference<
      "query",
      "public",
      {
        eventId?: string;
        from?: number;
        page?: number;
        pageSize?: number;
        status?: "paid" | "refunded" | "cancelled" | "pending";
        to?: number;
      },
      {
        orders: Array<{
          archiveReason: string | null;
          archivedAt: string | null;
          buyerEmail: string | null;
          buyerName: string | null;
          currency: string | null;
          eventId: string;
          eventName: string | null;
          isArchived: boolean;
          normalizedStatus: "paid" | "refunded" | "cancelled" | "pending";
          orderedAt: string | null;
          providerEventId: string;
          providerOrderId: string;
          refundedAt: string | null;
          totalAmountMinor: number;
        }>;
        totalPages: number;
        totalRows: number;
      }
    >;
    getOrderWithAttendeesByProviderId: FunctionReference<
      "query",
      "public",
      { providerEventId: string; providerOrderId: string },
      {
        attendees: Array<{
          id: Id<"ticketTailorAttendees">;
          name: string;
          normalizedStatus: string;
          ticketTypeLabel: string;
        }>;
        order: {
          archiveReason: string | null;
          archivedAt: string | null;
          id: Id<"ticketTailorOrders">;
          isArchived?: boolean;
          normalizedStatus?: "paid" | "refunded" | "cancelled" | "pending";
          orderedAt: string | null;
          providerOrderId: string;
          totalAmountMinor?: number;
        };
      } | null
    >;
    removeOrderLocally: FunctionReference<
      "mutation",
      "public",
      { orderId: Id<"ticketTailorOrders">; reason?: string },
      { orderId: Id<"ticketTailorOrders">; removedAt: number }
    >;
    searchOrders: FunctionReference<
      "query",
      "public",
      { eventId?: string; limit?: number; search: string },
      Array<{
        buyerName: string | null;
        id: Id<"ticketTailorOrders">;
        providerOrderId: string;
        totalAmountMinor: number;
      }>
    >;
    updateOrderStatus: FunctionReference<
      "mutation",
      "public",
      {
        normalizedStatus: "paid" | "refunded" | "cancelled" | "pending";
        orderId: Id<"ticketTailorOrders">;
      },
      any
    >;
    upsertOrder: FunctionReference<
      "mutation",
      "public",
      {
        buyerEmail?: string;
        buyerName?: string;
        currency?: string;
        eventId: string;
        normalizedStatus?: "paid" | "refunded" | "cancelled" | "pending";
        orderedAt?: number;
        providerEventId: string;
        providerOrderId: string;
        providerStatus?: string;
        rawPayload: any;
        totalAmountMinor?: number;
      },
      any
    >;
  };
  payments: {
    assignPaymentToOrder: FunctionReference<
      "mutation",
      "public",
      {
        matchedBy?: string;
        orderId: string;
        paymentId: Id<"payments">;
        status?: "auto_matched" | "manual_assignment";
      },
      any
    >;
    autoMatchPayments: FunctionReference<
      "mutation",
      "public",
      { eventId: string },
      any
    >;
    cleanupLegacyTikkiePayments: FunctionReference<
      "mutation",
      "public",
      {},
      any
    >;
    createPayment: FunctionReference<
      "mutation",
      "public",
      {
        amountMinor: number;
        matchedBy?: string;
        notes?: string;
        orderId?: string;
        paidAt: number;
        payerAccountNumber?: string;
        payerName: string;
        providerPayload?: any;
        reference?: string;
        source: "tikkie" | "bank_transfer" | "cash";
        sourceId?: string;
        status?:
          | "auto_matched"
          | "manual_assignment"
          | "ambiguous"
          | "unassigned";
      },
      any
    >;
    getPaymentById: FunctionReference<
      "query",
      "public",
      { paymentId: Id<"payments"> },
      {
        _creationTime: number;
        _id: Id<"payments">;
        amountMinor: number;
        matchedAt?: number;
        matchedBy?: string;
        notes?: string;
        orderId?: string;
        paidAt: number;
        payerAccountNumber?: string;
        payerName: string;
        providerPayload?: any;
        reference?: string;
        source: "tikkie" | "bank_transfer" | "cash";
        sourceId?: string;
        status?:
          | "auto_matched"
          | "manual_assignment"
          | "ambiguous"
          | "unassigned";
      } | null
    >;
    getPayments: FunctionReference<
      "query",
      "public",
      {
        orderId?: string;
        paginationOpts?: {
          cursor: string | null;
          endCursor?: string | null;
          id?: number;
          maximumBytesRead?: number;
          maximumRowsRead?: number;
          numItems: number;
        };
        source?: "tikkie" | "bank_transfer" | "cash";
        sourceId?: string;
        status?:
          | "auto_matched"
          | "manual_assignment"
          | "ambiguous"
          | "unassigned";
      },
      Array<{
        _creationTime: number;
        _id: Id<"payments">;
        amountMinor: number;
        matchedAt?: number;
        matchedBy?: string;
        notes?: string;
        orderId?: string;
        paidAt: number;
        payerAccountNumber?: string;
        payerName: string;
        providerPayload?: any;
        reference?: string;
        source: "tikkie" | "bank_transfer" | "cash";
        sourceId?: string;
        status?:
          | "auto_matched"
          | "manual_assignment"
          | "ambiguous"
          | "unassigned";
      }>
    >;
    getPaymentSummary: FunctionReference<
      "query",
      "public",
      { orderId: string },
      any
    >;
    getUnassignedPayments: FunctionReference<"query", "public", {}, any>;
    unassignPayment: FunctionReference<
      "mutation",
      "public",
      { paymentId: Id<"payments"> },
      any
    >;
    upsertTikkiePayment: FunctionReference<
      "mutation",
      "public",
      {
        amountMinor: number;
        paidAt: number;
        payerAccountNumber?: string;
        payerName: string;
        providerPayload?: any;
        sourceId: string;
      },
      any
    >;
  };
  signupCatalog: {
    getPublicSignupCatalog: FunctionReference<
      "query",
      "public",
      {},
      Array<{
        accommodation: {
          eligible: boolean;
          reason:
            | "accommodation_disabled"
            | "no_assignable_inventory"
            | "event_closed"
            | null;
          slots: Array<{
            assignable: boolean;
            roomLabel: string;
            roomTypeLabel: string;
            slotId: Id<"signupAccommodationSlots">;
          }>;
        };
        currency: string;
        eventId: Id<"signupEvents">;
        slug: string;
        source: "integration" | "internal";
        sourceEventRef: string;
        startsAt: number;
        tickets: Array<{
          label: string;
          priceMinor: number;
          reason: "sold_out" | "disabled" | "hidden" | "not_on_sale" | null;
          selectable: boolean;
          ticketTypeId: Id<"signupTicketTypes">;
        }>;
        title: string;
      }>
    >;
  };
  sync: {
    addAttendeeToFamilyGroup: FunctionReference<
      "mutation",
      "public",
      {
        attendeeId: string;
        familyGroupId: Id<"attendeeFamilyGroups">;
        relationship?: string;
      },
      Id<"attendeeFamilyMembers">
    >;
    archiveMissingOrdersForEvent: FunctionReference<
      "mutation",
      "public",
      {
        providerEventId: string;
        reason?: string;
        seenProviderOrderIds: Array<string>;
      },
      { archived: number; scanned: number }
    >;
    completeSyncRun: FunctionReference<
      "mutation",
      "public",
      {
        diagnostics?: any;
        errorSummary?: string;
        eventsScanned?: number;
        failedItems?: number;
        normalizedFallbackCount?: number;
        ordersArchived?: number;
        ordersFetched?: number;
        ordersUpserted?: number;
        runId: Id<"ticketTailorSyncRuns">;
        status: "success" | "partial" | "failed";
      },
      Id<"ticketTailorSyncRuns">
    >;
    createAttendeeFamilyGroup: FunctionReference<
      "mutation",
      "public",
      { label?: string; primaryAttendeeId: string },
      Id<"attendeeFamilyGroups">
    >;
    createWebhookEvent: FunctionReference<
      "mutation",
      "public",
      { eventType: string; payload: any; providerEventId: string },
      Id<"ticketTailorWebhookEvents">
    >;
    getAttendeeFamilyGroupByPrimaryId: FunctionReference<
      "query",
      "public",
      { primaryAttendeeId: string },
      any
    >;
    getFamilyMembersByGroupId: FunctionReference<
      "query",
      "public",
      { familyGroupId: Id<"attendeeFamilyGroups"> },
      any
    >;
    getLatestSyncRun: FunctionReference<"query", "public", {}, any>;
    getPendingWebhookEvents: FunctionReference<
      "query",
      "public",
      { limit?: number },
      any
    >;
    getSyncRunById: FunctionReference<
      "query",
      "public",
      { runId: Id<"ticketTailorSyncRuns"> },
      any
    >;
    getSyncRuns: FunctionReference<"query", "public", {}, any>;
    getTicketTailorAttendeesByOrderId: FunctionReference<
      "query",
      "public",
      { orderId: string },
      any
    >;
    getTicketTailorEventByProviderId: FunctionReference<
      "query",
      "public",
      { providerEventId: string },
      any
    >;
    getTicketTailorOrderByProviderId: FunctionReference<
      "query",
      "public",
      { providerOrderId: string },
      any
    >;
    getWebhookEventById: FunctionReference<
      "query",
      "public",
      { eventId: Id<"ticketTailorWebhookEvents"> },
      any
    >;
    getWebhookEventByProviderId: FunctionReference<
      "query",
      "public",
      { providerEventId: string },
      any
    >;
    getWebhookEvents: FunctionReference<
      "query",
      "public",
      { status?: "pending" | "processed" | "failed" },
      any
    >;
    processWebhookEvent: FunctionReference<
      "mutation",
      "public",
      {
        error?: string;
        eventId: Id<"ticketTailorWebhookEvents">;
        status: "processed" | "failed";
      },
      any
    >;
    startSyncRun: FunctionReference<
      "mutation",
      "public",
      {},
      Id<"ticketTailorSyncRuns">
    >;
    updateSyncRun: FunctionReference<
      "mutation",
      "public",
      {
        diagnostics?: any;
        errorSummary?: string;
        eventsScanned?: number;
        failedItems?: number;
        normalizedFallbackCount?: number;
        ordersArchived?: number;
        ordersFetched?: number;
        ordersUpserted?: number;
        runId: Id<"ticketTailorSyncRuns">;
      },
      Id<"ticketTailorSyncRuns">
    >;
    updateWebhookEvent: FunctionReference<
      "mutation",
      "public",
      {
        attempts?: number;
        canonicalFetchedAt?: number;
        canonicalPayload?: any;
        deliveryCount?: number;
        eventId: Id<"ticketTailorWebhookEvents">;
        lastError?: string;
        lastReceivedAt?: number;
        nextRetryAt?: number;
        payload?: any;
        processedAt?: number;
        status?: "pending" | "processed" | "failed";
      },
      any
    >;
    upsertTicketTailorAttendee: FunctionReference<
      "mutation",
      "public",
      {
        ageGroup?: string;
        allocationPriority?: "CRITICAL" | "HIGH" | "NORMAL" | "LOW";
        customAnswers?: any;
        email?: string;
        eventId: string;
        genderType?: "MALE" | "FEMALE" | "MIXED" | "UNKNOWN";
        name?: string;
        orderId: string;
        priorityReason?: string;
        providerAttendeeId?: string;
        providerEventId: string;
        providerIssuedTicketId?: string;
        providerOrderId: string;
        providerTicketTypeId?: string;
        rawPayload: any;
        ticketCategory?: string;
        ticketStatus?: string;
        ticketTypeLabel?: string;
      },
      Id<"ticketTailorAttendees">
    >;
    upsertTicketTailorEvent: FunctionReference<
      "mutation",
      "public",
      {
        currency?: string;
        endsAt?: number;
        name?: string;
        providerEventId: string;
        rawPayload: any;
        startsAt?: number;
        timezone?: string;
      },
      Id<"ticketTailorEvents">
    >;
    upsertTicketTailorOrder: FunctionReference<
      "mutation",
      "public",
      {
        buyerEmail?: string;
        buyerName?: string;
        cancelledAt?: number;
        currency?: string;
        eventId: string;
        normalizationNote?: string;
        normalizedStatus?: "paid" | "refunded" | "cancelled" | "pending";
        orderedAt?: number;
        providerEventId: string;
        providerOrderId: string;
        providerStatus?: string;
        rawPayload: any;
        refundedAt?: number;
        totalAmountMinor?: number;
      },
      Id<"ticketTailorOrders">
    >;
  };
  tikkie: {
    autoMatchTikkiePayments: FunctionReference<
      "mutation",
      "public",
      { eventId: string },
      any
    >;
    createEventPaymentLink: FunctionReference<
      "mutation",
      "public",
      {
        amountMinor: number;
        description: string;
        eventId: string;
        expiryDate: number;
        paymentRequestToken: string;
        paymentRequestUrl: string;
        providerEventId: string;
        providerPayload?: any;
        providerStatus: string;
        referenceId?: string;
      },
      any
    >;
    createPaymentLink: FunctionReference<
      "mutation",
      "public",
      {
        amountMinor: number;
        description: string;
        expiryDate: number;
        orderId: string;
        paymentRequestToken: string;
        paymentRequestUrl: string;
        providerEventId: string;
        providerOrderId: string;
        providerPayload?: any;
        providerStatus: string;
        referenceId?: string;
      },
      any
    >;
    createPaymentTemplate: FunctionReference<
      "mutation",
      "public",
      {
        amountMinor: number;
        descriptionTemplate: string;
        eventId: string;
        expiryDays?: number;
        isActive?: boolean;
        ticketTypeLabel: string;
      },
      any
    >;
    deletePaymentTemplate: FunctionReference<
      "mutation",
      "public",
      { templateId: Id<"tikkiePaymentTemplates"> },
      any
    >;
    getEventPaymentLink: FunctionReference<
      "query",
      "public",
      { eventId: string },
      any
    >;
    getPaymentLinkById: FunctionReference<
      "query",
      "public",
      { linkId: Id<"tikkiePaymentLinks"> },
      any
    >;
    getPaymentLinkByToken: FunctionReference<
      "query",
      "public",
      { paymentRequestToken: string },
      any
    >;
    getPaymentLinks: FunctionReference<
      "query",
      "public",
      { orderId?: string; status?: "created" | "paid" | "expired" },
      any
    >;
    getPaymentLinksByOrderId: FunctionReference<
      "query",
      "public",
      { orderId: string },
      any
    >;
    getPaymentTemplates: FunctionReference<
      "query",
      "public",
      { eventId?: string },
      any
    >;
    getTemplateByEventAndTicketType: FunctionReference<
      "query",
      "public",
      { eventId: string; ticketTypeLabel: string },
      any
    >;
    getTikkiePaymentByToken: FunctionReference<
      "query",
      "public",
      { paymentToken: string },
      any
    >;
    getTikkiePaymentsByLink: FunctionReference<
      "query",
      "public",
      { paymentLinkId: string },
      any
    >;
    getTikkiePaymentsByStatus: FunctionReference<
      "query",
      "public",
      { matchStatus: "unmatched" | "auto_matched" | "manual" },
      any
    >;
    matchTikkiePayment: FunctionReference<
      "mutation",
      "public",
      { orderId: string; paymentId: Id<"tikkiePayments"> },
      any
    >;
    updatePaymentLinkStatus: FunctionReference<
      "mutation",
      "public",
      {
        linkId: Id<"tikkiePaymentLinks">;
        providerNotificationKey?: string;
        providerPayload?: any;
        providerStatus: string;
        reason?: string;
        source: "create" | "webhook" | "poll";
        status: "created" | "paid" | "expired";
      },
      any
    >;
    updatePaymentTemplate: FunctionReference<
      "mutation",
      "public",
      {
        amountMinor: number;
        descriptionTemplate: string;
        expiryDays?: number;
        isActive?: boolean;
        templateId: Id<"tikkiePaymentTemplates">;
      },
      any
    >;
    upsertTikkiePayment: FunctionReference<
      "mutation",
      "public",
      {
        amountMinor: number;
        description?: string;
        paidAt: number;
        payerAccountNumber?: string;
        payerName: string;
        paymentLinkId: string;
        paymentRequestToken: string;
        paymentToken: string;
        providerPayload?: any;
      },
      any
    >;
  };
};

/**
 * A utility for referencing Convex functions in your app's internal API.
 *
 * Usage:
 * ```js
 * const myFunctionReference = internal.myModule.myFunction;
 * ```
 */
export declare const internal: {
  accommodation: {
    recalculateRoomOccupancy: FunctionReference<
      "mutation",
      "internal",
      { roomId: string },
      any
    >;
  };
  autoSync: {
    autoSyncTicketTailor: FunctionReference<"action", "internal", {}, any>;
    autoSyncTikkiePayments: FunctionReference<"action", "internal", {}, any>;
  };
  payments: {
    internalAssignPaymentToOrder: FunctionReference<
      "mutation",
      "internal",
      {
        matchedBy?: string;
        orderId: string;
        paymentId: Id<"payments">;
        status?: "auto_matched" | "manual_assignment";
      },
      any
    >;
    internalCleanupLegacyTikkiePayments: FunctionReference<
      "mutation",
      "internal",
      {},
      any
    >;
    internalUpsertTikkiePayment: FunctionReference<
      "mutation",
      "internal",
      {
        amountMinor: number;
        paidAt: number;
        payerAccountNumber?: string;
        payerName: string;
        providerPayload?: any;
        sourceId: string;
      },
      any
    >;
  };
  sync: {
    internalAddAttendeeToFamilyGroup: FunctionReference<
      "mutation",
      "internal",
      {
        attendeeId: string;
        familyGroupId: Id<"attendeeFamilyGroups">;
        relationship?: string;
      },
      Id<"attendeeFamilyMembers">
    >;
    internalArchiveMissingOrdersForEvent: FunctionReference<
      "mutation",
      "internal",
      {
        providerEventId: string;
        reason?: string;
        seenProviderOrderIds: Array<string>;
      },
      { archived: number; scanned: number }
    >;
    internalCompleteSyncRun: FunctionReference<
      "mutation",
      "internal",
      {
        diagnostics?: any;
        errorSummary?: string;
        eventsScanned?: number;
        failedItems?: number;
        normalizedFallbackCount?: number;
        ordersArchived?: number;
        ordersFetched?: number;
        ordersUpserted?: number;
        runId: Id<"ticketTailorSyncRuns">;
        status: "success" | "partial" | "failed";
      },
      Id<"ticketTailorSyncRuns">
    >;
    internalCreateAttendeeFamilyGroup: FunctionReference<
      "mutation",
      "internal",
      { label?: string; primaryAttendeeId: string },
      Id<"attendeeFamilyGroups">
    >;
    internalGetAttendeeFamilyGroupByPrimaryId: FunctionReference<
      "query",
      "internal",
      { primaryAttendeeId: string },
      any
    >;
    internalGetFamilyMembersByGroupId: FunctionReference<
      "query",
      "internal",
      { familyGroupId: Id<"attendeeFamilyGroups"> },
      any
    >;
    internalGetPaidOrders: FunctionReference<"query", "internal", {}, any>;
    internalGetTicketTailorAttendeesByOrderId: FunctionReference<
      "query",
      "internal",
      { orderId: string },
      any
    >;
    internalGetTikkiePaymentLinks: FunctionReference<
      "query",
      "internal",
      {},
      any
    >;
    internalGetUnassignedPayments: FunctionReference<
      "query",
      "internal",
      {},
      any
    >;
    internalStartSyncRun: FunctionReference<
      "mutation",
      "internal",
      {},
      Id<"ticketTailorSyncRuns">
    >;
    internalUpsertTicketTailorAttendee: FunctionReference<
      "mutation",
      "internal",
      {
        ageGroup?: string;
        allocationPriority?: "CRITICAL" | "HIGH" | "NORMAL" | "LOW";
        customAnswers?: any;
        email?: string;
        eventId: string;
        genderType?: "MALE" | "FEMALE" | "MIXED" | "UNKNOWN";
        name?: string;
        orderId: string;
        priorityReason?: string;
        providerAttendeeId?: string;
        providerEventId: string;
        providerIssuedTicketId?: string;
        providerOrderId: string;
        providerTicketTypeId?: string;
        rawPayload: any;
        ticketCategory?: string;
        ticketStatus?: string;
        ticketTypeLabel?: string;
      },
      Id<"ticketTailorAttendees">
    >;
    internalUpsertTicketTailorEvent: FunctionReference<
      "mutation",
      "internal",
      {
        currency?: string;
        endsAt?: number;
        name?: string;
        providerEventId: string;
        rawPayload: any;
        startsAt?: number;
        timezone?: string;
      },
      Id<"ticketTailorEvents">
    >;
    internalUpsertTicketTailorOrder: FunctionReference<
      "mutation",
      "internal",
      {
        buyerEmail?: string;
        buyerName?: string;
        cancelledAt?: number;
        currency?: string;
        eventId: string;
        normalizationNote?: string;
        normalizedStatus?: "paid" | "refunded" | "cancelled" | "pending";
        orderedAt?: number;
        providerEventId: string;
        providerOrderId: string;
        providerStatus?: string;
        rawPayload: any;
        refundedAt?: number;
        totalAmountMinor?: number;
      },
      Id<"ticketTailorOrders">
    >;
  };
};

export declare const components: {};
