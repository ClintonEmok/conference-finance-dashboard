import { createHmac, timingSafeEqual } from "node:crypto"

import {
  refreshTikkiePaymentLinkStatus,
  type AppTikkieLinkStatus,
} from "@/lib/domain/finance/tikkie-links"

type JsonRecord = Record<string, unknown>

export type TikkieWebhookNotification = {
  subscriptionId: string
  notificationType: "PAYMENT" | "REFUND" | "BUNDLE"
  paymentRequestToken: string
  paymentToken?: string
  refundToken?: string
}

export type ProcessTikkieWebhookNotificationResult = {
  accepted: true
  duplicate: boolean
  missing: boolean
  paymentRequestToken: string
  changed: boolean
  status: AppTikkieLinkStatus | null
}

function getHeader(headers: Headers, name: string) {
  const value = headers.get(name)
  return value?.trim() || null
}

function asRecord(value: unknown): JsonRecord {
  if (typeof value !== "object" || value === null || Array.isArray(value)) {
    return {}
  }

  return value as JsonRecord
}

function parseNotification(payload: unknown): TikkieWebhookNotification {
  const record = asRecord(payload)

  const subscriptionId =
    typeof record.subscriptionId === "string"
      ? record.subscriptionId.trim()
      : ""
  const notificationType =
    typeof record.notificationType === "string"
      ? record.notificationType.trim()
      : ""
  const paymentRequestToken =
    typeof record.paymentRequestToken === "string"
      ? record.paymentRequestToken.trim()
      : ""

  if (!subscriptionId) {
    throw new Error("Invalid webhook payload: 'subscriptionId' is required.")
  }

  if (
    notificationType !== "PAYMENT" &&
    notificationType !== "REFUND" &&
    notificationType !== "BUNDLE"
  ) {
    throw new Error("Invalid webhook payload: unsupported 'notificationType'.")
  }

  if (!paymentRequestToken) {
    throw new Error(
      "Invalid webhook payload: 'paymentRequestToken' is required."
    )
  }

  const paymentToken =
    typeof record.paymentToken === "string"
      ? record.paymentToken.trim()
      : undefined
  const refundToken =
    typeof record.refundToken === "string"
      ? record.refundToken.trim()
      : undefined

  return {
    subscriptionId,
    notificationType,
    paymentRequestToken,
    ...(paymentToken ? { paymentToken } : {}),
    ...(refundToken ? { refundToken } : {}),
  }
}

export function verifyTikkieWebhook(headers: Headers, rawBody: string) {
  const secret = process.env.TIKKIE_WEBHOOK_SECRET?.trim()

  if (!secret) {
    return false
  }

  const provided =
    getHeader(headers, "x-tikkie-signature") ??
    getHeader(headers, "x-signature") ??
    getHeader(headers, "signature")

  if (!provided) {
    return false
  }

  const digest = createHmac("sha256", secret)
    .update(rawBody, "utf8")
    .digest("hex")
  const providedBuffer = Buffer.from(provided, "utf8")
  const digestBuffer = Buffer.from(digest, "utf8")

  if (providedBuffer.length !== digestBuffer.length) {
    return false
  }

  return timingSafeEqual(providedBuffer, digestBuffer)
}

function notificationKey(notification: TikkieWebhookNotification) {
  return `${notification.subscriptionId}:${notification.notificationType}:${notification.paymentRequestToken}:${notification.paymentToken ?? ""}:${notification.refundToken ?? ""}`
}

export async function processTikkieWebhookNotification(
  payload: unknown
): Promise<ProcessTikkieWebhookNotificationResult> {
  const notification = parseNotification(payload)
  const key = notificationKey(notification)

  try {
    const result = await refreshTikkiePaymentLinkStatus({
      paymentRequestToken: notification.paymentRequestToken,
      source: "webhook",
      reason: `notification:${notification.notificationType}`,
      providerNotificationKey: key,
      providerPayload: notification,
    })

    return {
      accepted: true,
      duplicate: result.duplicate,
      missing: false,
      paymentRequestToken: notification.paymentRequestToken,
      changed: result.changed,
      status: result.link.status,
    }
  } catch (error) {
    if (
      error instanceof Error &&
      error.message.includes("Payment link not found")
    ) {
      return {
        accepted: true,
        duplicate: false,
        missing: true,
        paymentRequestToken: notification.paymentRequestToken,
        changed: false,
        status: null,
      }
    }

    if (
      error instanceof Error &&
      error.message.includes("Unique constraint failed") &&
      error.message.includes("providerNotificationKey")
    ) {
      return {
        accepted: true,
        duplicate: true,
        missing: false,
        paymentRequestToken: notification.paymentRequestToken,
        changed: false,
        status: null,
      }
    }

    throw error
  }
}
