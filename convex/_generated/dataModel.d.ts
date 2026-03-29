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
      city?: string;
      name: string;
      notes?: string;
      _id: Id<"accommodationHotels">;
      _creationTime: number;
    };
    fieldPaths: "_creationTime" | "_id" | "city" | "name" | "notes";
    indexes: {
      by_id: ["_id"];
      by_creation_time: ["_creationTime"];
      name: ["name", "_creationTime"];
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
      defaultCapacity: number;
      label: string;
      notes?: string;
      _id: Id<"accommodationRoomTypes">;
      _creationTime: number;
    };
    fieldPaths: "_creationTime" | "_id" | "defaultCapacity" | "label" | "notes";
    indexes: {
      by_id: ["_id"];
      by_creation_time: ["_creationTime"];
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
  events: {
    document: {
      accommodationEnabled: boolean;
      currency: string;
      endsAt: number;
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
  payments: {
    document: {
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
      _id: Id<"payments">;
      _creationTime: number;
    };
    fieldPaths:
      | "_creationTime"
      | "_id"
      | "amountMinor"
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
      orderId: ["orderId", "_creationTime"];
      paidAt: ["paidAt", "_creationTime"];
      source_sourceId: ["source", "sourceId", "_creationTime"];
      status: ["status", "_creationTime"];
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
      checkedInAt?: number;
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
      | "checkedInAt"
      | "customAnswers"
      | "email"
      | "eventId"
      | "genderType"
      | "name"
      | "orderId"
      | "priorityReason"
      | "providerAttendeeId"
      | "providerEventId"
      | "providerIssuedTicketId"
      | "providerOrderId"
      | "providerTicketTypeId"
      | "rawPayload"
      | "ticketCategory"
      | "ticketStatus"
      | "ticketTypeLabel"
      | "tikkieAmountOverrideMinor";
    indexes: {
      by_id: ["_id"];
      by_creation_time: ["_creationTime"];
      allocationPriority: ["allocationPriority", "_creationTime"];
      assignedRoomId: ["assignedRoomId", "_creationTime"];
      email: ["email", "_creationTime"];
      eventId: ["eventId", "_creationTime"];
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
      buyerEmail?: string;
      buyerName?: string;
      cancelledAt?: number;
      currency?: string;
      eventId: string;
      isArchived?: boolean;
      normalizationNote?: string;
      normalizedStatus?: "paid" | "refunded" | "cancelled" | "pending";
      orderedAt?: number;
      providerEventId: string;
      providerOrderId: string;
      providerStatus?: string;
      rawPayload: any;
      refundedAt?: number;
      removedAt?: number;
      removedReason?: string;
      totalAmountMinor?: number;
      _id: Id<"ticketTailorOrders">;
      _creationTime: number;
    };
    fieldPaths:
      | "_creationTime"
      | "_id"
      | "archivedAt"
      | "archiveReason"
      | "buyerEmail"
      | "buyerName"
      | "cancelledAt"
      | "currency"
      | "eventId"
      | "isArchived"
      | "normalizationNote"
      | "normalizedStatus"
      | "orderedAt"
      | "providerEventId"
      | "providerOrderId"
      | "providerStatus"
      | "rawPayload"
      | "refundedAt"
      | "removedAt"
      | "removedReason"
      | "totalAmountMinor";
    indexes: {
      by_id: ["_id"];
      by_creation_time: ["_creationTime"];
      eventId: ["eventId", "_creationTime"];
      normalizedStatus: ["normalizedStatus", "_creationTime"];
      orderedAt: ["orderedAt", "_creationTime"];
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
      availabilityState: "selectable" | "unavailable";
      eventId: Id<"events">;
      isActive: boolean;
      label: string;
      priceMinor: number;
      unavailableReason?: string;
      updatedAt: number;
      visibility: "public" | "hidden";
      _id: Id<"ticketTypes">;
      _creationTime: number;
    };
    fieldPaths:
      | "_creationTime"
      | "_id"
      | "availabilityState"
      | "eventId"
      | "isActive"
      | "label"
      | "priceMinor"
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
