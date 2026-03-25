import {
  createPaymentRequest,
  getPaymentRequest,
  getPaymentRequestPayments,
} from "@/lib/integrations/tikkie/client"

const CONVEX_URL = process.env.NEXT_PUBLIC_CONVEX_URL!

async function convexQuery<Args extends Record<string, unknown>, Response>(
  path: string,
  args: Args
): Promise<Response> {
  const response = await fetch(`${CONVEX_URL}/${path}`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
    },
    body: JSON.stringify({ args }),
  })

  if (!response.ok) {
    const error = await response.text()
    throw new Error(`Convex query failed: ${error}`)
  }

  return response.json()
}

async function convexMutation<Args extends Record<string, unknown>, Response>(
  path: string,
  args: Args
): Promise<Response> {
  const response = await fetch(`${CONVEX_URL}/${path}`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
    },
    body: JSON.stringify({ args }),
  })

  if (!response.ok) {
    const error = await response.text()
    throw new Error(`Convex mutation failed: ${error}`)
  }

  return response.json()
}

export type AppTikkieLinkStatus = "created" | "paid" | "expired"

export type TikkieLinkCheckState = "fresh" | "stale" | null

export const TIKKIE_TEXT_LIMIT = 35
export const TIKKIE_OPEN_LINK_STALE_MINUTES = 30

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
  providerPayload: unknown
  providerLastCheckedAt: string | null
  statusUpdatedAt: string
  createdAt: string
  updatedAt: string
}

export type TikkiePaymentLinkView = TikkiePaymentLinkDto & {
  checkState: TikkieLinkCheckState
}

export type TikkiePaymentLinksByOrderSummary = {
  providerOrderId: string
  count: number
  links: TikkiePaymentLinkView[]
  latestLink: TikkiePaymentLinkView | null
  history: TikkiePaymentLinkView[]
  providerLastCheckedAt: string | null
  latestLinkCheckState: TikkieLinkCheckState
}

export type CreateTikkiePaymentLinkInput = {
  providerOrderId: string
  providerEventId: string
  amountMinor: number
  description: string
  expiryDate: string | Date
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
  providerNotificationKey?: string
  providerPayload?: unknown
}

export type SyncPendingTikkiePaymentLinksResult = {
  scanned: number
  updated: number
  unchanged: number
  failed: number
}

export type RefreshTikkiePaymentLinkStatusResult = {
  link: TikkiePaymentLinkDto
  changed: boolean
  duplicate: boolean
}

export type TikkieGenerationDefaults = {
  amountMinor: number
  expiryDate: string
  description: string
  referenceId: string
}

type DbTikkiePaymentLink = {
  _id: string
  providerOrderId: string
  providerEventId: string
  orderId: string
  paymentRequestToken: string
  paymentRequestUrl: string
  status: AppTikkieLinkStatus
  statusSource: "create" | "webhook" | "poll"
  providerStatus: string
  amountMinor: number
  description: string
  expiryDate: number
  referenceId: string | null
  providerPayload: unknown
  statusUpdatedAt: number
}

type PrismaTikkiePaymentLink = {
  id: string
  providerOrderId: string
  providerEventId: string
  orderId: string
  paymentRequestToken: string
  paymentRequestUrl: string
  status: AppTikkieLinkStatus
  statusSource: "create" | "webhook" | "poll"
  providerStatus: string
  amountMinor: number
  description: string
  expiryDate: Date
  referenceId: string | null
  providerPayload: unknown
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

export function mapTikkiePaymentLink(
  link: DbTikkiePaymentLink | PrismaTikkiePaymentLink
): TikkiePaymentLinkDto {
  const linkId = "_id" in link ? link._id : link.id
  const expiry =
    "expiryDate" in link && typeof link.expiryDate === "number"
      ? link.expiryDate
      : new Date(link.expiryDate as unknown as string).getTime()
  const statusUpdated =
    "statusUpdatedAt" in link && typeof link.statusUpdatedAt === "number"
      ? link.statusUpdatedAt
      : new Date(link.statusUpdatedAt as unknown as string).getTime()
  const createdAt =
    "createdAt" in link
      ? typeof link.createdAt === "number"
        ? link.createdAt
        : new Date(link.createdAt as unknown as string).getTime()
      : statusUpdated

  return {
    id: linkId,
    providerOrderId: link.providerOrderId,
    providerEventId: link.providerEventId,
    paymentRequestToken: link.paymentRequestToken,
    paymentRequestUrl: link.paymentRequestUrl,
    status: toAppTikkieStatus(link.status),
    statusSource: toStatusSource(link.statusSource),
    providerStatus: link.providerStatus,
    amountMinor: link.amountMinor,
    description: link.description,
    expiryDate: new Date(expiry).toISOString(),
    referenceId: link.referenceId,
    providerPayload: link.providerPayload,
    providerLastCheckedAt: null,
    statusUpdatedAt: new Date(statusUpdated).toISOString(),
    createdAt: new Date(createdAt).toISOString(),
    updatedAt: new Date(statusUpdated).toISOString(),
  }
}

export function deriveTikkieLinkCheckState(link: {
  status: AppTikkieLinkStatus
  providerLastCheckedAt: string | null
}): TikkieLinkCheckState {
  if (link.status !== "created") {
    return null
  }

  if (!link.providerLastCheckedAt) {
    return "stale"
  }

  const checkedAt = new Date(link.providerLastCheckedAt)

  if (Number.isNaN(checkedAt.getTime())) {
    return "stale"
  }

  const staleAt = checkedAt.getTime() + TIKKIE_OPEN_LINK_STALE_MINUTES * 60_000
  return staleAt <= Date.now() ? "stale" : "fresh"
}

export function mapTikkiePaymentLinkView(
  link: DbTikkiePaymentLink
): TikkiePaymentLinkView {
  const mapped = mapTikkiePaymentLink(link)

  return {
    ...mapped,
    checkState: deriveTikkieLinkCheckState({
      status: mapped.status,
      providerLastCheckedAt: mapped.providerLastCheckedAt,
    }),
  }
}

export function normalizeProviderIdentifier(value: string, fieldName: string) {
  const normalized = value.trim()
  if (!normalized) {
    throw new Error(`Invalid '${fieldName}'. Value is required.`)
  }

  return normalized
}

function normalizeTextField(value: string, fieldName: string) {
  const normalized = value.trim()
  if (!normalized) {
    throw new Error(`Invalid '${fieldName}'. Value is required.`)
  }

  if (normalized.length > TIKKIE_TEXT_LIMIT) {
    throw new Error(
      `Invalid '${fieldName}'. Maximum length is ${TIKKIE_TEXT_LIMIT} characters.`
    )
  }

  return normalized
}

function normalizeDescription(value: string) {
  return normalizeTextField(value, "description")
}

function normalizeReferenceId(value: string | null | undefined) {
  if (value === undefined || value === null) {
    return null
  }

  const normalized = value.trim()

  if (!normalized) {
    return null
  }

  return normalizeTextField(normalized, "referenceId")
}

function normalizeAmountMinor(value: number) {
  if (!Number.isInteger(value) || value <= 0) {
    throw new Error(
      "Invalid 'amountMinor'. Expected a positive integer in cents."
    )
  }

  return value
}

function normalizeExpiryDate(value: string | Date) {
  const normalized = value instanceof Date ? value.toISOString() : value.trim()
  const parsed = value instanceof Date ? new Date(value) : new Date(normalized)
  if (Number.isNaN(parsed.getTime())) {
    throw new Error("Invalid 'expiryDate'. Expected ISO date or datetime.")
  }

  const effectiveExpiry = /^\d{4}-\d{2}-\d{2}$/.test(normalized)
    ? new Date(`${normalized}T23:59:59.999Z`)
    : parsed

  if (effectiveExpiry.getTime() <= Date.now()) {
    throw new Error("Invalid 'expiryDate'. Expected a future date.")
  }

  return parsed
}

function toTikkieDate(value: Date) {
  return value.toISOString().slice(0, 10)
}

export function buildTikkieGenerationDefaults(params: {
  providerOrderId: string
  outstandingAmountMinor: number
}) {
  const providerOrderId = normalizeProviderIdentifier(
    params.providerOrderId,
    "providerOrderId"
  )

  return {
    amountMinor:
      Number.isInteger(params.outstandingAmountMinor) &&
      params.outstandingAmountMinor > 0
        ? params.outstandingAmountMinor
        : 0,
    expiryDate: toTikkieDate(new Date(Date.now() + 14 * 24 * 60 * 60 * 1000)),
    description: `Order ${providerOrderId}`.slice(0, TIKKIE_TEXT_LIMIT),
    referenceId: providerOrderId.slice(0, TIKKIE_TEXT_LIMIT),
  } satisfies TikkieGenerationDefaults
}

export function validateCreateTikkiePaymentLinkInput(
  input: CreateTikkiePaymentLinkInput
) {
  return {
    providerOrderId: normalizeProviderIdentifier(
      input.providerOrderId,
      "providerOrderId"
    ),
    providerEventId: normalizeProviderIdentifier(
      input.providerEventId,
      "providerEventId"
    ),
    amountMinor: normalizeAmountMinor(input.amountMinor),
    description: normalizeDescription(input.description),
    expiryDate: normalizeExpiryDate(input.expiryDate),
    referenceId: normalizeReferenceId(input.referenceId),
  }
}

function mapProviderStatus(providerStatus: string) {
  if (providerStatus === "OPEN") {
    return "created" as const
  }

  return "expired" as const
}

async function resolveOrder(providerOrderId: string, providerEventId: string) {
  const orders = await convexQuery<
    { providerOrderId: string },
    { _id: string; providerEventId: string }[]
  >("orders/getOrderByProviderId", { providerOrderId })

  const order = orders[0]

  if (!order) {
    throw new Error("Order not found for given 'providerOrderId'.")
  }

  if (order.providerEventId !== providerEventId) {
    throw new Error(
      "Invalid provider identifiers. 'providerEventId' does not match the order."
    )
  }

  return order
}

export async function createTikkiePaymentLink(
  input: CreateTikkiePaymentLinkInput
): Promise<CreateTikkiePaymentLinkResult> {
  const {
    providerOrderId,
    providerEventId,
    amountMinor,
    description,
    expiryDate,
    referenceId,
  } = validateCreateTikkiePaymentLinkInput(input)

  const order = await resolveOrder(providerOrderId, providerEventId)

  const providerResponse = await createPaymentRequest({
    amountInCents: amountMinor,
    description,
    expiryDate: toTikkieDate(expiryDate),
    ...(referenceId ? { referenceId } : {}),
  })

  const appStatus = mapProviderStatus(providerResponse.status)
  const now = Date.now()

  const existingLinks = await convexQuery<
    { orderId: string },
    DbTikkiePaymentLink[]
  >("tikkie/getPaymentLinks", { orderId: order._id })

  const existingToken = existingLinks.find(
    (l) => l.paymentRequestToken === providerResponse.paymentRequestToken
  )

  if (existingToken) {
    return {
      link: mapTikkiePaymentLink(existingToken),
      created: false,
    }
  }

  const linkId = await convexMutation<
    {
      providerOrderId: string
      providerEventId: string
      orderId: string
      paymentRequestToken: string
      paymentRequestUrl: string
      providerStatus: string
      amountMinor: number
      description: string
      expiryDate: number
      referenceId?: string
      providerPayload?: unknown
    },
    string
  >("tikkie/createPaymentLink", {
    providerOrderId,
    providerEventId,
    orderId: order._id,
    paymentRequestToken: providerResponse.paymentRequestToken,
    paymentRequestUrl: providerResponse.url,
    providerStatus: providerResponse.status,
    amountMinor,
    description,
    expiryDate: expiryDate.getTime(),
    referenceId: referenceId ?? undefined,
    providerPayload: providerResponse,
  })

  const newLink: DbTikkiePaymentLink = {
    _id: linkId,
    providerOrderId,
    providerEventId,
    orderId: order._id,
    paymentRequestToken: providerResponse.paymentRequestToken,
    paymentRequestUrl: providerResponse.url,
    status: appStatus,
    statusSource: "create",
    providerStatus: providerResponse.status,
    amountMinor,
    description,
    expiryDate: expiryDate.getTime(),
    referenceId: referenceId,
    providerPayload: providerResponse,
    statusUpdatedAt: now,
  }

  return {
    link: mapTikkiePaymentLink(newLink),
    created: true,
  }
}

export async function listTikkiePaymentLinksByOrder(
  input: ListTikkiePaymentLinksByOrderInput
): Promise<TikkiePaymentLinksByOrderSummary> {
  const providerOrderId = normalizeProviderIdentifier(
    input.providerOrderId,
    "providerOrderId"
  )

  const orders = await convexQuery<
    { providerOrderId: string },
    { _id: string }[]
  >("orders/getOrderByProviderId", { providerOrderId })

  const orderId = orders[0]?._id

  const links = orderId
    ? await convexQuery<{ orderId: string }, DbTikkiePaymentLink[]>(
        "tikkie/getPaymentLinks",
        { orderId }
      )
    : []

  const mappedLinks = links
    .map(mapTikkiePaymentLinkView)
    .sort(
      (a, b) =>
        new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime()
    )
  const latestLink = mappedLinks[0] ?? null

  return {
    providerOrderId,
    count: mappedLinks.length,
    links: mappedLinks,
    latestLink,
    history: mappedLinks.slice(1),
    providerLastCheckedAt: latestLink?.providerLastCheckedAt ?? null,
    latestLinkCheckState: latestLink?.checkState ?? null,
  }
}

function derivePaymentState(params: {
  providerStatus: string
  numberOfPayments?: number
  totalAmountPaidInCents?: number
  payments: unknown[]
  totalElementCount: number
}): "paid" | "created" | "expired" {
  if (
    (params.numberOfPayments ?? 0) > 0 ||
    (params.totalAmountPaidInCents ?? 0) > 0
  ) {
    return "paid"
  }

  if (params.totalElementCount > 0 || params.payments.length > 0) {
    return "paid"
  }

  return mapProviderStatus(params.providerStatus)
}

function canTransition(
  current: AppTikkieLinkStatus,
  next: AppTikkieLinkStatus
) {
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

export async function refreshTikkiePaymentLinkStatus(
  input: RefreshTikkiePaymentLinkStatusInput
): Promise<RefreshTikkiePaymentLinkStatusResult> {
  const paymentRequestToken = normalizeProviderIdentifier(
    input.paymentRequestToken,
    "paymentRequestToken"
  )

  const existing = await convexQuery<
    { paymentRequestToken: string },
    DbTikkiePaymentLink | null
  >("tikkie/getPaymentLinkByToken", { paymentRequestToken })

  if (!existing) {
    throw new Error("Payment link not found for given 'paymentRequestToken'.")
  }

  const request = await getPaymentRequest(paymentRequestToken)

  const hasAggregatePayment =
    (request.numberOfPayments ?? 0) > 0 ||
    (request.totalAmountPaidInCents ?? 0) > 0

  const payments = hasAggregatePayment
    ? { payments: [] as unknown[], totalElementCount: 0 }
    : await getPaymentRequestPayments(paymentRequestToken, 0, 50)

  const resolvedStatus = derivePaymentState({
    providerStatus: request.status,
    numberOfPayments: request.numberOfPayments,
    totalAmountPaidInCents: request.totalAmountPaidInCents,
    payments: payments.payments,
    totalElementCount: payments.totalElementCount,
  })

  const currentStatus = toAppTikkieStatus(existing.status)
  const nextStatus = canTransition(currentStatus, resolvedStatus)
    ? resolvedStatus
    : currentStatus

  if (nextStatus !== currentStatus) {
    await convexMutation<
      {
        linkId: string
        status: "created" | "paid" | "expired"
        providerStatus: string
        source: "create" | "webhook" | "poll"
        reason?: string
        providerPayload?: unknown
      },
      { linkId: string }
    >("tikkie/updatePaymentLinkStatus", {
      linkId: existing._id,
      status: nextStatus,
      providerStatus: request.status,
      source: input.source as "create" | "webhook" | "poll",
      reason: input.reason,
      providerPayload: {
        paymentRequest: request,
        payments,
        webhook: input.providerPayload ?? null,
      },
    })
  }

  const updatedLink = await convexQuery<
    { linkId: string },
    DbTikkiePaymentLink | null
  >("tikkie/getPaymentLinkById", { linkId: existing._id })

  if (!updatedLink) {
    throw new Error("Failed to retrieve updated payment link")
  }

  return {
    link: mapTikkiePaymentLink(updatedLink),
    changed: nextStatus !== currentStatus,
    duplicate: false,
  }
}

export async function syncPendingTikkiePaymentLinks({
  limit,
}: {
  limit: number
}) {
  const safeLimit =
    Number.isFinite(limit) && limit > 0 ? Math.min(Math.floor(limit), 100) : 25

  const pending = await convexQuery<{ status: string }, DbTikkiePaymentLink[]>(
    "tikkie/getPaymentLinks",
    { status: "created" }
  )

  const limitedPending = pending
    .sort((a, b) => a.statusUpdatedAt - b.statusUpdatedAt)
    .slice(0, safeLimit)

  let updated = 0
  let unchanged = 0
  let failed = 0

  for (const item of limitedPending) {
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
    scanned: limitedPending.length,
    updated,
    unchanged,
    failed,
  } satisfies SyncPendingTikkiePaymentLinksResult
}
