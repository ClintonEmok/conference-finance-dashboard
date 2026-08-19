/* eslint-disable */
/**
 * Generated data model types.
 *
 * THIS CODE IS AUTOMATICALLY GENERATED.
 *
 * To regenerate, run `npx convex dev`.
 * @module
 */

import type {
  DocumentByName,
  TableNamesInDataModel,
  SystemTableNames,
  AnyDataModel,
} from "convex/server";
import type { GenericId } from "convex/values";

/**
 * A type describing your Convex data model.
 *
 * This type includes information about what tables you have, the type of
 * documents stored in those tables, and the indexes defined on them.
 *
 * This type is used to parameterize methods like `queryGeneric` and
 * `mutationGeneric` to make them type-safe.
 */

export type DataModel = {
  accommodationCategories: {
    document: {
      code: "standard" | "superior" | "family";
      description?: string;
      label: string;
      sortOrder: number;
      _id: Id<"accommodationCategories">;
      _creationTime: number;
    };
    fieldPaths:
      | "_creationTime"
      | "_id"
      | "code"
      | "description"
      | "label"
      | "sortOrder";
    indexes: {
      by_id: ["_id"];
      by_creation_time: ["_creationTime"];
      by_code: ["code", "_creationTime"];
      by_sortOrder: ["sortOrder", "_creationTime"];
    };
    searchIndexes: {};
    vectorIndexes: {};
  };
  accommodationEventHotels: {
    document: {
      eventId: string;
      hotelId: string;
      _id: Id<"accommodationEventHotels">;
      _creationTime: number;
    };
    fieldPaths: "_creationTime" | "_id" | "eventId" | "hotelId";
    indexes: {
      by_id: ["_id"];
      by_creation_time: ["_creationTime"];
      eventId_hotelId: ["eventId", "hotelId", "_creationTime"];
      hotelId: ["hotelId", "_creationTime"];
    };
    searchIndexes: {};
    vectorIndexes: {};
  };
  accommodationHotels: {
    document: {
      address?: string;
      city?: string;
      name: string;
      notes?: string;
      _id: Id<"accommodationHotels">;
      _creationTime: number;
    };
    fieldPaths: "_creationTime" | "_id" | "address" | "city" | "name" | "notes";
    indexes: {
      by_id: ["_id"];
      by_creation_time: ["_creationTime"];
      name: ["name", "_creationTime"];
    };
    searchIndexes: {};
    vectorIndexes: {};
  };
  accommodationOptions: {
    document: {
      code: string;
      description?: string;
      kind: "addon" | "upgrade" | "eligibility";
      label: string;
      unit: "per_night" | "per_person";
      _id: Id<"accommodationOptions">;
      _creationTime: number;
    };
    fieldPaths:
      | "_creationTime"
      | "_id"
      | "code"
      | "description"
      | "kind"
      | "label"
      | "unit";
    indexes: {
      by_id: ["_id"];
      by_creation_time: ["_creationTime"];
      by_code: ["code", "_creationTime"];
    };
    searchIndexes: {};
    vectorIndexes: {};
  };
  accommodationRooms: {
    document: {
      capacity: number;
      hotelId: string;
      label: string;
      notes?: string;
      occupiedBeds?: number;
      roomTypeId: string;
      _id: Id<"accommodationRooms">;
      _creationTime: number;
    };
    fieldPaths:
      | "_creationTime"
      | "_id"
      | "capacity"
      | "hotelId"
      | "label"
      | "notes"
      | "occupiedBeds"
      | "roomTypeId";
    indexes: {
      by_id: ["_id"];
      by_creation_time: ["_creationTime"];
      hotelId_capacity: ["hotelId", "capacity", "_creationTime"];
      hotelId_label: ["hotelId", "label", "_creationTime"];
      roomTypeId: ["roomTypeId", "_creationTime"];
    };
    searchIndexes: {};
    vectorIndexes: {};
  };
  accommodationRoomTypes: {
    document: {
      categoryId?: Id<"accommodationCategories">;
      count?: number;
      defaultCapacity: number;
      description?: string;
      label: string;
      notes?: string;
      _id: Id<"accommodationRoomTypes">;
      _creationTime: number;
    };
    fieldPaths:
      | "_creationTime"
      | "_id"
      | "categoryId"
      | "count"
      | "defaultCapacity"
      | "description"
      | "label"
      | "notes";
    indexes: {
      by_id: ["_id"];
      by_creation_time: ["_creationTime"];
      by_categoryId: ["categoryId", "_creationTime"];
      label: ["label", "_creationTime"];
    };
    searchIndexes: {};
    vectorIndexes: {};
  };
  accommodationSlots: {
    document: {
      eventId: Id<"events">;
      genderPolicy: "male" | "female" | "mixed";
      hotelId: Id<"accommodationHotels">;
      ineligibilityReason?: string;
      isAssignable: boolean;
      roomId: Id<"accommodationRooms">;
      slotLabel: string;
      updatedAt: number;
      _id: Id<"accommodationSlots">;
      _creationTime: number;
    };
    fieldPaths:
      | "_creationTime"
      | "_id"
      | "eventId"
      | "genderPolicy"
      | "hotelId"
      | "ineligibilityReason"
      | "isAssignable"
      | "roomId"
      | "slotLabel"
      | "updatedAt";
    indexes: {
      by_id: ["_id"];
      by_creation_time: ["_creationTime"];
      by_eventId: ["eventId", "_creationTime"];
      by_eventId_and_isAssignable: ["eventId", "isAssignable", "_creationTime"];
    };
    searchIndexes: {};
    vectorIndexes: {};
  };
  accounts: {
    document: {
      accessToken?: string;
      accessTokenExpiresAt?: number;
      accountId: string;
      idToken?: string;
      password?: string;
      providerId: string;
      refreshToken?: string;
      refreshTokenExpiresAt?: number;
      scope?: string;
      userId: string;
      _id: Id<"accounts">;
      _creationTime: number;
    };
    fieldPaths:
      | "_creationTime"
      | "_id"
      | "accessToken"
      | "accessTokenExpiresAt"
      | "accountId"
      | "idToken"
      | "password"
      | "providerId"
      | "refreshToken"
      | "refreshTokenExpiresAt"
      | "scope"
      | "userId";
    indexes: {
      by_id: ["_id"];
      by_creation_time: ["_creationTime"];
      userId: ["userId", "_creationTime"];
    };
    searchIndexes: {};
    vectorIndexes: {};
  };
  attendeeFamilyGroups: {
    document: {
      label?: string;
      primaryAttendeeId?: string;
      _id: Id<"attendeeFamilyGroups">;
      _creationTime: number;
    };
    fieldPaths: "_creationTime" | "_id" | "label" | "primaryAttendeeId";
    indexes: {
      by_id: ["_id"];
      by_creation_time: ["_creationTime"];
      primaryAttendeeId: ["primaryAttendeeId", "_creationTime"];
    };
    searchIndexes: {};
    vectorIndexes: {};
  };
  attendeeFamilyMembers: {
    document: {
      attendeeId: string;
      familyGroupId: string;
      relationship?: string;
      _id: Id<"attendeeFamilyMembers">;
      _creationTime: number;
    };
    fieldPaths:
      | "_creationTime"
      | "_id"
      | "attendeeId"
      | "familyGroupId"
      | "relationship";
    indexes: {
      by_id: ["_id"];
      by_creation_time: ["_creationTime"];
      attendeeId: ["attendeeId", "_creationTime"];
      familyGroupId: ["familyGroupId", "_creationTime"];
    };
    searchIndexes: {};
    vectorIndexes: {};
  };
  emailBroadcastRecipients: {
    document: {
      attempts: number;
      bookerName?: string;
      bookingRef?: string;
      broadcastId: Id<"emailBroadcasts">;
      emailId?: string;
      error?: string;
      manageBookingUrl?: string;
      orderId: Id<"orders">;
      sentAt?: number;
      status: "pending" | "sent" | "failed";
      to: string;
      _id: Id<"emailBroadcastRecipients">;
      _creationTime: number;
    };
    fieldPaths:
      | "_creationTime"
      | "_id"
      | "attempts"
      | "bookerName"
      | "bookingRef"
      | "broadcastId"
      | "emailId"
      | "error"
      | "manageBookingUrl"
      | "orderId"
      | "sentAt"
      | "status"
      | "to";
    indexes: {
      by_id: ["_id"];
      by_creation_time: ["_creationTime"];
      by_broadcastId: ["broadcastId", "_creationTime"];
      by_broadcastId_and_status: ["broadcastId", "status", "_creationTime"];
    };
    searchIndexes: {};
    vectorIndexes: {};
  };
  emailBroadcasts: {
    document: {
      cancelledAt?: number;
      completedAt?: number;
      createdAt: number;
      createdBy?: string;
      error?: string;
      eventDate: string;
      eventId: Id<"events">;
      eventLocation: string;
      eventName: string;
      failedCount: number;
      filters: any;
      message: string;
      nightBeforeNote?: string;
      paymentUrl?: string;
      pendingCount: number;
      sentCount: number;
      signupUrl: string;
      startedAt?: number;
      status: "queued" | "sending" | "completed" | "failed" | "cancelled";
      title: string;
      totalRecipients: number;
      _id: Id<"emailBroadcasts">;
      _creationTime: number;
    };
    fieldPaths:
      | "_creationTime"
      | "_id"
      | "cancelledAt"
      | "completedAt"
      | "createdAt"
      | "createdBy"
      | "error"
      | "eventDate"
      | "eventId"
      | "eventLocation"
      | "eventName"
      | "failedCount"
      | "filters"
      | "message"
      | "nightBeforeNote"
      | "paymentUrl"
      | "pendingCount"
      | "sentCount"
      | "signupUrl"
      | "startedAt"
      | "status"
      | "title"
      | "totalRecipients";
    indexes: {
      by_id: ["_id"];
      by_creation_time: ["_creationTime"];
      by_eventId: ["eventId", "_creationTime"];
      by_eventId_and_status: ["eventId", "status", "_creationTime"];
    };
    searchIndexes: {};
    vectorIndexes: {};
  };
  eventAccommodationConfig: {
    document: {
      allowExtendedStayAfter: boolean;
      allowExtendedStayBefore: boolean;
      allowExtendedStayBoth: boolean;
      baseCheckInAt: number;
      baseCheckOutAt: number;
      breakfastIncluded: boolean;
      defaultCategoryId?: Id<"accommodationCategories">;
      eventId: Id<"events">;
      nightCount: number;
      updatedAt: number;
      _id: Id<"eventAccommodationConfig">;
      _creationTime: number;
    };
    fieldPaths:
      | "_creationTime"
      | "_id"
      | "allowExtendedStayAfter"
      | "allowExtendedStayBefore"
      | "allowExtendedStayBoth"
      | "baseCheckInAt"
      | "baseCheckOutAt"
      | "breakfastIncluded"
      | "defaultCategoryId"
      | "eventId"
      | "nightCount"
      | "updatedAt";
    indexes: {
      by_id: ["_id"];
      by_creation_time: ["_creationTime"];
      by_eventId: ["eventId", "_creationTime"];
    };
    searchIndexes: {};
    vectorIndexes: {};
  };
  eventAccommodationOptions: {
    document: {
      eligibilityAgeBandCode?: string;
      enabled: boolean;
      eventId: Id<"events">;
      notes?: string;
      optionId: Id<"accommodationOptions">;
      priceMinor: number;
      _id: Id<"eventAccommodationOptions">;
      _creationTime: number;
    };
    fieldPaths:
      | "_creationTime"
      | "_id"
      | "eligibilityAgeBandCode"
      | "enabled"
      | "eventId"
      | "notes"
      | "optionId"
      | "priceMinor";
    indexes: {
      by_id: ["_id"];
      by_creation_time: ["_creationTime"];
      by_eventId: ["eventId", "_creationTime"];
      by_eventId_and_enabled: ["eventId", "enabled", "_creationTime"];
      by_eventId_and_optionId: ["eventId", "optionId", "_creationTime"];
    };
    searchIndexes: {};
    vectorIndexes: {};
  };
  eventAccommodationRates: {
    document: {
      categoryId: Id<"accommodationCategories">;
      eventId: Id<"events">;
      occupancy: "single" | "shared" | "family";
      pricePerPersonMinor: number;
      _id: Id<"eventAccommodationRates">;
      _creationTime: number;
    };
    fieldPaths:
      | "_creationTime"
      | "_id"
      | "categoryId"
      | "eventId"
      | "occupancy"
      | "pricePerPersonMinor";
    indexes: {
      by_id: ["_id"];
      by_creation_time: ["_creationTime"];
      by_eventId: ["eventId", "_creationTime"];
      by_eventId_and_categoryId: ["eventId", "categoryId", "_creationTime"];
      by_eventId_and_categoryId_and_occupancy: [
        "eventId",
        "categoryId",
        "occupancy",
        "_creationTime",
      ];
    };
    searchIndexes: {};
    vectorIndexes: {};
  };
  eventAccommodationResources: {
    document: {
      count: number;
      eventId: Id<"events">;
      kind: "room" | "cot";
      roomTypeId?: Id<"accommodationRoomTypes">;
      _id: Id<"eventAccommodationResources">;
      _creationTime: number;
    };
    fieldPaths:
      | "_creationTime"
      | "_id"
      | "count"
      | "eventId"
      | "kind"
      | "roomTypeId";
    indexes: {
      by_id: ["_id"];
      by_creation_time: ["_creationTime"];
      by_eventId: ["eventId", "_creationTime"];
      by_eventId_and_kind: ["eventId", "kind", "_creationTime"];
      by_eventId_and_kind_and_roomTypeId: [
        "eventId",
        "kind",
        "roomTypeId",
        "_creationTime",
      ];
    };
    searchIndexes: {};
    vectorIndexes: {};
  };
  events: {
    document: {
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
      _id: Id<"events">;
      _creationTime: number;
    };
    fieldPaths:
      | "_creationTime"
      | "_id"
      | "accommodationEnabled"
      | "currency"
      | "defaultRoomTypeId"
      | "endsAt"
      | "isPublished"
      | "isSignupOpen"
      | "primarySourceKind"
      | "primarySourceProvider"
      | "slug"
      | "startsAt"
      | "timezone"
      | "title"
      | "updatedAt";
    indexes: {
      by_id: ["_id"];
      by_creation_time: ["_creationTime"];
      by_signup_visibility: ["isPublished", "isSignupOpen", "_creationTime"];
      by_slug: ["slug", "_creationTime"];
      by_startsAt: ["startsAt", "_creationTime"];
    };
    searchIndexes: {};
    vectorIndexes: {};
  };
  eventSources: {
    document: {
      eventId: Id<"events">;
      externalEventId: string;
      lastSyncedAt?: number;
      provider: string;
      providerSnapshotRef?: string;
      syncStatus: "active" | "paused" | "error";
      updatedAt: number;
      _id: Id<"eventSources">;
      _creationTime: number;
    };
    fieldPaths:
      | "_creationTime"
      | "_id"
      | "eventId"
      | "externalEventId"
      | "lastSyncedAt"
      | "provider"
      | "providerSnapshotRef"
      | "syncStatus"
      | "updatedAt";
    indexes: {
      by_id: ["_id"];
      by_creation_time: ["_creationTime"];
      by_eventId: ["eventId", "_creationTime"];
      by_eventId_and_provider: ["eventId", "provider", "_creationTime"];
      by_provider_and_externalEventId: [
        "provider",
        "externalEventId",
        "_creationTime",
      ];
    };
    searchIndexes: {};
    vectorIndexes: {};
  };
  orderAccommodationEditAudits: {
    document: {
      afterSelectionDigest: string;
      amountDueAfterMinor: number;
      amountDueBeforeMinor: number;
      beforeSelectionDigest: string;
      idempotencyKey: string;
      orderId: Id<"orders">;
      overpaymentDeltaMinor: number;
      ownershipMethod: "email" | "token";
      progressPercent: number;
      remainingMinor: number;
      requestDigest: string;
      totalPaidMinor: number;
      _id: Id<"orderAccommodationEditAudits">;
      _creationTime: number;
    };
    fieldPaths:
      | "_creationTime"
      | "_id"
      | "afterSelectionDigest"
      | "amountDueAfterMinor"
      | "amountDueBeforeMinor"
      | "beforeSelectionDigest"
      | "idempotencyKey"
      | "orderId"
      | "overpaymentDeltaMinor"
      | "ownershipMethod"
      | "progressPercent"
      | "remainingMinor"
      | "requestDigest"
      | "totalPaidMinor";
    indexes: {
      by_id: ["_id"];
      by_creation_time: ["_creationTime"];
      by_orderId_and_idempotencyKey: [
        "orderId",
        "idempotencyKey",
        "_creationTime",
      ];
      by_orderId_and_requestDigest: [
        "orderId",
        "requestDigest",
        "_creationTime",
      ];
    };
    searchIndexes: {};
    vectorIndexes: {};
  };
  orderAccommodationOptionSelections: {
    document: {
      attendeeId: Id<"orderAttendees">;
      nights: number;
      optionKey: string;
      orderId: Id<"orders">;
      quantity: number;
      selectionId: Id<"orderAccommodationSelections">;
      sortOrder: number;
      _id: Id<"orderAccommodationOptionSelections">;
      _creationTime: number;
    };
    fieldPaths:
      | "_creationTime"
      | "_id"
      | "attendeeId"
      | "nights"
      | "optionKey"
      | "orderId"
      | "quantity"
      | "selectionId"
      | "sortOrder";
    indexes: {
      by_id: ["_id"];
      by_creation_time: ["_creationTime"];
      by_orderId: ["orderId", "_creationTime"];
      by_orderId_and_attendeeId: ["orderId", "attendeeId", "_creationTime"];
      by_selectionId: ["selectionId", "_creationTime"];
    };
    searchIndexes: {};
    vectorIndexes: {};
  };
  orderAccommodationSelections: {
    document: {
      ageBandCode?: string;
      attendeeId: Id<"orderAttendees">;
      categoryId?: Id<"accommodationCategories">;
      checkInAt?: number;
      checkOutAt?: number;
      configVersion?: number;
      confirmedAt?: number;
      cotSelected?: boolean;
      nightBeforeLevel?: "standard" | "superior";
      nightBeforeOccupancy?: "single" | "shared";
      nightCount?: number;
      occupancy?: "single" | "shared" | "family";
      orderId: Id<"orders">;
      priceSnapshot?: {
        baseRatePerNightMinor: number;
        categoryIsSuperior?: boolean;
        cotSelected?: boolean;
        coveredNights: number;
        nightBeforeNights?: number;
        nightBeforeRatePerNightMinor?: number;
        optionLines?: Array<{
          chargeMinor: number;
          label: string;
          nights: number;
          optionKey: string;
          pricePerUnitMinor: number;
          quantity: number;
        }>;
        totalNights: number;
        upgradeSelected?: boolean;
      };
      upgradeSelected?: boolean;
      _id: Id<"orderAccommodationSelections">;
      _creationTime: number;
    };
    fieldPaths:
      | "_creationTime"
      | "_id"
      | "ageBandCode"
      | "attendeeId"
      | "categoryId"
      | "checkInAt"
      | "checkOutAt"
      | "configVersion"
      | "confirmedAt"
      | "cotSelected"
      | "nightBeforeLevel"
      | "nightBeforeOccupancy"
      | "nightCount"
      | "occupancy"
      | "orderId"
      | "priceSnapshot"
      | "priceSnapshot.baseRatePerNightMinor"
      | "priceSnapshot.categoryIsSuperior"
      | "priceSnapshot.cotSelected"
      | "priceSnapshot.coveredNights"
      | "priceSnapshot.nightBeforeNights"
      | "priceSnapshot.nightBeforeRatePerNightMinor"
      | "priceSnapshot.optionLines"
      | "priceSnapshot.totalNights"
      | "priceSnapshot.upgradeSelected"
      | "upgradeSelected";
    indexes: {
      by_id: ["_id"];
      by_creation_time: ["_creationTime"];
      by_attendeeId: ["attendeeId", "_creationTime"];
      by_orderId: ["orderId", "_creationTime"];
      by_orderId_and_attendeeId: ["orderId", "attendeeId", "_creationTime"];
    };
    searchIndexes: {};
    vectorIndexes: {};
  };
  orderAssignments: {
    document: {
      assignmentIntent: "assign" | "skip";
      attendeeId: Id<"orderAttendees">;
      confirmedAt?: number;
      confirmedBy?: string;
      orderId: Id<"orders">;
      slotId: Id<"accommodationSlots">;
      sortOrder: number;
      status?: "pending" | "confirmed" | "declined" | "converted";
      _id: Id<"orderAssignments">;
      _creationTime: number;
    };
    fieldPaths:
      | "_creationTime"
      | "_id"
      | "assignmentIntent"
      | "attendeeId"
      | "confirmedAt"
      | "confirmedBy"
      | "orderId"
      | "slotId"
      | "sortOrder"
      | "status";
    indexes: {
      by_id: ["_id"];
      by_creation_time: ["_creationTime"];
      by_attendeeId: ["attendeeId", "_creationTime"];
      by_orderId: ["orderId", "_creationTime"];
      by_slotId: ["slotId", "_creationTime"];
      by_status: ["status", "_creationTime"];
    };
    searchIndexes: {};
    vectorIndexes: {};
  };
  orderAttendees: {
    document: {
      allocatedRoomTypeId?: Id<"accommodationRoomTypes">;
      allocationPriority?: "CRITICAL" | "HIGH" | "NORMAL" | "LOW";
      assignedRoomId?: string;
      attendeeKey: string;
      dietaryRestrictions?: string;
      email?: string;
      gender: "male" | "female" | "mixed" | "unknown";
      location?: string;
      name: string;
      orderId: Id<"orders">;
      phone?: string;
      priorityReason?: string;
      roommateAvoid?: string;
      roommatePreference?: string;
      sortOrder: number;
      _id: Id<"orderAttendees">;
      _creationTime: number;
    };
    fieldPaths:
      | "_creationTime"
      | "_id"
      | "allocatedRoomTypeId"
      | "allocationPriority"
      | "assignedRoomId"
      | "attendeeKey"
      | "dietaryRestrictions"
      | "email"
      | "gender"
      | "location"
      | "name"
      | "orderId"
      | "phone"
      | "priorityReason"
      | "roommateAvoid"
      | "roommatePreference"
      | "sortOrder";
    indexes: {
      by_id: ["_id"];
      by_creation_time: ["_creationTime"];
      by_allocationPriority: ["allocationPriority", "_creationTime"];
      by_assignedRoomId: ["assignedRoomId", "_creationTime"];
      by_orderId: ["orderId", "_creationTime"];
    };
    searchIndexes: {};
    vectorIndexes: {};
  };
  orderIdempotency: {
    document: {
      eventId: Id<"events">;
      expiresAt: number;
      fingerprint: string;
      idempotencyKey: string;
      orderId: Id<"orders">;
      _id: Id<"orderIdempotency">;
      _creationTime: number;
    };
    fieldPaths:
      | "_creationTime"
      | "_id"
      | "eventId"
      | "expiresAt"
      | "fingerprint"
      | "idempotencyKey"
      | "orderId";
    indexes: {
      by_id: ["_id"];
      by_creation_time: ["_creationTime"];
      by_eventId_and_fingerprint: ["eventId", "fingerprint", "_creationTime"];
      by_eventId_and_idempotencyKey: [
        "eventId",
        "idempotencyKey",
        "_creationTime",
      ];
      by_expiresAt: ["expiresAt", "_creationTime"];
    };
    searchIndexes: {};
    vectorIndexes: {};
  };
  orders: {
    document: {
      bookerEmail?: string;
      bookerName?: string;
      bookerPhone?: string;
      bookingRef?: string;
      currency?: string;
      eventId?: Id<"events">;
      honeypotSeen?: boolean;
      idempotencyKey?: string;
      notes?: string;
      orderedAt?: number;
      providerEventId?: string;
      providerOrderId?: string;
      source?: "integration" | "internal";
      status?: "paid" | "refunded" | "cancelled" | "pending";
      submittedAt?: number;
      totalAmountMinor?: number;
      _id: Id<"orders">;
      _creationTime: number;
    };
    fieldPaths:
      | "_creationTime"
      | "_id"
      | "bookerEmail"
      | "bookerName"
      | "bookerPhone"
      | "bookingRef"
      | "currency"
      | "eventId"
      | "honeypotSeen"
      | "idempotencyKey"
      | "notes"
      | "orderedAt"
      | "providerEventId"
      | "providerOrderId"
      | "source"
      | "status"
      | "submittedAt"
      | "totalAmountMinor";
    indexes: {
      by_id: ["_id"];
      by_creation_time: ["_creationTime"];
      by_bookingRef: ["bookingRef", "_creationTime"];
      by_email: ["bookerEmail", "_creationTime"];
      by_eventId: ["eventId", "_creationTime"];
      by_providerEventId: ["providerEventId", "_creationTime"];
      by_providerOrderId: ["providerOrderId", "_creationTime"];
      by_status: ["status", "_creationTime"];
      by_submittedAt: ["submittedAt", "_creationTime"];
    };
    searchIndexes: {};
    vectorIndexes: {};
  };
  orderTicketSelections: {
    document: {
      attendeeId: Id<"orderAttendees">;
      orderId: Id<"orders">;
      quantity: number;
      sortOrder: number;
      ticketTypeId: Id<"ticketTypes">;
      _id: Id<"orderTicketSelections">;
      _creationTime: number;
    };
    fieldPaths:
      | "_creationTime"
      | "_id"
      | "attendeeId"
      | "orderId"
      | "quantity"
      | "sortOrder"
      | "ticketTypeId";
    indexes: {
      by_id: ["_id"];
      by_creation_time: ["_creationTime"];
      by_orderId: ["orderId", "_creationTime"];
      by_ticketTypeId: ["ticketTypeId", "_creationTime"];
    };
    searchIndexes: {};
    vectorIndexes: {};
  };
  payments: {
    document: {
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
      _id: Id<"payments">;
      _creationTime: number;
    };
    fieldPaths:
      | "_creationTime"
      | "_id"
      | "amountMinor"
      | "donationKind"
      | "eventId"
      | "matchedAt"
      | "matchedBy"
      | "notes"
      | "orderId"
      | "paidAt"
      | "payerAccountNumber"
      | "payerName"
      | "providerPayload"
      | "reference"
      | "source"
      | "sourceId"
      | "status";
    indexes: {
      by_id: ["_id"];
      by_creation_time: ["_creationTime"];
      by_donationKind_and_eventId_and_paidAt: [
        "donationKind",
        "eventId",
        "paidAt",
        "_creationTime",
      ];
      by_donationKind_and_paidAt: ["donationKind", "paidAt", "_creationTime"];
      by_eventId_and_status_and_source: [
        "eventId",
        "status",
        "source",
        "_creationTime",
      ];
      eventId: ["eventId", "_creationTime"];
      orderId: ["orderId", "_creationTime"];
      paidAt: ["paidAt", "_creationTime"];
      source_sourceId: ["source", "sourceId", "_creationTime"];
      status: ["status", "_creationTime"];
    };
    searchIndexes: {};
    vectorIndexes: {};
  };
  reportShares: {
    document: {
      createdAt: number;
      createdByUserId?: string;
      eventId: Id<"events">;
      region?: string;
      revokedAt?: number;
      token: string;
      _id: Id<"reportShares">;
      _creationTime: number;
    };
    fieldPaths:
      | "_creationTime"
      | "_id"
      | "createdAt"
      | "createdByUserId"
      | "eventId"
      | "region"
      | "revokedAt"
      | "token";
    indexes: {
      by_id: ["_id"];
      by_creation_time: ["_creationTime"];
      by_eventId: ["eventId", "_creationTime"];
      token: ["token", "_creationTime"];
    };
    searchIndexes: {};
    vectorIndexes: {};
  };
  roomAllocations: {
    document: {
      eventId: string;
      notes?: string;
      roomId: string;
      status?: "proposed" | "confirmed" | "rejected";
      _id: Id<"roomAllocations">;
      _creationTime: number;
    };
    fieldPaths:
      | "_creationTime"
      | "_id"
      | "eventId"
      | "notes"
      | "roomId"
      | "status";
    indexes: {
      by_id: ["_id"];
      by_creation_time: ["_creationTime"];
      eventId_roomId: ["eventId", "roomId", "_creationTime"];
      eventId_status: ["eventId", "status", "_creationTime"];
    };
    searchIndexes: {};
    vectorIndexes: {};
  };
  sentEmails: {
    document: {
      bookingRef: string;
      broadcastId?: Id<"emailBroadcasts">;
      emailId?: string;
      emailType: string;
      eventId?: Id<"events">;
      recipient: string;
      sentAt: number;
      _id: Id<"sentEmails">;
      _creationTime: number;
    };
    fieldPaths:
      | "_creationTime"
      | "_id"
      | "bookingRef"
      | "broadcastId"
      | "emailId"
      | "emailType"
      | "eventId"
      | "recipient"
      | "sentAt";
    indexes: {
      by_id: ["_id"];
      by_creation_time: ["_creationTime"];
      by_bookingRef: ["bookingRef", "_creationTime"];
      by_broadcastId: ["broadcastId", "_creationTime"];
      by_eventId: ["eventId", "_creationTime"];
    };
    searchIndexes: {};
    vectorIndexes: {};
  };
  sessions: {
    document: {
      expiresAt: number;
      ipAddress?: string;
      token: string;
      userAgent?: string;
      userId: string;
      _id: Id<"sessions">;
      _creationTime: number;
    };
    fieldPaths:
      | "_creationTime"
      | "_id"
      | "expiresAt"
      | "ipAddress"
      | "token"
      | "userAgent"
      | "userId";
    indexes: {
      by_id: ["_id"];
      by_creation_time: ["_creationTime"];
      token: ["token", "_creationTime"];
      userId: ["userId", "_creationTime"];
    };
    searchIndexes: {};
    vectorIndexes: {};
  };
  ticketTailorAttendees: {
    document: {
      ageGroup?: string;
      allocationPriority?: "CRITICAL" | "HIGH" | "NORMAL" | "LOW";
      assignedRoomId?: string;
      attendeeId?: Id<"orderAttendees">;
      checkedInAt?: number;
      customAnswers?: any;
      dietaryRestrictions?: string;
      email?: string;
      genderType?: "MALE" | "FEMALE" | "MIXED" | "UNKNOWN";
      location?: string;
      name?: string;
      orderId: Id<"orders">;
      phone?: string;
      priorityReason?: string;
      providerAttendeeId?: string;
      providerEventId: string;
      providerIssuedTicketId?: string;
      providerOrderId: string;
      providerTicketTypeId?: string;
      rawPayload: any;
      roommateAvoid?: string;
      roommatePreference?: string;
      ticketCategory?: string;
      ticketStatus?: string;
      ticketTypeLabel?: string;
      tikkieAmountOverrideMinor?: number;
      _id: Id<"ticketTailorAttendees">;
      _creationTime: number;
    };
    fieldPaths:
      | "_creationTime"
      | "_id"
      | "ageGroup"
      | "allocationPriority"
      | "assignedRoomId"
      | "attendeeId"
      | "checkedInAt"
      | "customAnswers"
      | "dietaryRestrictions"
      | "email"
      | "genderType"
      | "location"
      | "name"
      | "orderId"
      | "phone"
      | "priorityReason"
      | "providerAttendeeId"
      | "providerEventId"
      | "providerIssuedTicketId"
      | "providerOrderId"
      | "providerTicketTypeId"
      | "rawPayload"
      | "roommateAvoid"
      | "roommatePreference"
      | "ticketCategory"
      | "ticketStatus"
      | "ticketTypeLabel"
      | "tikkieAmountOverrideMinor";
    indexes: {
      by_id: ["_id"];
      by_creation_time: ["_creationTime"];
      attendeeId: ["attendeeId", "_creationTime"];
      by_assignedRoomId: ["assignedRoomId", "_creationTime"];
      by_email: ["email", "_creationTime"];
      genderType: ["genderType", "_creationTime"];
      orderId: ["orderId", "_creationTime"];
      providerAttendeeId: ["providerAttendeeId", "_creationTime"];
      providerEventOrder: [
        "providerEventId",
        "providerOrderId",
        "_creationTime",
      ];
      providerIssuedTicketId: ["providerIssuedTicketId", "_creationTime"];
    };
    searchIndexes: {};
    vectorIndexes: {};
  };
  ticketTailorEvents: {
    document: {
      currency?: string;
      endsAt?: number;
      name?: string;
      providerEventId: string;
      rawPayload: any;
      startsAt?: number;
      timezone?: string;
      _id: Id<"ticketTailorEvents">;
      _creationTime: number;
    };
    fieldPaths:
      | "_creationTime"
      | "_id"
      | "currency"
      | "endsAt"
      | "name"
      | "providerEventId"
      | "rawPayload"
      | "startsAt"
      | "timezone";
    indexes: {
      by_id: ["_id"];
      by_creation_time: ["_creationTime"];
      providerEventId: ["providerEventId", "_creationTime"];
      startsAt: ["startsAt", "_creationTime"];
    };
    searchIndexes: {};
    vectorIndexes: {};
  };
  ticketTailorOrders: {
    document: {
      archiveReason?: string;
      archivedAt?: number;
      cancelledAt?: number;
      isArchived?: boolean;
      normalizationNote?: string;
      normalizedStatus?: "paid" | "refunded" | "cancelled" | "pending";
      orderId: Id<"orders">;
      providerEventId: string;
      providerOrderId: string;
      providerStatus?: string;
      rawPayload: any;
      refundedAt?: number;
      removedAt?: number;
      removedReason?: string;
      _id: Id<"ticketTailorOrders">;
      _creationTime: number;
    };
    fieldPaths:
      | "_creationTime"
      | "_id"
      | "archivedAt"
      | "archiveReason"
      | "cancelledAt"
      | "isArchived"
      | "normalizationNote"
      | "normalizedStatus"
      | "orderId"
      | "providerEventId"
      | "providerOrderId"
      | "providerStatus"
      | "rawPayload"
      | "refundedAt"
      | "removedAt"
      | "removedReason";
    indexes: {
      by_id: ["_id"];
      by_creation_time: ["_creationTime"];
      normalizedStatus: ["normalizedStatus", "_creationTime"];
      orderId: ["orderId", "_creationTime"];
      providerEventId: ["providerEventId", "_creationTime"];
      providerOrderId: ["providerOrderId", "_creationTime"];
    };
    searchIndexes: {};
    vectorIndexes: {};
  };
  ticketTailorSyncRuns: {
    document: {
      diagnostics?: any;
      errorSummary?: string;
      eventsScanned?: number;
      failedItems?: number;
      finishedAt?: number;
      normalizedFallbackCount?: number;
      ordersArchived?: number;
      ordersFetched?: number;
      ordersUpserted?: number;
      startedAt?: number;
      status?: "running" | "success" | "partial" | "failed";
      _id: Id<"ticketTailorSyncRuns">;
      _creationTime: number;
    };
    fieldPaths:
      | "_creationTime"
      | "_id"
      | "diagnostics"
      | "errorSummary"
      | "eventsScanned"
      | "failedItems"
      | "finishedAt"
      | "normalizedFallbackCount"
      | "ordersArchived"
      | "ordersFetched"
      | "ordersUpserted"
      | "startedAt"
      | "status";
    indexes: {
      by_id: ["_id"];
      by_creation_time: ["_creationTime"];
      startedAt: ["startedAt", "_creationTime"];
    };
    searchIndexes: {};
    vectorIndexes: {};
  };
  ticketTailorWebhookEvents: {
    document: {
      attempts?: number;
      canonicalFetchedAt?: number;
      canonicalPayload?: any;
      deliveryCount?: number;
      eventType: string;
      lastError?: string;
      lastReceivedAt?: number;
      nextRetryAt?: number;
      payload: any;
      processedAt?: number;
      providerEventId: string;
      receivedAt?: number;
      status?: "pending" | "processed" | "failed";
      _id: Id<"ticketTailorWebhookEvents">;
      _creationTime: number;
    };
    fieldPaths:
      | "_creationTime"
      | "_id"
      | "attempts"
      | "canonicalFetchedAt"
      | "canonicalPayload"
      | "deliveryCount"
      | "eventType"
      | "lastError"
      | "lastReceivedAt"
      | "nextRetryAt"
      | "payload"
      | "processedAt"
      | "providerEventId"
      | "receivedAt"
      | "status";
    indexes: {
      by_id: ["_id"];
      by_creation_time: ["_creationTime"];
      eventType: ["eventType", "_creationTime"];
      providerEventId: ["providerEventId", "_creationTime"];
      status_nextRetry: ["status", "nextRetryAt", "_creationTime"];
    };
    searchIndexes: {};
    vectorIndexes: {};
  };
  ticketTypes: {
    document: {
      accommodationIncluded?: boolean;
      availabilityState: "selectable" | "unavailable";
      eventId: Id<"events">;
      isActive: boolean;
      label: string;
      maxQuantity?: number;
      priceMinor: number;
      roomTypeId?: Id<"accommodationRoomTypes">;
      soldCount?: number;
      sortOrder?: number;
      unavailableReason?: string;
      updatedAt: number;
      visibility: "public" | "hidden";
      _id: Id<"ticketTypes">;
      _creationTime: number;
    };
    fieldPaths:
      | "_creationTime"
      | "_id"
      | "accommodationIncluded"
      | "availabilityState"
      | "eventId"
      | "isActive"
      | "label"
      | "maxQuantity"
      | "priceMinor"
      | "roomTypeId"
      | "soldCount"
      | "sortOrder"
      | "unavailableReason"
      | "updatedAt"
      | "visibility";
    indexes: {
      by_id: ["_id"];
      by_creation_time: ["_creationTime"];
      by_eventId: ["eventId", "_creationTime"];
      by_eventId_and_availabilityState: [
        "eventId",
        "availabilityState",
        "_creationTime",
      ];
    };
    searchIndexes: {};
    vectorIndexes: {};
  };
  tikkiePaymentLinks: {
    document: {
      amountMinor: number;
      description: string;
      eventId?: string;
      expiryDate: number;
      linkType?: "event" | "order";
      orderId?: string;
      paymentRequestToken: string;
      paymentRequestUrl: string;
      providerEventId: string;
      providerLastCheckedAt?: number;
      providerOrderId: string;
      providerPayload?: any;
      providerStatus: string;
      referenceId?: string;
      status?: "created" | "paid" | "expired";
      statusSource?: "create" | "webhook" | "poll";
      statusUpdatedAt?: number;
      _id: Id<"tikkiePaymentLinks">;
      _creationTime: number;
    };
    fieldPaths:
      | "_creationTime"
      | "_id"
      | "amountMinor"
      | "description"
      | "eventId"
      | "expiryDate"
      | "linkType"
      | "orderId"
      | "paymentRequestToken"
      | "paymentRequestUrl"
      | "providerEventId"
      | "providerLastCheckedAt"
      | "providerOrderId"
      | "providerPayload"
      | "providerStatus"
      | "referenceId"
      | "status"
      | "statusSource"
      | "statusUpdatedAt";
    indexes: {
      by_id: ["_id"];
      by_creation_time: ["_creationTime"];
      eventId: ["eventId", "_creationTime"];
      eventId_linkType: ["eventId", "linkType", "_creationTime"];
      linkType: ["linkType", "_creationTime"];
      orderId: ["orderId", "_creationTime"];
      paymentRequestToken: ["paymentRequestToken", "_creationTime"];
      providerOrderEvent: [
        "providerOrderId",
        "providerEventId",
        "_creationTime",
      ];
      status_updated: ["status", "statusUpdatedAt", "_creationTime"];
    };
    searchIndexes: {};
    vectorIndexes: {};
  };
  tikkiePaymentLinkTransitions: {
    document: {
      fromStatus: "created" | "paid" | "expired";
      paymentLinkId: string;
      providerNotificationKey?: string;
      providerPayload?: any;
      providerStatus: string;
      reason?: string;
      source: "create" | "webhook" | "poll";
      toStatus: "created" | "paid" | "expired";
      _id: Id<"tikkiePaymentLinkTransitions">;
      _creationTime: number;
    };
    fieldPaths:
      | "_creationTime"
      | "_id"
      | "fromStatus"
      | "paymentLinkId"
      | "providerNotificationKey"
      | "providerPayload"
      | "providerStatus"
      | "reason"
      | "source"
      | "toStatus";
    indexes: {
      by_id: ["_id"];
      by_creation_time: ["_creationTime"];
      paymentLinkId: ["paymentLinkId", "_creationTime"];
      providerNotificationKey: ["providerNotificationKey", "_creationTime"];
    };
    searchIndexes: {};
    vectorIndexes: {};
  };
  tikkiePayments: {
    document: {
      amountMinor: number;
      description?: string;
      matchStatus: "unmatched" | "auto_matched" | "manual";
      matchedAt?: number;
      orderId?: string;
      paidAt: number;
      payerAccountNumber?: string;
      payerName: string;
      paymentLinkId: string;
      paymentRequestToken: string;
      paymentToken: string;
      providerPayload?: any;
      _id: Id<"tikkiePayments">;
      _creationTime: number;
    };
    fieldPaths:
      | "_creationTime"
      | "_id"
      | "amountMinor"
      | "description"
      | "matchedAt"
      | "matchStatus"
      | "orderId"
      | "paidAt"
      | "payerAccountNumber"
      | "payerName"
      | "paymentLinkId"
      | "paymentRequestToken"
      | "paymentToken"
      | "providerPayload";
    indexes: {
      by_id: ["_id"];
      by_creation_time: ["_creationTime"];
      matchStatus: ["matchStatus", "_creationTime"];
      orderId: ["orderId", "_creationTime"];
      paymentLinkId: ["paymentLinkId", "_creationTime"];
      paymentRequestToken: ["paymentRequestToken", "_creationTime"];
      paymentToken: ["paymentToken", "_creationTime"];
    };
    searchIndexes: {};
    vectorIndexes: {};
  };
  tikkiePaymentTemplates: {
    document: {
      amountMinor: number;
      descriptionTemplate: string;
      eventId: string;
      expiryDays?: number;
      isActive?: boolean;
      ticketTypeLabel: string;
      _id: Id<"tikkiePaymentTemplates">;
      _creationTime: number;
    };
    fieldPaths:
      | "_creationTime"
      | "_id"
      | "amountMinor"
      | "descriptionTemplate"
      | "eventId"
      | "expiryDays"
      | "isActive"
      | "ticketTypeLabel";
    indexes: {
      by_id: ["_id"];
      by_creation_time: ["_creationTime"];
      eventId: ["eventId", "_creationTime"];
      eventId_ticketType: ["eventId", "ticketTypeLabel", "_creationTime"];
    };
    searchIndexes: {};
    vectorIndexes: {};
  };
  users: {
    document: {
      email: string;
      emailVerified: boolean;
      image?: string;
      name: string;
      _id: Id<"users">;
      _creationTime: number;
    };
    fieldPaths:
      | "_creationTime"
      | "_id"
      | "email"
      | "emailVerified"
      | "image"
      | "name";
    indexes: {
      by_id: ["_id"];
      by_creation_time: ["_creationTime"];
      email: ["email", "_creationTime"];
    };
    searchIndexes: {};
    vectorIndexes: {};
  };
  verifications: {
    document: {
      expiresAt: number;
      identifier: string;
      value: string;
      _id: Id<"verifications">;
      _creationTime: number;
    };
    fieldPaths: "_creationTime" | "_id" | "expiresAt" | "identifier" | "value";
    indexes: {
      by_id: ["_id"];
      by_creation_time: ["_creationTime"];
      identifier: ["identifier", "_creationTime"];
    };
    searchIndexes: {};
    vectorIndexes: {};
  };
};

/**
 * The names of all of your Convex tables.
 */
export type TableNames = TableNamesInDataModel<DataModel>;

/**
 * The type of a document stored in Convex.
 *
 * @typeParam TableName - A string literal type of the table name (like "users").
 */
export type Doc<TableName extends TableNames> = DocumentByName<
  DataModel,
  TableName
>;

/**
 * An identifier for a document in Convex.
 *
 * Convex documents are uniquely identified by their `Id`, which is accessible
 * on the `_id` field. To learn more, see [Document IDs](https://docs.convex.dev/using/document-ids).
 *
 * Documents can be loaded using `db.get(tableName, id)` in query and mutation functions.
 *
 * IDs are just strings at runtime, but this type can be used to distinguish them from other
 * strings when type checking.
 *
 * @typeParam TableName - A string literal type of the table name (like "users").
 */
export type Id<TableName extends TableNames | SystemTableNames> =
  GenericId<TableName>;
