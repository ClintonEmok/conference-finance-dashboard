import { auth } from "@clerk/nextjs/server"
import { fetchMutation, fetchQuery } from "convex/nextjs"
import type {
  FunctionArgs,
  FunctionReference,
  FunctionReturnType,
} from "convex/server"

import { api } from "@/lib/convex/api"

const CONVEX_URL = process.env.NEXT_PUBLIC_CONVEX_URL

if (!CONVEX_URL) {
  throw new Error("NEXT_PUBLIC_CONVEX_URL is not set")
}

export const convexServer = {
  url: CONVEX_URL,
}

type PublicQueryRef = FunctionReference<"query", "public">
type PublicMutationRef = FunctionReference<"mutation", "public">

const legacyQueryRefs: Record<string, PublicQueryRef> = {
  "accommodation/getEventByProviderId": api.accommodation.getEventByProviderId,
  "accommodation/getHotelById": api.accommodation.getHotelById,
  "accommodation/getHotels": api.accommodation.getHotels,
  "accommodation/getRoomById": api.accommodation.getRoomById,
  "accommodation/getRoomTypeById": api.accommodation.getRoomTypeById,
  "accommodation/getRoomTypes": api.accommodation.getRoomTypes,
  "accommodation/getRooms": api.accommodation.getRooms,
  "accommodation/listAccommodationInventory":
    api.accommodation.listAccommodationInventory,
  "attendees/getAttendeeByStringId": api.attendees.getAttendeeByStringId,
  "attendees/getAttendees": api.attendees.getAttendees,
  "events/getEvents": api.events.getEvents,
  "events/getEventsForLedger": api.events.getEventsForLedger,
  "orders/getOrderByProviderId": api.orders.getOrderByProviderId,
  "orders/getOrderCount": api.orders.getOrderCount,
  "orders/getOrderLedger": api.orders.getOrderLedger,
  "orders/getOrderPaymentStatus": api.orders.getOrderPaymentStatus,
  "orders/getOrders": api.orders.getOrders,
  "orders/getOrdersForReconciliation": api.orders.getOrdersForReconciliation,
  "orders/getOrdersWithFilters": api.orders.getOrdersWithFilters,
  "orders/getOrderWithAttendeesByProviderId":
    api.orders.getOrderWithAttendeesByProviderId,
  "orders/searchOrders": api.orders.searchOrders,
  "payments/getPaymentById": api.payments.getPaymentById,
  "payments/getPayments": api.payments.getPayments,
  "payments/getUnassignedPayments": api.payments.getUnassignedPayments,
  "sync/getAttendeeFamilyGroupByPrimaryId":
    api.sync.getAttendeeFamilyGroupByPrimaryId,
  "sync/getFamilyMembersByGroupId": api.sync.getFamilyMembersByGroupId,
  "sync/getPendingWebhookEvents": api.sync.getPendingWebhookEvents,
  "sync/getSyncRunById": api.sync.getSyncRunById,
  "sync/getSyncRuns": api.sync.getSyncRuns,
  "sync/getTicketTailorAttendeesByOrderId":
    api.sync.getTicketTailorAttendeesByOrderId,
  "sync/getTicketTailorEventByProviderId":
    api.sync.getTicketTailorEventByProviderId,
  "sync/getTicketTailorOrderByProviderId":
    api.sync.getTicketTailorOrderByProviderId,
  "sync/getWebhookEventById": api.sync.getWebhookEventById,
  "sync/getWebhookEventByProviderId": api.sync.getWebhookEventByProviderId,
  "sync/getWebhookEvents": api.sync.getWebhookEvents,
  "tickettailor/getEventById": api.events.getEventById,
  "tikkie/getPaymentLinkById": api.tikkie.getPaymentLinkById,
  "tikkie/getPaymentLinkByToken": api.tikkie.getPaymentLinkByToken,
  "tikkie/getPaymentLinks": api.tikkie.getPaymentLinks,
  "tikkie/getPaymentLinksByOrderId": api.tikkie.getPaymentLinksByOrderId,
  "tikkie/getPaymentTemplates": api.tikkie.getPaymentTemplates,
  "tikkie/getTemplateByEventAndTicketType":
    api.tikkie.getTemplateByEventAndTicketType,
}

const legacyMutationRefs: Record<string, PublicMutationRef> = {
  "accommodation/assignAttendeeToRoom": api.accommodation.assignAttendeeToRoom,
  "accommodation/attachHotelToEventByProviderId":
    api.accommodation.attachHotelToEventByProviderId,
  "accommodation/createHotel": api.accommodation.createHotel,
  "accommodation/createRoomType": api.accommodation.createRoomType,
  "accommodation/createRooms": api.accommodation.createRooms,
  "accommodation/deleteHotel": api.accommodation.deleteHotel,
  "accommodation/deleteRoom": api.accommodation.deleteRoom,
  "accommodation/deleteRoomType": api.accommodation.deleteRoomType,
  "accommodation/detachHotelFromEventByProviderId":
    api.accommodation.detachHotelFromEventByProviderId,
  "accommodation/unassignAttendeeFromRoom":
    api.accommodation.unassignAttendeeFromRoom,
  "accommodation/updateHotel": api.accommodation.updateHotel,
  "accommodation/updateRoomLabel": api.accommodation.updateRoomLabel,
  "accommodation/updateRoomType": api.accommodation.updateRoomType,
  "payments/assignPaymentToOrder": api.payments.assignPaymentToOrder,
  "payments/createPayment": api.payments.createPayment,
  "sync/addAttendeeToFamilyGroup": api.sync.addAttendeeToFamilyGroup,
  "sync/completeSyncRun": api.sync.completeSyncRun,
  "sync/createAttendeeFamilyGroup": api.sync.createAttendeeFamilyGroup,
  "sync/createWebhookEvent": api.sync.createWebhookEvent,
  "sync/processWebhookEvent": api.sync.processWebhookEvent,
  "sync/startSyncRun": api.sync.startSyncRun,
  "sync/updateSyncRun": api.sync.updateSyncRun,
  "sync/updateWebhookEvent": api.sync.updateWebhookEvent,
  "sync/upsertTicketTailorAttendee": api.sync.upsertTicketTailorAttendee,
  "sync/upsertTicketTailorEvent": api.sync.upsertTicketTailorEvent,
  "sync/upsertTicketTailorOrder": api.sync.upsertTicketTailorOrder,
  "tikkie/createPaymentLink": api.tikkie.createPaymentLink,
  "tikkie/createPaymentTemplate": api.tikkie.createPaymentTemplate,
  "tikkie/deletePaymentTemplate": api.tikkie.deletePaymentTemplate,
  "tikkie/updatePaymentLinkStatus": api.tikkie.updatePaymentLinkStatus,
  "tikkie/updatePaymentTemplate": api.tikkie.updatePaymentTemplate,
}

function normalizeLegacyPath(path: string) {
  return path.replace(":", "/")
}

function resolveLegacyQuery(path: string) {
  const ref = legacyQueryRefs[normalizeLegacyPath(path)]
  if (!ref) {
    throw new Error(`Unknown Convex query reference: ${path}`)
  }
  return ref
}

function resolveLegacyMutation(path: string) {
  const ref = legacyMutationRefs[normalizeLegacyPath(path)]
  if (!ref) {
    throw new Error(`Unknown Convex mutation reference: ${path}`)
  }
  return ref
}

async function getConvexToken() {
  try {
    const { userId, getToken } = await auth()

    if (!userId) {
      return undefined
    }

    return (await getToken({ template: "convex" })) ?? undefined
  } catch {
    return undefined
  }
}

function formatConvexError(kind: "query" | "mutation", error: unknown) {
  if (error instanceof Error) {
    return new Error(`Convex ${kind} failed: ${error.message}`)
  }
  return new Error(`Convex ${kind} failed`)
}

export async function createServerContext() {
  return convexServer
}

export async function runConvexQuery<Query extends PublicQueryRef>(
  query: Query,
  args: FunctionArgs<Query>
): Promise<FunctionReturnType<Query>> {
  try {
    const token = await getConvexToken()
    return await fetchQuery(query, args, { token, url: CONVEX_URL })
  } catch (error) {
    throw formatConvexError("query", error)
  }
}

export async function runConvexMutation<Mutation extends PublicMutationRef>(
  mutation: Mutation,
  args: FunctionArgs<Mutation>
): Promise<FunctionReturnType<Mutation>> {
  try {
    const token = await getConvexToken()
    return await fetchMutation(mutation, args, { token, url: CONVEX_URL })
  } catch (error) {
    throw formatConvexError("mutation", error)
  }
}

export async function convexQuery<Query extends PublicQueryRef>(
  query: Query,
  args: FunctionArgs<Query>
): Promise<FunctionReturnType<Query>>
export async function convexQuery<
  Args extends Record<string, unknown>,
  Response,
>(query: string, args: Args): Promise<Response>
export async function convexQuery(
  query: string | PublicQueryRef,
  args: Record<string, unknown>
) {
  if (typeof query === "string") {
    return await runConvexQuery(resolveLegacyQuery(query), args)
  }

  return await runConvexQuery(query, args as FunctionArgs<typeof query>)
}

export async function convexMutation<Mutation extends PublicMutationRef>(
  mutation: Mutation,
  args: FunctionArgs<Mutation>
): Promise<FunctionReturnType<Mutation>>
export async function convexMutation<
  Args extends Record<string, unknown>,
  Response,
>(mutation: string, args: Args): Promise<Response>
export async function convexMutation(
  mutation: string | PublicMutationRef,
  args: Record<string, unknown>
) {
  if (typeof mutation === "string") {
    return await runConvexMutation(resolveLegacyMutation(mutation), args)
  }

  return await runConvexMutation(
    mutation,
    args as FunctionArgs<typeof mutation>
  )
}
