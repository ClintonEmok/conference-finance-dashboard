import type { Prisma } from "@prisma/client"

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
