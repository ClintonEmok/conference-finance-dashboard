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
    confirmAccommodationOrderConfiguration: FunctionReference<
      "mutation",
      "public",
      { orderId: Id<"orders"> },
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
        code: string;
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
      { address?: string; city?: string; name: string; notes?: string },
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
      {
        address?: string;
        city?: string;
        hotelId: string;
        name?: string;
        notes?: string;
      },
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
    moveAttendeeToOrder: FunctionReference<
      "mutation",
      "public",
      { attendeeId: string; targetOrderId: Id<"orders"> },
      any
    >;
    setAttendeeAccommodation: FunctionReference<
      "mutation",
      "public",
      {
        attendeeId: string;
        eventId: Id<"events">;
        nightBeforeLevel?: "standard" | "superior";
        nightBeforeOccupancy?: "single" | "shared";
        occupancy?: "single" | "shared";
        optionSelections?: Array<{
          nights: number;
          optionKey: string;
          quantity: number;
        }>;
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
    sendAnnouncementTest: FunctionReference<
      "action",
      "public",
      {
        eventDate: string;
        eventLocation: string;
        eventName: string;
        manageBookingUrl: string;
        message: string;
        nightBeforeNote?: string;
        paymentUrl?: string;
        signupUrl: string;
        title: string;
        to: string;
      },
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
  emailBroadcasts: {
    cancelEmailBroadcast: FunctionReference<
      "mutation",
      "public",
      { broadcastId: Id<"emailBroadcasts"> },
      { cancelled: boolean }
    >;
    getBroadcastById: FunctionReference<
      "query",
      "public",
      { broadcastId: Id<"emailBroadcasts"> },
      any
    >;
    getBroadcastHistory: FunctionReference<
      "query",
      "public",
      { eventId: Id<"events"> },
      any
    >;
    getBroadcastRecipients: FunctionReference<
      "query",
      "public",
      {
        broadcastId: Id<"emailBroadcasts">;
        limit?: number;
        status?: "pending" | "sent" | "failed";
      },
      any
    >;
    previewAudience: FunctionReference<
      "query",
      "public",
      {
        eventId: Id<"events">;
        from?: number;
        hasAccommodationSelection?: boolean;
        limit?: number;
        location?: string;
        search?: string;
        status?: "paid" | "refunded" | "cancelled" | "pending";
        ticketTypeId?: Id<"ticketTypes">;
        to?: number;
      },
      any
    >;
    retryFailedEmailBroadcast: FunctionReference<
      "mutation",
      "public",
      { broadcastId: Id<"emailBroadcasts"> },
      { requeued: number }
    >;
    scheduleEmailBroadcast: FunctionReference<
      "mutation",
      "public",
      {
        authorize: boolean;
        eventDate: string;
        eventId: Id<"events">;
        eventLocation: string;
        eventName: string;
        filters: {
          from?: number;
          hasAccommodationSelection?: boolean;
          location?: string;
          status?: "paid" | "refunded" | "cancelled" | "pending";
          ticketTypeId?: Id<"ticketTypes">;
          to?: number;
        };
        message: string;
        nightBeforeNote?: string;
        paymentUrl?: string;
        title: string;
      },
      {
        broadcastId: Id<"emailBroadcasts">;
        skippedNoEmail: number;
        skippedNoRef: number;
        totalRecipients: number;
      }
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
          buyerName: string | null;
          buyerPhone: string | null;
          orderedAt: number | null;
          status: string | null;
          submittedAt: number | null;
          totalAmountMinor: number | null;
        };
        payment: {
          overpaymentDeltaMinor: number;
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
          buyerName: string | null;
          buyerPhone: string | null;
          orderedAt: number | null;
          status: string | null;
          submittedAt: number | null;
          totalAmountMinor: number | null;
        };
        payment: {
          overpaymentDeltaMinor: number;
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
    getTrackPaymentEditContext: FunctionReference<
      "query",
      "public",
      { bookingRef: string },
      null | {
        accommodation: {
          activeCategories: Array<{
            categoryId: Id<"accommodationCategories">;
            code: "standard" | "superior" | "family";
            label: string;
            rates: Array<{
              occupancy: "single" | "shared" | "family";
              pricePerPersonMinor: number;
            }>;
          }>;
          config: {
            baseCheckInAt: number;
            baseCheckOutAt: number;
            breakfastIncluded: boolean;
            nightCount: number;
          } | null;
          eligible: boolean;
          nightBefore: null | {
            standard: { shared: number; single: number };
            superior: { shared: number; single: number };
          };
          options: Array<{
            label: string;
            optionKey: string;
            priceMinor: number;
          }>;
        };
        bookingRef: string;
        event: {
          currency: string;
          slug: string;
          startsAt: number;
          title: string;
        };
        hasSelections: boolean;
        locked: boolean;
        selections: Array<{
          attendeeKey: string;
          attendeeName: string;
          categoryId?: Id<"accommodationCategories">;
          confirmed: boolean;
          nightBeforeLevel?: "standard" | "superior";
          nightBeforeOccupancy?: "single" | "shared";
          occupancy?: "single" | "shared" | "family";
          optionSelections: Array<{
            nights: number;
            optionKey: string;
            quantity: number;
          }>;
          ticketCategoryId?: Id<"accommodationCategories">;
          ticketLabel: string;
          ticketOccupancy?: "single" | "shared" | "family";
        }>;
      }
    >;
    updateAccommodation: FunctionReference<
      "mutation",
      "public",
      {
        bookerEmail?: string;
        bookingRef: string;
        editToken?: string;
        idempotencyKey: string;
        requestSignature: string;
        selections: Array<{
          attendeeKey: string;
          categoryId?: Id<"accommodationCategories">;
          nightBeforeLevel?: "standard" | "superior";
          nightBeforeOccupancy?: "single" | "shared";
          occupancy?: "single" | "shared" | "family";
          optionSelections: Array<{
            nights: number;
            optionKey: string;
            quantity: number;
          }>;
        }>;
      },
      {
        amountDueMinor: number;
        bookingRef: string;
        overpaymentDeltaMinor: number;
        progressPercent: number;
        remainingMinor: number;
        status: "applied" | "unchanged" | "replayed";
        totalPaidMinor: number;
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
    getPublicSignupAccommodationQuote: FunctionReference<
      "query",
      "public",
      {
        attendees: Array<{
          attendeeKey: string;
          categoryId?: Id<"accommodationCategories">;
          nightBeforeLevel?: "standard" | "superior";
          nightBeforeOccupancy?: "single" | "shared";
          nights?: number;
          occupancy?: "single" | "shared" | "family";
          optionSelections: Array<{
            nights: number;
            optionKey: string;
            quantity: number;
          }>;
          ticketTypeId: Id<"ticketTypes">;
        }>;
        eventId: Id<"events">;
      },
      {
        accommodationTotalMinor: number;
        attendees: Array<{
          accommodationIncluded: boolean;
          accommodationTotalMinor: number;
          amountDueMinor: number;
          attendeeKey: string;
          baseNights: number;
          categoryCode?: "standard" | "superior" | "family";
          categoryId?: Id<"accommodationCategories">;
          categoryLabel?: string;
          lines: Array<{
            chargeMinor: number;
            kind: "accommodation" | "option";
            label: string;
            nights: number;
            optionKey?: string;
            quantity?: number;
            ratePerNightMinor: number;
          }>;
          nightBeforeLevel?: "standard" | "superior";
          nightBeforeOccupancy?: "single" | "shared";
          occupancy?: "single" | "shared" | "family";
          ticketLabel: string;
          ticketPriceMinor: number;
          ticketTypeId: Id<"ticketTypes">;
        }>;
        breakfastIncluded: boolean;
        currency: string;
        eventId: Id<"events">;
        ticketTotalMinor: number;
        totalDueMinor: number;
      }
    >;
    getPublicSignupCatalog: FunctionReference<
      "query",
      "public",
      {},
      Array<{
        accommodation: {
          activeCategories: Array<{
            categoryId: Id<"accommodationCategories">;
            code: "standard" | "superior" | "family";
            label: string;
            rates: Array<{
              occupancy: "single" | "shared" | "family";
              pricePerPersonMinor: number;
            }>;
          }>;
          config: {
            baseCheckInAt: number;
            baseCheckOutAt: number;
            breakfastIncluded: boolean;
            nightCount: number;
          } | null;
          eligible: boolean;
          nightBefore: {
            standard: { shared: number; single: number };
            superior: { shared: number; single: number };
          } | null;
          options: Array<{
            label: string;
            optionKey: string;
            priceMinor: number;
          }>;
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
          accommodationIncluded?: boolean;
          label: string;
          occupancy?: "single" | "shared" | "family";
          priceMinor: number;
          reason: "sold_out" | "disabled" | "hidden" | "not_on_sale" | null;
          roomTypeCategoryCode?: "standard" | "superior" | "family";
          roomTypeCategoryId?: Id<"accommodationCategories">;
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
          kind: "accommodation" | "option";
          label: string;
          nights: number;
          optionKey?: string;
          quantity?: number;
          ratePerNightMinor: number;
        }>;
        attendees: Array<{
          assignedRoom?: string;
          email?: string;
          name: string;
          ticketType: string;
        }>;
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
        accommodationSelections: Array<{
          attendeeKey: string;
          categoryId?: Id<"accommodationCategories">;
          nightBeforeLevel?: "standard" | "superior";
          nightBeforeOccupancy?: "single" | "shared";
          nights?: number;
          occupancy: "single" | "shared" | "family";
          optionSelections: Array<{
            nights: number;
            optionKey: string;
            quantity: number;
          }>;
        }>;
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
        source: "integration" | "internal";
        submissionToken?: string;
        ticketSelections: Array<{
          attendeeKey: string;
          quantity: number;
          ticketTypeId: Id<"ticketTypes">;
        }>;
      },
      {
        bookingRef?: string;
        restorePayload: {
          accommodationSelections: Array<{
            attendeeKey: string;
            categoryId?: string;
            nightBeforeLevel?: "standard" | "superior";
            nightBeforeOccupancy?: "single" | "shared";
            nights?: number;
            occupancy: "single" | "shared" | "family";
            optionSelections: Array<{
              nights: number;
              optionKey: string;
              quantity: number;
            }>;
          }>;
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
    attendees: {
      getTicketTailorAttendeesByOrderId: FunctionReference<
        "query",
        "public",
        { orderId: Id<"orders"> },
        any
      >;
    };
    createAttendeeFamilyGroup: FunctionReference<
      "mutation",
      "public",
      { label?: string; primaryAttendeeId: string },
      Id<"attendeeFamilyGroups">
    >;
    events: {
      getTicketTailorEventByProviderId: FunctionReference<
        "query",
        "public",
        { providerEventId: string },
        any
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
    orders: {
      getTicketTailorOrderByProviderId: FunctionReference<
        "query",
        "public",
        { providerOrderId: string },
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
  applyInclusiveEventStay: {
    default: FunctionReference<
      "mutation",
      "internal",
      {
        baseCheckInAt: number;
        baseCheckOutAt: number;
        eventId: Id<"events">;
        markTicketsIncluded?: boolean;
      },
      any
    >;
  };
  applyKoningshofAccommodationInventory: {
    default: FunctionReference<
      "mutation",
      "internal",
      { allowedDeploymentUrl?: string; authorize: boolean; slug?: string },
      {
        done: boolean;
        eventHotelLinked: number;
        eventId: string;
        hotelCreated: number;
        hotelId: string;
        hotelUpdated: number;
        oldHotelsDeleted: number;
        oldLinksDeleted: number;
        oldRoomsDeleted: number;
        oldSlotsDeleted: number;
        resourcesCreated: number;
        resourcesUpdated: number;
        roomsCreated: number;
        roomsRemaining: number;
        slotsCreated: number;
        slotsRemaining: number;
        slug: string;
        staleResourcesRemaining: number;
        staleResourcesRemoved: number;
      }
    >;
  };
  applySimplifiedDivineConferenceAccommodation: {
    default: FunctionReference<
      "mutation",
      "internal",
      { allowedDeploymentUrl?: string; authorize: boolean; slug?: string },
      {
        anchorsPatched: number;
        catalogOptionsCreated: number;
        categoriesCreated: number;
        categoriesUpdated: number;
        configCreated: number;
        configUpdated: number;
        entryTicketsPriced: number;
        entryTicketsRenamed: number;
        eventId: string;
        eventOptionPricesUpdated: number;
        eventOptionsEnabled: number;
        ratesCreated: number;
        ratesUpdated: number;
        roomTypesCreated: number;
        roomTypesUpdated: number;
        singleRoomTicketPriced: number;
        slug: string;
        ticketsAnchored: number;
        ticketsIncluded: number;
      }
    >;
  };
  autoSync: {
    autoSyncTikkiePayments: FunctionReference<"action", "internal", {}, any>;
  };
  backfillLegacyAccommodationPreferences: {
    default: FunctionReference<
      "mutation",
      "internal",
      { allowedDeploymentUrl?: string; authorize: boolean; slug?: string },
      {
        assignmentsConverted: number;
        attendeesHandled: number;
        eventId: string;
        ordersAlreadyHandled: number;
        ordersResolved: number;
        ordersScanned: number;
        ordersUnresolved: number;
        slug: string;
        unresolved: Array<{ orderId: string; reason: string }>;
      }
    >;
  };
  correctUnprovenPaidOrders: {
    correctUnprovenPaidOrders: FunctionReference<
      "mutation",
      "internal",
      { allowedDeploymentUrl?: string; authorize: boolean; slug?: string },
      {
        alreadyPending: number;
        flipped: number;
        ordersScanned: number;
        skippedWithProof: number;
      }
    >;
    reconcileUnprovenPaidOrdersReport: FunctionReference<
      "query",
      "internal",
      { slug?: string },
      {
        byCanonicalStatus: {
          cancelled: number;
          paid: number;
          pending: number;
          refunded: number;
        };
        eventId?: string;
        ordersScanned: number;
        ordersToFlip: Array<{
          amountDueMinor: number | null;
          buyerName: string | null;
          orderId: string;
        }>;
        slug: string;
      }
    >;
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
  emailBroadcastActions: {
    processBatch: FunctionReference<
      "action",
      "internal",
      { broadcastId: Id<"emailBroadcasts"> },
      any
    >;
  };
  emailBroadcasts: {
    finalizeBroadcast: FunctionReference<
      "mutation",
      "internal",
      { broadcastId: Id<"emailBroadcasts"> },
      any
    >;
    getJob: FunctionReference<
      "query",
      "internal",
      { broadcastId: Id<"emailBroadcasts"> },
      any
    >;
    getPendingRecipients: FunctionReference<
      "query",
      "internal",
      { broadcastId: Id<"emailBroadcasts">; limit: number },
      any
    >;
    markSending: FunctionReference<
      "mutation",
      "internal",
      { broadcastId: Id<"emailBroadcasts">; startedAt: number },
      any
    >;
    recordRecipientFailure: FunctionReference<
      "mutation",
      "internal",
      {
        broadcastId: Id<"emailBroadcasts">;
        error: string;
        recipientId: Id<"emailBroadcastRecipients">;
      },
      any
    >;
    recordRecipientSuccess: FunctionReference<
      "mutation",
      "internal",
      {
        broadcastId: Id<"emailBroadcasts">;
        emailId: string;
        recipientId: Id<"emailBroadcastRecipients">;
        sentAt: number;
      },
      any
    >;
  };
  emailMutations: {
    logSentEmail: FunctionReference<
      "mutation",
      "internal",
      {
        bookingRef: string;
        broadcastId?: Id<"emailBroadcasts">;
        emailId?: string;
        emailType: string;
        eventId?: Id<"events">;
        recipient: string;
      },
      any
    >;
  };
  fixDivineRedesignTicketLabels: {
    default: FunctionReference<
      "mutation",
      "internal",
      { allowedDeploymentUrl?: string; authorize: boolean },
      { ticketsChecked: number; ticketsFixed: number }
    >;
  };
  init: {
    default: FunctionReference<"mutation", "internal", any, any>;
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
  seedPreviewSimulation: {
    default: FunctionReference<
      "mutation",
      "internal",
      {
        allowedDeploymentUrl?: string;
        preview: boolean;
        scope: "tracer" | "full";
        slug?: string;
      },
      {
        alreadySeeded: boolean;
        eventId?: string;
        insertedByTable: Record<string, number>;
        scope: "tracer" | "full";
        slug: string;
      }
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
  };
  verifyDivineRedesignAccommodationMigration: {
    default: FunctionReference<
      "query",
      "internal",
      { slug?: string },
      {
        categories: number;
        config: null | {
          baseCheckInAt: number;
          baseCheckOutAt: number;
          breakfastIncluded: boolean;
          defaultCategoryCode?: string;
          nightCount: number;
        };
        convertedAssignments: number;
        cotResources: number;
        eventId?: string;
        eventOptions: number;
        linkedHotels: number;
        oldHotels: number;
        preferences: number;
        rates: number;
        roomResources: number;
        roomTypes: number;
        rooms: number;
        slots: number;
        slug: string;
        tickets: {
          byLabel: Record<
            string,
            {
              accommodationIncluded: boolean;
              priceMinor: number;
              roomAnchor?: string;
            }
          >;
          count: number;
        };
      }
    >;
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
