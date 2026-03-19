import type { Prisma } from "@prisma/client"

import { prisma } from "@/lib/prisma"
import {
  createPaymentRequest,
  getPaymentRequest,
  getPaymentRequestPayments,
} from "@/lib/integrations/tikkie/client"

export type AppTikkieLinkStatus = "created" | "paid" | "expired"

export type TikkiePaymentLinkDto = {
  id: string
  providerOrderId: string
  providerEventId: string
  paymentRequestToken: string
  paymentRequestUrl: string
  status: AppTikkieLinkStatus
  statusSource: "create" | "webhook" | "poll"
  providerStatus: string
  amountMinor: number
  description: string
  expiryDate: string
  referenceId: string | null
  providerPayload: Prisma.JsonValue
  providerLastCheckedAt: string | null
  statusUpdatedAt: string
  createdAt: string
  updatedAt: string
}

export type CreateTikkiePaymentLinkInput = {
  providerOrderId: string
  providerEventId: string
  amountMinor: number
  description: string
  expiryDate: string
  referenceId?: string | null
}

export type CreateTikkiePaymentLinkResult = {
  link: TikkiePaymentLinkDto
  created: boolean
}

export type ListTikkiePaymentLinksByOrderInput = {
  providerOrderId: string
}

export type RefreshTikkiePaymentLinkStatusInput = {
  paymentRequestToken: string
  source: "webhook" | "poll"
  reason?: string
  providerPayload?: Prisma.JsonValue
}

export type SyncPendingTikkiePaymentLinksResult = {
  scanned: number
  updated: number
  unchanged: number
  failed: number
}

type DbTikkiePaymentLink = {
  id: string
  providerOrderId: string
  providerEventId: string
  paymentRequestToken: string
  paymentRequestUrl: string
  status: AppTikkieLinkStatus
  statusSource: "create" | "webhook" | "poll"
  providerStatus: string
  amountMinor: number
  description: string
  expiryDate: Date
  referenceId: string | null
  providerPayload: Prisma.JsonValue
  providerLastCheckedAt: Date | null
  statusUpdatedAt: Date
  createdAt: Date
  updatedAt: Date
}

export function toAppTikkieStatus(value: string): AppTikkieLinkStatus {
  if (value === "paid" || value === "expired") {
    return value
  }

  return "created"
}

export function toStatusSource(value: string): "create" | "webhook" | "poll" {
  if (value === "webhook" || value === "poll") {
    return value
  }

  return "create"
}

export function mapTikkiePaymentLink(link: DbTikkiePaymentLink): TikkiePaymentLinkDto {
  return {
    id: link.id,
    providerOrderId: link.providerOrderId,
    providerEventId: link.providerEventId,
    paymentRequestToken: link.paymentRequestToken,
    paymentRequestUrl: link.paymentRequestUrl,
    status: toAppTikkieStatus(link.status),
    statusSource: toStatusSource(link.statusSource),
    providerStatus: link.providerStatus,
    amountMinor: link.amountMinor,
    description: link.description,
    expiryDate: link.expiryDate.toISOString(),
    referenceId: link.referenceId,
    providerPayload: link.providerPayload,
    providerLastCheckedAt: link.providerLastCheckedAt?.toISOString() ?? null,
    statusUpdatedAt: link.statusUpdatedAt.toISOString(),
    createdAt: link.createdAt.toISOString(),
    updatedAt: link.updatedAt.toISOString(),
  }
}

export function normalizeProviderIdentifier(value: string, fieldName: string) {
  const normalized = value.trim()
  if (!normalized) {
    throw new Error(`Invalid '${fieldName}'. Value is required.`)
  }

  return normalized
}

function normalizeDescription(value: string) {
  const normalized = value.trim()
  if (!normalized) {
    throw new Error("Invalid 'description'. Value is required.")
  }

  if (normalized.length > 35) {
    throw new Error("Invalid 'description'. Maximum length is 35 characters.")
  }

  return normalized
}

function normalizeAmountMinor(value: number) {
  if (!Number.isInteger(value) || value <= 0) {
    throw new Error("Invalid 'amountMinor'. Expected a positive integer in cents.")
  }

  return value
}

function normalizeExpiryDate(value: string) {
  const parsed = new Date(value)
  if (Number.isNaN(parsed.getTime())) {
    throw new Error("Invalid 'expiryDate'. Expected ISO date or datetime.")
  }

  return parsed
}

function toTikkieDate(value: Date) {
  return value.toISOString().slice(0, 10)
}

function mapProviderStatus(providerStatus: string) {
  if (providerStatus === "OPEN") {
    return "created" as const
  }

  return "expired" as const
}

async function resolveOrder(providerOrderId: string, providerEventId: string) {
  const order = await prisma.ticketTailorOrder.findUnique({
    where: {
      providerOrderId,
    },
    select: {
      id: true,
      providerEventId: true,
    },
  })

  if (!order) {
    throw new Error("Order not found for given 'providerOrderId'.")
  }

  if (order.providerEventId !== providerEventId) {
    throw new Error("Invalid provider identifiers. 'providerEventId' does not match the order.")
  }

  return order
}

export async function createTikkiePaymentLink(
  input: CreateTikkiePaymentLinkInput,
): Promise<CreateTikkiePaymentLinkResult> {
  const providerOrderId = normalizeProviderIdentifier(input.providerOrderId, "providerOrderId")
  const providerEventId = normalizeProviderIdentifier(input.providerEventId, "providerEventId")
  const amountMinor = normalizeAmountMinor(input.amountMinor)
  const description = normalizeDescription(input.description)
  const expiryDate = normalizeExpiryDate(input.expiryDate)
  const referenceId = input.referenceId?.trim() || null

  const order = await resolveOrder(providerOrderId, providerEventId)

  const providerResponse = await createPaymentRequest({
    amountInCents: amountMinor,
    description,
    expiryDate: toTikkieDate(expiryDate),
    ...(referenceId ? { referenceId } : {}),
  })

  const appStatus = mapProviderStatus(providerResponse.status)
  const now = new Date()

  const saved = await prisma.tikkiePaymentLink.upsert({
    where: {
      paymentRequestToken: providerResponse.paymentRequestToken,
    },
    update: {
      providerOrderId,
      providerEventId,
      orderId: order.id,
      paymentRequestUrl: providerResponse.url,
      status: appStatus,
      statusSource: "create",
      providerStatus: providerResponse.status,
      amountMinor,
      description,
      expiryDate,
      referenceId,
      providerPayload: providerResponse as unknown as Prisma.InputJsonValue,
      providerLastCheckedAt: now,
      statusUpdatedAt: now,
    },
    create: {
      providerOrderId,
      providerEventId,
      orderId: order.id,
      paymentRequestToken: providerResponse.paymentRequestToken,
      paymentRequestUrl: providerResponse.url,
      status: appStatus,
      statusSource: "create",
      providerStatus: providerResponse.status,
      amountMinor,
      description,
      expiryDate,
      referenceId,
      providerPayload: providerResponse as unknown as Prisma.InputJsonValue,
      providerLastCheckedAt: now,
      statusUpdatedAt: now,
    },
  })

  return {
    link: mapTikkiePaymentLink(saved),
    created: saved.createdAt.getTime() === saved.updatedAt.getTime(),
  }
}

export async function listTikkiePaymentLinksByOrder(input: ListTikkiePaymentLinksByOrderInput) {
  const providerOrderId = normalizeProviderIdentifier(input.providerOrderId, "providerOrderId")

  const links = await prisma.tikkiePaymentLink.findMany({
    where: {
      providerOrderId,
    },
    orderBy: [{ createdAt: "desc" }, { id: "desc" }],
  })

  return links.map(mapTikkiePaymentLink)
}

function derivePaymentState(params: {
  providerStatus: string
  payments: unknown[]
  totalElementCount: number
}) {
  if (params.totalElementCount > 0 || params.payments.length > 0) {
    return "paid" as const
  }

  return mapProviderStatus(params.providerStatus)
}

function canTransition(current: AppTikkieLinkStatus, next: AppTikkieLinkStatus) {
  if (current === "paid" && next !== "paid") {
    return false
  }

  if (current === next) {
    return true
  }

  if (current === "created" && (next === "paid" || next === "expired")) {
    return true
  }

  return false
}

export async function refreshTikkiePaymentLinkStatus(input: RefreshTikkiePaymentLinkStatusInput) {
  const paymentRequestToken = normalizeProviderIdentifier(input.paymentRequestToken, "paymentRequestToken")

  const existing = await prisma.tikkiePaymentLink.findUnique({
    where: {
      paymentRequestToken,
    },
  })

  if (!existing) {
    throw new Error("Payment link not found for given 'paymentRequestToken'.")
  }

  const [request, payments] = await Promise.all([
    getPaymentRequest(paymentRequestToken),
    getPaymentRequestPayments(paymentRequestToken, 0, 50),
  ])

  const resolvedStatus = derivePaymentState({
    providerStatus: request.status,
    payments: payments.payments,
    totalElementCount: payments.totalElementCount,
  })

  const currentStatus = toAppTikkieStatus(existing.status)
  const nextStatus = canTransition(currentStatus, resolvedStatus) ? resolvedStatus : currentStatus
  const now = new Date()

  const update = await prisma.tikkiePaymentLink.update({
    where: {
      id: existing.id,
    },
    data: {
      status: nextStatus,
      statusSource: input.source,
      providerStatus: request.status,
      providerPayload: {
        paymentRequest: request,
        payments,
        webhook: input.providerPayload ?? null,
      } as Prisma.InputJsonValue,
      providerLastCheckedAt: now,
      ...(nextStatus !== currentStatus ? { statusUpdatedAt: now } : {}),
      transitionEvents:
        nextStatus !== currentStatus
          ? {
              create: {
                fromStatus: currentStatus,
                toStatus: nextStatus,
                source: input.source,
                providerStatus: request.status,
                reason: input.reason ?? null,
                providerPayload: (input.providerPayload ?? null) as Prisma.InputJsonValue,
              },
            }
          : undefined,
    },
  })

  return {
    link: mapTikkiePaymentLink(update),
    changed: nextStatus !== currentStatus,
  }
}

export async function syncPendingTikkiePaymentLinks({ limit }: { limit: number }) {
  const safeLimit = Number.isFinite(limit) && limit > 0 ? Math.min(Math.floor(limit), 100) : 25

  const pending = await prisma.tikkiePaymentLink.findMany({
    where: {
      status: "created",
    },
    orderBy: [{ statusUpdatedAt: "asc" }, { createdAt: "asc" }],
    take: safeLimit,
    select: {
      paymentRequestToken: true,
    },
  })

  let updated = 0
  let unchanged = 0
  let failed = 0

  for (const item of pending) {
    try {
      const result = await refreshTikkiePaymentLinkStatus({
        paymentRequestToken: item.paymentRequestToken,
        source: "poll",
        reason: "pending-link-poll",
      })

      if (result.changed) {
        updated += 1
      } else {
        unchanged += 1
      }
    } catch {
      failed += 1
    }
  }

  return {
    scanned: pending.length,
    updated,
    unchanged,
    failed,
  } satisfies SyncPendingTikkiePaymentLinksResult
}
