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
    confirmBuyerAssignment: FunctionReference<
      "mutation",
      "public",
      {
        assignmentId: Id<"orderAssignments">;
        slotId?: Id<"accommodationSlots">;
      },
      any
    >;
    createAccommodationAgeBand: FunctionReference<
      "mutation",
      "public",
      {
        code: "under_3" | "3_11" | "12_17" | "18_plus";
        label: string;
        maxAge?: number;
        minAge: number;
        sortOrder: number;
      },
      any
    >;
    createAccommodationCategory: FunctionReference<
      "mutation",
      "public",
      {
        code: "standard" | "superior" | "family";
        description?: string;
        label: string;
        sortOrder: number;
      },
      any
    >;
    createAccommodationOption: FunctionReference<
      "mutation",
      "public",
      {
        code: "superior_upgrade" | "cot";
        description?: string;
        kind: "addon" | "upgrade" | "eligibility";
        label: string;
        unit: "per_night" | "per_person";
      },
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
        autoGenerateSlots?: boolean;
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
      {
        categoryId?: Id<"accommodationCategories">;
        count?: number;
        defaultCapacity: number;
        description?: string;
        label: string;
        notes?: string;
      },
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
    generateSlotsForRoom: FunctionReference<
      "mutation",
      "public",
      {
        eventId: Id<"events">;
        genderPolicy: "male" | "female" | "mixed";
        roomId: Id<"accommodationRooms">;
      },
      any
    >;
    getAccommodationCatalog: FunctionReference<"query", "public", {}, any>;
    getAccommodationSummaryForEvent: FunctionReference<
      "query",
      "public",
      { eventId: Id<"events"> },
      any
    >;
    getEventAccommodationConfig: FunctionReference<
      "query",
      "public",
      { eventId: Id<"events"> },
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
    getSlotsForEvent: FunctionReference<
      "query",
      "public",
      { eventId: Id<"events"> },
      any
    >;
    linkHotelToEvent: FunctionReference<
      "mutation",
      "public",
      {
        autoGenerateSlots?: boolean;
        eventId?: string;
        eventProviderEventId?: string;
        hotelId: Id<"accommodationHotels">;
      },
      any
    >;
    listAccommodationInventory: FunctionReference<"query", "public", {}, any>;
    removeBuyerAssignment: FunctionReference<
      "mutation",
      "public",
      { assignmentId: Id<"orderAssignments">; reason?: string },
      any
    >;
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
    updateAccommodationAgeBand: FunctionReference<
      "mutation",
      "public",
      {
        ageBandId: Id<"accommodationAgeBands">;
        label?: string;
        maxAge?: number;
        minAge?: number;
        sortOrder?: number;
      },
      any
    >;
    updateAccommodationCategory: FunctionReference<
      "mutation",
      "public",
      {
        categoryId: Id<"accommodationCategories">;
        description?: string;
        label?: string;
        sortOrder?: number;
      },
      any
    >;
    updateAccommodationOption: FunctionReference<
      "mutation",
      "public",
      {
        description?: string;
        label?: string;
        optionId: Id<"accommodationOptions">;
      },
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
        categoryId?: Id<"accommodationCategories">;
        count?: number;
        defaultCapacity?: number;
        description?: string;
        label?: string;
        notes?: string;
        roomTypeId: string;
      },
      any
    >;
    upsertEventAccommodationAgePricing: FunctionReference<
      "mutation",
      "public",
      {
        ageBandCode: "under_3" | "3_11" | "12_17" | "18_plus";
        eventId: Id<"events">;
        rateType: "free" | "full" | "percent" | "flat";
        sortOrder?: number;
        value: number;
      },
      any
    >;
    upsertEventAccommodationConfig: FunctionReference<
      "mutation",
      "public",
      {
        allowExtendedStayAfter?: boolean;
        allowExtendedStayBefore?: boolean;
        allowExtendedStayBoth?: boolean;
        baseCheckInAt?: number;
        baseCheckOutAt?: number;
        breakfastIncluded?: boolean;
        defaultCategoryId?: Id<"accommodationCategories">;
        eventId: Id<"events">;
      },
      any
    >;
    upsertEventAccommodationOption: FunctionReference<
      "mutation",
      "public",
      {
        eligibilityAgeBandCode?: "under_3" | "3_11" | "12_17" | "18_plus";
        enabled?: boolean;
        eventId: Id<"events">;
        notes?: string;
        optionId: Id<"accommodationOptions">;
        priceMinor?: number;
      },
      any
    >;
    upsertEventAccommodationRate: FunctionReference<
      "mutation",
      "public",
      {
        categoryId: Id<"accommodationCategories">;
        eventId: Id<"events">;
        occupancy: "single" | "shared" | "family";
        pricePerPersonMinor: number;
      },
      any
    >;
    upsertEventAccommodationResource: FunctionReference<
      "mutation",
      "public",
      {
        count: number;
        eventId: Id<"events">;
        kind: "room" | "cot";
        roomTypeId?: Id<"accommodationRoomTypes">;
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
        eventId: Id<"events"> | string;
        genderType?: "MALE" | "FEMALE" | "MIXED" | "UNKNOWN";
        name?: string;
        orderId: Id<"orders">;
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
        orderId?: Id<"orders">;
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
    getAttendeesWithTickets: FunctionReference<
      "query",
      "public",
      { eventId?: string },
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
        attendeeId: string;
        email?: string;
        genderType?: "MALE" | "FEMALE" | "MIXED" | "UNKNOWN";
        location?: string | null;
        name?: string;
        priorityReason?: string;
        ticketTypeId?: Id<"ticketTypes">;
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
        eventId: Id<"events"> | string;
        genderType?: "MALE" | "FEMALE" | "MIXED" | "UNKNOWN";
        name?: string;
        orderId: Id<"orders">;
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
  emailActions: {
    resendOrderConfirmation: FunctionReference<
      "action",
      "public",
      { orderId: Id<"orders"> },
      { emailId?: string; error?: string; success: boolean }
    >;
    sendSignupConfirmationTest: FunctionReference<
      "action",
      "public",
      {
        attendeeCount: number;
        bookerName: string;
        bookingRef: string;
        eventDate: string;
        eventLocation: string;
        eventName: string;
        roomAssignments: Array<{
          bedCount: number;
          hotelName: string;
          roomType: string;
        }>;
        successPageUrl: string;
        tikkieAmountMinor?: number;
        tikkieCurrency?: string;
        tikkieUrl?: string;
        to: string;
        trackPaymentUrl: string;
      },
      { emailId?: string; error?: string; success: boolean }
    >;
  };
  emailMutations: {
    triggerSignupConfirmationEmail: FunctionReference<
      "mutation",
      "public",
      {
        attendeeCount: number;
        bookerName: string;
        bookingRef: string;
        eventDate: string;
        eventLocation: string;
        eventName: string;
        roomAssignments: Array<{
          bedCount: number;
          hotelName: string;
          roomType: string;
        }>;
        successPageUrl: string;
        tikkieAmountMinor?: number;
        tikkieCurrency?: string;
        tikkieUrl?: string;
        to: string;
        trackPaymentUrl: string;
      },
      null
    >;
  };
  emailQueries: {
    getEmailStatus: FunctionReference<
      "query",
      "public",
      { bookingRef: string },
      any
    >;
  };
  events: {
    createEvent: FunctionReference<
      "mutation",
      "public",
      {
        accommodationEnabled?: boolean;
        currency: string;
        defaultRoomTypeId?: Id<"accommodationRoomTypes">;
        endsAt?: number;
        isPublished?: boolean;
        isSignupOpen?: boolean;
        primarySourceKind?: "integration" | "internal";
        primarySourceProvider?: string;
        slug: string;
        startsAt: number;
        timezone: string;
        title: string;
      },
      Id<"events">
    >;
    createManualAttendee: FunctionReference<
      "mutation",
      "public",
      {
        attendeeEmail?: string;
        attendeeName: string;
        attendeePhone?: string;
        dietaryRestrictions?: string;
        eventId: Id<"events">;
        gender?: "male" | "female" | "mixed" | "unknown";
        location?: string;
        notes?: string;
        roommatePreference?: string;
        ticketTypeId: Id<"ticketTypes">;
      },
      any
    >;
    createTicketType: FunctionReference<
      "mutation",
      "public",
      {
        accommodationIncluded?: boolean;
        eventId: Id<"events">;
        isActive?: boolean;
        label: string;
        maxQuantity?: number;
        priceMinor: number;
        roomTypeId?: Id<"accommodationRoomTypes">;
        visibility?: "public" | "hidden";
      },
      any
    >;
    deleteEvent: FunctionReference<
      "mutation",
      "public",
      { eventId: Id<"events"> },
      any
    >;
    deleteTicketType: FunctionReference<
      "mutation",
      "public",
      { ticketTypeId: Id<"ticketTypes"> },
      any
    >;
    getAttendeesForEvent: FunctionReference<
      "query",
      "public",
      { eventId: Id<"events"> },
      any
    >;
    getEventById: FunctionReference<
      "query",
      "public",
      { eventId: string },
      any
    >;
    getEventBySlug: FunctionReference<"query", "public", { slug: string }, any>;
    getEvents: FunctionReference<
      "query",
      "public",
      {},
      Array<{
        _creationTime: number;
        _id: Id<"events">;
        accommodationEnabled: boolean;
        currency: string;
        defaultRoomTypeId?: Id<"accommodationRoomTypes">;
        endsAt?: number;
        isPublished: boolean;
        isSignupOpen: boolean;
        primarySourceKind: "integration" | "internal";
        primarySourceProvider?: string;
        slug: string;
        startsAt: number;
        timezone: string;
        title: string;
        updatedAt: number;
      }>
    >;
    getEventsForLedger: FunctionReference<
      "query",
      "public",
      {},
      Array<{
        currency: string | null;
        eventId: string;
        slug: string;
        startsAt: number | null;
        title: string | null;
      }>
    >;
    getEventSourceByProvider: FunctionReference<
      "query",
      "public",
      { externalEventId: string; provider: string },
      any
    >;
    getEventSourcesForEvent: FunctionReference<
      "query",
      "public",
      { eventId: Id<"events"> },
      any
    >;
    getEventsWithAccommodation: FunctionReference<
      "query",
      "public",
      {},
      Array<{
        _creationTime: number;
        _id: Id<"events">;
        accommodationEnabled: boolean;
        currency: string;
        defaultRoomTypeId?: Id<"accommodationRoomTypes">;
        endsAt?: number;
        isPublished: boolean;
        isSignupOpen: boolean;
        primarySourceKind: "integration" | "internal";
        primarySourceProvider?: string;
        slug: string;
        startsAt: number;
        timezone: string;
        title: string;
        updatedAt: number;
      }>
    >;
    getTicketTailorEventByProviderId: FunctionReference<
      "query",
      "public",
      { providerEventId: string },
      any
    >;
    getTicketTypesForEvent: FunctionReference<
      "query",
      "public",
      { eventId: Id<"events"> },
      any
    >;
    reorderTicketTypes: FunctionReference<
      "mutation",
      "public",
      { eventId: Id<"events">; orderedTicketTypeIds: Array<Id<"ticketTypes">> },
      any
    >;
    updateEvent: FunctionReference<
      "mutation",
      "public",
      {
        accommodationEnabled?: boolean;
        currency?: string;
        defaultRoomTypeId?: Id<"accommodationRoomTypes">;
        endsAt?: number;
        eventId: Id<"events">;
        isPublished?: boolean;
        isSignupOpen?: boolean;
        primarySourceKind?: "integration" | "internal";
        primarySourceProvider?: string;
        slug?: string;
        startsAt?: number;
        timezone?: string;
        title?: string;
      },
      any
    >;
    updateTicketType: FunctionReference<
      "mutation",
      "public",
      {
        accommodationIncluded?: boolean;
        availabilityState?: "selectable" | "unavailable";
        isActive?: boolean;
        label?: string;
        maxQuantity?: number;
        priceMinor?: number;
        roomTypeId?: Id<"accommodationRoomTypes">;
        sortOrder?: number;
        ticketTypeId: Id<"ticketTypes">;
        visibility?: "public" | "hidden";
      },
      any
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
        eventId: Id<"events"> | string;
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
      { eventId: Id<"events"> | string },
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
        eventId?: Id<"events"> | string;
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
        limit?: number;
        status?: "paid" | "refunded" | "cancelled" | "pending";
        to?: number;
      },
      Array<{
        amountDueMinor: number | null;
        archiveReason: string | null;
        archivedAt: string | null;
        buyerEmail: string | null;
        buyerName: string | null;
        currency: string | null;
        eventId: string;
        eventSlug: string;
        eventTitle: string | null;
        isArchived: boolean;
        matchedAmountMinor: number | null;
        normalizedStatus: "paid" | "refunded" | "cancelled" | "pending";
        orderId?: string;
        orderedAt: string | null;
        outstandingAmountMinor: number;
        providerOrderId: string | null;
        refundedAt: string | null;
        totalAmountMinor: number | null;
      }>
    >;
    getOrdersWithFilters: FunctionReference<
      "query",
      "public",
      {
        eventId?: string;
        from?: number;
        location?: string;
        page?: number;
        pageSize?: number;
        status?: "paid" | "refunded" | "cancelled" | "pending";
        to?: number;
      },
      {
        orders: Array<{
          amountDueMinor: number | null;
          archiveReason: string | null;
          archivedAt: string | null;
          buyerEmail: string | null;
          buyerName: string | null;
          currency: string | null;
          eventId: string;
          eventSlug: string;
          eventTitle: string | null;
          isArchived: boolean;
          matchedAmountMinor: number | null;
          normalizedStatus: "paid" | "refunded" | "cancelled" | "pending";
          orderId?: string;
          orderedAt: string | null;
          outstandingAmountMinor: number;
          providerOrderId: string | null;
          refundedAt: string | null;
          totalAmountMinor: number | null;
        }>;
        totalPages: number;
        totalRows: number;
        totals: {
          amountDueMinor: number;
          matchedAmountMinor: number;
          outstandingAmountMinor: number;
        };
      }
    >;
    getOrderWithAttendees: FunctionReference<
      "query",
      "public",
      { orderId: Id<"orders"> },
      {
        attendees: Array<{
          amountDueMinor: number;
          email: string | null;
          id: Id<"orderAttendees">;
          name: string;
          normalizedStatus: string;
          roommateAvoid: string | null;
          roommatePreference: string | null;
          ticketTypeLabel: string;
        }>;
        order: {
          amountDueMinor: number | null;
          archiveReason: string | null;
          archivedAt: string | null;
          bookerEmail: string | null;
          bookerName: string | null;
          bookingRef: string | null;
          eventId: Id<"events"> | null;
          id: Id<"orders">;
          isArchived?: boolean;
          normalizedStatus?: "paid" | "refunded" | "cancelled" | "pending";
          orderedAt: string | null;
          providerOrderId: string | null;
          totalAmountMinor?: number;
        };
      } | null
    >;
    mergeOrders: FunctionReference<
      "mutation",
      "public",
      { sourceOrderId: Id<"orders">; targetOrderId: Id<"orders"> },
      {
        movedAttendees: number;
        movedPayments: number;
        targetOrderId: Id<"orders">;
      }
    >;
    removeOrderLocally: FunctionReference<
      "mutation",
      "public",
      { orderId: Id<"orders"> },
      { deletedAt: number; orderId: Id<"orders"> }
    >;
    searchOrders: FunctionReference<
      "query",
      "public",
      { eventId?: Id<"events"> | string; limit?: number; search: string },
      Array<{
        amountDueMinor: number | null;
        buyerName: string | null;
        id: Id<"orders">;
        providerOrderId: string | null;
      }>
    >;
    searchOrdersForMerge: FunctionReference<
      "query",
      "public",
      { eventId: Id<"events"> | string; search: string },
      Array<{
        bookerEmail: string | null;
        bookerName: string | null;
        bookingRef: string | null;
        orderId: Id<"orders">;
        orderedAt: string | null;
        totalAmountMinor: number | null;
      }>
    >;
    updateOrderDetails: FunctionReference<
      "mutation",
      "public",
      {
        bookerEmail?: string | null;
        bookerName?: string | null;
        bookingRef?: string | null;
        normalizedStatus?: "paid" | "refunded" | "cancelled" | "pending";
        orderId: Id<"orders">;
        orderedAt?: number | null;
        totalAmountMinor?: number | null;
      },
      Id<"orders">
    >;
    updateOrderStatus: FunctionReference<
      "mutation",
      "public",
      {
        normalizedStatus: "paid" | "refunded" | "cancelled" | "pending";
        orderId: Id<"orders">;
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
        eventId: Id<"events"> | string;
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
        orderId: Id<"orders">;
        paymentId: Id<"payments">;
        status?: "auto_matched" | "manual_assignment";
      },
      any
    >;
    autoMatchPayments: FunctionReference<
      "mutation",
      "public",
      { eventId: Id<"events"> | string },
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
        eventId?: Id<"events">;
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
          | "unassigned"
          | "donation";
      },
      any
    >;
    createStandaloneDonation: FunctionReference<
      "mutation",
      "public",
      {
        amountMinor: number;
        eventId: Id<"events">;
        notes?: string;
        paidAt: number;
        payerName: string;
        source: "cash" | "bank_transfer";
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
        donationKind?: "overpayment" | "standalone";
        eventId?: Id<"events">;
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
          | "unassigned"
          | "donation";
      } | null
    >;
    getPayments: FunctionReference<
      "query",
      "public",
      {
        eventId?: Id<"events">;
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
          | "unassigned"
          | "donation";
      },
      Array<{
        _creationTime: number;
        _id: Id<"payments">;
        amountMinor: number;
        donationKind?: "overpayment" | "standalone";
        eventId?: Id<"events">;
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
          | "unassigned"
          | "donation";
      }>
    >;
    getPaymentSummary: FunctionReference<
      "query",
      "public",
      { orderId: string },
      any
    >;
    getStandaloneDonations: FunctionReference<
      "query",
      "public",
      {
        eventId?: Id<"events">;
        from?: number;
        paginationOpts: {
          cursor: string | null;
          endCursor?: string | null;
          id?: number;
          maximumBytesRead?: number;
          maximumRowsRead?: number;
          numItems: number;
        };
        to?: number;
      },
      any
    >;
    getUnassignedPayments: FunctionReference<"query", "public", {}, any>;
    markPaymentAsDonation: FunctionReference<
      "mutation",
      "public",
      { eventId?: Id<"events">; matchedBy?: string; paymentId: Id<"payments"> },
      any
    >;
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
  publicTracking: {
    getByBookingRef: FunctionReference<
      "query",
      "public",
      { bookingRef: string },
      null | {
        bookingRef: string;
        event: { slug: string; startsAt: number; title: string };
        order: {
          amountDueMinor: number | null;
          buyerEmail: string | null;
          buyerName: string | null;
          buyerPhone: string | null;
          orderedAt: number | null;
          status: string | null;
          submittedAt: number | null;
          totalAmountMinor: number | null;
        };
        payment: {
          paymentCount: number;
          paymentStatus: "unpaid" | "partial" | "paid" | "overpaid";
          progressPercent: number;
          remainingMinor: number;
          totalDueMinor: number;
          totalPaidMinor: number;
        };
        tikkieAmountMinor: number | null;
        tikkieDescription: string | null;
        tikkieUrl: string | null;
      }
    >;
    getByEmailOrBookingRef: FunctionReference<
      "query",
      "public",
      { emailOrBookingRef: string },
      null | {
        bookingRef: string;
        event: { slug: string; startsAt: number; title: string };
        order: {
          amountDueMinor: number | null;
          buyerEmail: string | null;
          buyerName: string | null;
          buyerPhone: string | null;
          orderedAt: number | null;
          status: string | null;
          submittedAt: number | null;
          totalAmountMinor: number | null;
        };
        payment: {
          paymentCount: number;
          paymentStatus: "unpaid" | "partial" | "paid" | "overpaid";
          progressPercent: number;
          remainingMinor: number;
          totalDueMinor: number;
          totalPaidMinor: number;
        };
        tikkieAmountMinor: number | null;
        tikkieDescription: string | null;
        tikkieUrl: string | null;
      }
    >;
  };
  reports: {
    getEventLocations: FunctionReference<
      "query",
      "public",
      { eventId: Id<"events"> },
      any
    >;
    getFullReportByToken: FunctionReference<
      "query",
      "public",
      { token: string },
      any
    >;
    getReportByToken: FunctionReference<
      "query",
      "public",
      { token: string },
      any
    >;
  };
  reportShares: {
    createEventShare: FunctionReference<
      "mutation",
      "public",
      { eventId: Id<"events">; region?: string },
      any
    >;
    listEventShares: FunctionReference<
      "query",
      "public",
      { eventId: Id<"events"> },
      any
    >;
    revokeEventShare: FunctionReference<
      "mutation",
      "public",
      { token: string },
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
            slotId: Id<"accommodationSlots">;
          }>;
        };
        currency: string;
        defaultRoomTypeId?: Id<"accommodationRoomTypes">;
        endsAt?: number;
        eventId: Id<"events">;
        slug: string;
        source: {
          externalEventId: string | null;
          kind: "integration" | "internal";
          provider: string | null;
        };
        startsAt: number;
        tickets: Array<{
          label: string;
          priceMinor: number;
          reason: "sold_out" | "disabled" | "hidden" | "not_on_sale" | null;
          roomTypeId?: Id<"accommodationRoomTypes">;
          selectable: boolean;
          ticketTypeId: Id<"ticketTypes">;
        }>;
        timezone: string;
        title: string;
      }>
    >;
  };
  signupSubmission: {
    getByBookingRef: FunctionReference<
      "query",
      "public",
      { bookingRef: string },
      null | {
        accommodationLines: Array<{
          chargeMinor: number;
          kind: "accommodation" | "superior_upgrade" | "cot";
          label: string;
          nights: number;
          ratePerNightMinor: number;
        }>;
        attendees: Array<{
          assignedRoom?: string;
          email?: string;
          name: string;
          ticketType: string;
        }>;
        bookerEmail?: string;
        bookerName?: string;
        bookerPhone?: string;
        bookingRef?: string;
        eventId?: Id<"events">;
        eventSlug?: string;
        roomAssignments: Array<{
          bedCount: number;
          hotelName: string;
          roomType: string;
        }>;
        submissionId: Id<"orders">;
        submittedAt?: number;
        ticketSelections: Array<{
          id: string;
          pricePerTicketMinor: number;
          quantity: number;
          ticketTypeId: string;
          ticketTypeName: string;
        }>;
        totalAmountMinor?: number;
      }
    >;
    submitSignupEnvelope: FunctionReference<
      "mutation",
      "public",
      {
        assignments: Array<{
          assignmentIntent: "assign" | "skip";
          attendeeKey: string;
          slotId: Id<"accommodationSlots">;
        }>;
        attendees: Array<{
          attendeeKey: string;
          dietaryRestrictions?: string;
          email?: string;
          gender: "male" | "female" | "mixed" | "unknown";
          location?: string;
          name: string;
          phone?: string;
          roommateAvoid?: string;
          roommatePreference?: string;
        }>;
        booker: { email: string; name: string; phone?: string };
        eventId: Id<"events">;
        honeypotSeen: boolean;
        idempotencyKey: string;
        notes?: string;
        payloadFingerprint: string;
        source: "integration" | "internal";
        ticketSelections: Array<{
          attendeeKey: string;
          quantity: number;
          ticketTypeId: Id<"ticketTypes">;
        }>;
      },
      {
        bookingRef?: string;
        restorePayload: {
          assignments: Array<{
            assignmentIntent: "assign" | "skip";
            attendeeKey: string;
            slotId: string;
          }>;
          attendees: Array<{
            attendeeKey: string;
            dietaryRestrictions?: string;
            email?: string;
            gender: "male" | "female" | "mixed" | "unknown";
            location?: string;
            name: string;
            phone?: string;
            roommateAvoid?: string;
            roommatePreference?: string;
          }>;
          booker: { email?: string; name?: string; phone?: string };
          eventId: string;
          notes?: string;
          source?: "integration" | "internal";
          ticketSelections: Array<{
            attendeeKey: string;
            quantity: 1;
            ticketTypeId: string;
          }>;
        };
        submissionId: Id<"orders">;
        submittedAt: string;
      }
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
    attendees: {
      getTicketTailorAttendeesByOrderId: FunctionReference<
        "query",
        "public",
        { orderId: Id<"orders"> },
        any
      >;
      upsertTicketTailorAttendee: FunctionReference<
        "mutation",
        "public",
        {
          ageGroup?: string;
          allocationPriority?: "CRITICAL" | "HIGH" | "NORMAL" | "LOW";
          attendeeId?: Id<"orderAttendees">;
          customAnswers?: any;
          email?: string;
          eventId: Id<"events"> | string;
          genderType?: "MALE" | "FEMALE" | "MIXED" | "UNKNOWN";
          name?: string;
          orderId: Id<"orders">;
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
    };
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
    events: {
      getTicketTailorEventByProviderId: FunctionReference<
        "query",
        "public",
        { providerEventId: string },
        any
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
    };
    families: {
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
      createAttendeeFamilyGroup: FunctionReference<
        "mutation",
        "public",
        { label?: string; primaryAttendeeId: string },
        Id<"attendeeFamilyGroups">
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
    };
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
      { orderId: Id<"orders"> },
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
    orders: {
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
      getTicketTailorOrderByProviderId: FunctionReference<
        "query",
        "public",
        { providerOrderId: string },
        any
      >;
      upsertTicketTailorOrder: FunctionReference<
        "mutation",
        "public",
        {
          buyerEmail?: string;
          buyerName?: string;
          cancelledAt?: number;
          currency?: string;
          eventId: Id<"events"> | string;
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
    runs: {
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
      getLatestSyncRun: FunctionReference<"query", "public", {}, any>;
      getSyncRunById: FunctionReference<
        "query",
        "public",
        { runId: Id<"ticketTailorSyncRuns"> },
        any
      >;
      getSyncRuns: FunctionReference<"query", "public", {}, any>;
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
    };
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
        attendeeId?: Id<"orderAttendees">;
        customAnswers?: any;
        email?: string;
        eventId: Id<"events"> | string;
        genderType?: "MALE" | "FEMALE" | "MIXED" | "UNKNOWN";
        name?: string;
        orderId: Id<"orders">;
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
        eventId: Id<"events"> | string;
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
    webhooks: {
      createWebhookEvent: FunctionReference<
        "mutation",
        "public",
        { eventType: string; payload: any; providerEventId: string },
        Id<"ticketTailorWebhookEvents">
      >;
      getPendingWebhookEvents: FunctionReference<
        "query",
        "public",
        { limit?: number },
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
    };
  };
  tikkie: {
    autoMatchTikkiePayments: FunctionReference<
      "mutation",
      "public",
      { eventId: Id<"events"> | string },
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
    getEventPaymentLinkForSuccess: FunctionReference<
      "query",
      "public",
      { eventId: Id<"events"> },
      null | {
        amountMinor?: number;
        createdAt: number;
        description?: string;
        paymentUrl: string;
      }
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
  emailActions: {
    sendSignupConfirmation: FunctionReference<
      "action",
      "internal",
      {
        attendeeCount: number;
        bookerName: string;
        bookingRef: string;
        eventDate: string;
        eventLocation: string;
        eventName: string;
        roomAssignments: Array<{
          bedCount: number;
          hotelName: string;
          roomType: string;
        }>;
        successPageUrl: string;
        tikkieAmountMinor?: number;
        tikkieCurrency?: string;
        tikkieUrl?: string;
        to: string;
        trackPaymentUrl: string;
      },
      { emailId?: string; error?: string; success: boolean }
    >;
  };
  emailMutations: {
    logSentEmail: FunctionReference<
      "mutation",
      "internal",
      {
        bookingRef: string;
        emailId?: string;
        emailType: string;
        recipient: string;
      },
      any
    >;
  };
  orders: {
    syncFullyPaidOrders: FunctionReference<
      "mutation",
      "internal",
      {},
      { scanned: number; updated: number }
    >;
  };
  payments: {
    internalAssignPaymentToOrder: FunctionReference<
      "mutation",
      "internal",
      {
        matchedBy?: string;
        orderId: Id<"orders">;
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
    attendees: {
      internalGetTicketTailorAttendeesByOrderId: FunctionReference<
        "query",
        "internal",
        { orderId: Id<"orders"> },
        any
      >;
      internalUpsertTicketTailorAttendee: FunctionReference<
        "mutation",
        "internal",
        {
          ageGroup?: string;
          attendeeId: Id<"orderAttendees">;
          checkedInAt?: number;
          customAnswers?: any;
          genderType?: "MALE" | "FEMALE" | "MIXED" | "UNKNOWN";
          orderId: Id<"orders">;
          providerAttendeeId?: string;
          providerEventId: string;
          providerIssuedTicketId?: string;
          providerOrderId: string;
          providerTicketTypeId?: string;
          rawPayload: any;
          ticketCategory?: string;
          ticketStatus?: string;
          ticketTypeLabel?: string;
          tikkieAmountOverrideMinor?: number;
        },
        {
          attendeeId: Id<"orderAttendees">;
          ticketTailorAttendeeId: Id<"ticketTailorAttendees">;
        }
      >;
    };
    events: {
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
        {
          canonicalEventId: Id<"events">;
          ticketTailorEventId: Id<"ticketTailorEvents">;
        }
      >;
    };
    families: {
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
    };
    internal: {
      internalGetAttendeesByOrder: FunctionReference<
        "query",
        "internal",
        {},
        any
      >;
      internalGetPaidOrders: FunctionReference<"query", "internal", {}, any>;
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
    };
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
    internalGetAttendeesByOrder: FunctionReference<
      "query",
      "internal",
      {},
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
      { orderId: Id<"orders"> },
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
        attendeeId: Id<"orderAttendees">;
        checkedInAt?: number;
        customAnswers?: any;
        genderType?: "MALE" | "FEMALE" | "MIXED" | "UNKNOWN";
        orderId: Id<"orders">;
        providerAttendeeId?: string;
        providerEventId: string;
        providerIssuedTicketId?: string;
        providerOrderId: string;
        providerTicketTypeId?: string;
        rawPayload: any;
        ticketCategory?: string;
        ticketStatus?: string;
        ticketTypeLabel?: string;
        tikkieAmountOverrideMinor?: number;
      },
      {
        attendeeId: Id<"orderAttendees">;
        ticketTailorAttendeeId: Id<"ticketTailorAttendees">;
      }
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
      {
        canonicalEventId: Id<"events">;
        ticketTailorEventId: Id<"ticketTailorEvents">;
      }
    >;
    internalUpsertTicketTailorOrder: FunctionReference<
      "mutation",
      "internal",
      {
        isArchived?: boolean;
        normalizationNote?: string;
        normalizedStatus?: "paid" | "refunded" | "cancelled" | "pending";
        providerEventId: string;
        providerOrderId: string;
        providerStatus?: string;
        rawPayload: any;
      },
      { orderId: Id<"orders">; ticketTailorOrderId: Id<"ticketTailorOrders"> }
    >;
    orders: {
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
      internalBackfillMissingOrderTotals: FunctionReference<
        "mutation",
        "internal",
        { limit?: number },
        { patched: number; scanned: number; unchanged: number }
      >;
      internalUpsertTicketTailorOrder: FunctionReference<
        "mutation",
        "internal",
        {
          isArchived?: boolean;
          normalizationNote?: string;
          normalizedStatus?: "paid" | "refunded" | "cancelled" | "pending";
          providerEventId: string;
          providerOrderId: string;
          providerStatus?: string;
          rawPayload: any;
        },
        { orderId: Id<"orders">; ticketTailorOrderId: Id<"ticketTailorOrders"> }
      >;
    };
    runs: {
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
      internalStartSyncRun: FunctionReference<
        "mutation",
        "internal",
        {},
        Id<"ticketTailorSyncRuns">
      >;
    };
  };
};

export declare const components: {
  resend: {
    lib: {
      cancelEmail: FunctionReference<
        "mutation",
        "internal",
        { emailId: string },
        null
      >;
      cleanupAbandonedEmails: FunctionReference<
        "mutation",
        "internal",
        { olderThan?: number },
        null
      >;
      cleanupOldEmails: FunctionReference<
        "mutation",
        "internal",
        { olderThan?: number },
        null
      >;
      createManualEmail: FunctionReference<
        "mutation",
        "internal",
        {
          from: string;
          headers?: Array<{ name: string; value: string }>;
          replyTo?: Array<string>;
          subject: string;
          to: Array<string> | string;
        },
        string
      >;
      get: FunctionReference<
        "query",
        "internal",
        { emailId: string },
        {
          bcc?: Array<string>;
          bounced?: boolean;
          cc?: Array<string>;
          clicked?: boolean;
          complained: boolean;
          createdAt: number;
          deliveryDelayed?: boolean;
          errorMessage?: string;
          failed?: boolean;
          finalizedAt: number;
          from: string;
          headers?: Array<{ name: string; value: string }>;
          html?: string;
          opened: boolean;
          replyTo: Array<string>;
          resendId?: string;
          segment: number;
          status:
            | "waiting"
            | "queued"
            | "cancelled"
            | "sent"
            | "delivered"
            | "delivery_delayed"
            | "bounced"
            | "failed";
          subject?: string;
          template?: {
            id: string;
            variables?: Record<string, string | number>;
          };
          text?: string;
          to: Array<string>;
        } | null
      >;
      getStatus: FunctionReference<
        "query",
        "internal",
        { emailId: string },
        {
          bounced: boolean;
          clicked: boolean;
          complained: boolean;
          deliveryDelayed: boolean;
          errorMessage: string | null;
          failed: boolean;
          opened: boolean;
          status:
            | "waiting"
            | "queued"
            | "cancelled"
            | "sent"
            | "delivered"
            | "delivery_delayed"
            | "bounced"
            | "failed";
        } | null
      >;
      handleEmailEvent: FunctionReference<
        "mutation",
        "internal",
        { event: any },
        null
      >;
      sendEmail: FunctionReference<
        "mutation",
        "internal",
        {
          bcc?: Array<string>;
          cc?: Array<string>;
          from: string;
          headers?: Array<{ name: string; value: string }>;
          html?: string;
          options: {
            apiKey: string;
            initialBackoffMs: number;
            onEmailEvent?: { fnHandle: string };
            retryAttempts: number;
            testMode: boolean;
          };
          replyTo?: Array<string>;
          subject?: string;
          template?: {
            id: string;
            variables?: Record<string, string | number>;
          };
          text?: string;
          to: Array<string>;
        },
        string
      >;
      updateManualEmail: FunctionReference<
        "mutation",
        "internal",
        {
          emailId: string;
          errorMessage?: string;
          resendId?: string;
          status:
            | "waiting"
            | "queued"
            | "cancelled"
            | "sent"
            | "delivered"
            | "delivery_delayed"
            | "bounced"
            | "failed";
        },
        null
      >;
    };
  };
};
