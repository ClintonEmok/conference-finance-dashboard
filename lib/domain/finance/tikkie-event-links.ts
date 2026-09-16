import { createPaymentRequest } from "@/lib/integrations/tikkie/client"
import { api } from "@/lib/convex/api"
import { convexMutation } from "@/lib/convex/server"
import { resolveTikkieLinkPurpose, type TikkieLinkPurpose } from "./tikkie-link-purpose"
import { TIKKIE_TEXT_LIMIT } from "./tikkie-links"

function toTikkieDate(value: Date) {
  return value.toISOString().slice(0, 10)
}

export type EventTikkieLinkView = {
  id: string
  eventId: string
  paymentRequestToken: string
  paymentRequestUrl: string
  status: string
  amountMinor: number
  description: string
  expiryDate: string
  createdAt: string
  purpose: TikkieLinkPurpose
  url?: string
}

export type CreateEventTikkieLinkParams = {
  eventId: string
  providerEventId: string
  amountMinor?: number
  description?: string
  expiryDays?: number
  expiryDate?: string
  purpose?: TikkieLinkPurpose
}

export type CreateEventTikkieLinkResult = {
  link: EventTikkieLinkView
  created: boolean
}

export async function createEventTikkieLink(
  params: CreateEventTikkieLinkParams
): Promise<CreateEventTikkieLinkResult> {
  const amountMinor = params.amountMinor ?? 0
  const providerAmountInCents = amountMinor > 0 ? amountMinor : undefined
  const expiryDate = params.expiryDate
    ? new Date(`${params.expiryDate}T00:00:00.000Z`)
    : new Date(Date.now() + (params.expiryDays ?? 14) * 24 * 60 * 60 * 1000)
  const purpose = resolveTikkieLinkPurpose(params.purpose)
  const description =
    params.description?.slice(0, TIKKIE_TEXT_LIMIT) ??
    (purpose === "donation"
      ? `Donation ${params.eventId}`.slice(0, TIKKIE_TEXT_LIMIT)
      : `Event ${params.eventId}`.slice(0, TIKKIE_TEXT_LIMIT))

  const providerResponse = await createPaymentRequest({
    amountInCents: providerAmountInCents,
    description,
    expiryDate: toTikkieDate(expiryDate),
  })

  const linkId = await convexMutation(api.tikkie.createEventPaymentLink, {
    eventId: params.eventId,
    providerEventId: params.providerEventId,
    paymentRequestToken: providerResponse.paymentRequestToken,
    paymentRequestUrl: providerResponse.url,
    providerStatus: providerResponse.status,
    amountMinor,
    description,
    expiryDate: expiryDate.getTime(),
    providerPayload: providerResponse,
    purpose,
  })

  return {
    link: {
      id: linkId,
      eventId: params.eventId,
      paymentRequestToken: providerResponse.paymentRequestToken,
      paymentRequestUrl: providerResponse.url,
      status: providerResponse.status,
      amountMinor,
      description,
      expiryDate: expiryDate.toISOString(),
      createdAt: new Date().toISOString(),
      purpose,
      url: providerResponse.url,
    },
    created: true,
  }
}
