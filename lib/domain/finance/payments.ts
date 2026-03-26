import { getPaymentRequestPayments } from "@/lib/integrations/tikkie/client"
import { api } from "@/lib/convex/api"
import { convexMutation, convexQuery } from "@/lib/convex/server"
import type { Id } from "@/convex/_generated/dataModel"

export type PaymentSource = "tikkie" | "bank_transfer" | "cash"

export type PaymentMatchStatus =
  | "auto_matched"
  | "manual_assignment"
  | "ambiguous"
  | "unassigned"

export type PaymentDto = {
  _id: string
  source: PaymentSource
  sourceId: string | null
  payerName: string
  payerAccountNumber: string | null
  amountMinor: number
  paidAt: number
  orderId: string | null
  status: PaymentMatchStatus | null
  matchedAt: number | null
  matchedBy: string | null
  reference: string | null
  notes: string | null
  providerPayload: unknown | null
}

export type CreateBankTransferPaymentInput = {
  orderId: string
  amountMinor: number
  paidAt: string
  payerName: string
  payerAccountNumber?: string
  reference?: string
  notes?: string
}

export type CreateCashPaymentInput = {
  orderId: string
  amountMinor: number
  paidAt: string
  payerName: string
  notes?: string
}

export type AssignPaymentInput = {
  orderId: string
}

export type ListPaymentsInput = {
  status?: PaymentMatchStatus
  source?: PaymentSource
  orderId?: string
}

export type ListPaymentsResult = {
  payments: PaymentDto[]
  total: number
}

export type SyncTikkiePaymentsResult = {
  paymentsFetched: number
  newPayments: number
  existingPayments: number
  updatedPayments: number
  skippedInvalid: number
  errors: string[]
}

export type AutoMatchResult = {
  autoMatched: number
  ambiguous: number
  unchanged: number
}

type ConvexPayment = {
  _id: string
  source: PaymentSource
  sourceId?: string
  payerName: string
  payerAccountNumber?: string
  amountMinor: number
  paidAt: number
  orderId?: string
  status?: PaymentMatchStatus
  matchedAt?: number
  matchedBy?: string
  reference?: string
  notes?: string
  providerPayload?: unknown
}

function mapPaymentDto(payment: ConvexPayment): PaymentDto {
  const normalizedOrderId =
    typeof payment.orderId === "string" ? payment.orderId.trim() : ""

  return {
    _id: payment._id,
    source: payment.source,
    sourceId: payment.sourceId ?? null,
    payerName: payment.payerName,
    payerAccountNumber: payment.payerAccountNumber ?? null,
    amountMinor: payment.amountMinor,
    paidAt: payment.paidAt,
    orderId: normalizedOrderId || null,
    status: payment.status ?? null,
    matchedAt: payment.matchedAt ?? null,
    matchedBy: payment.matchedBy ?? null,
    reference: payment.reference ?? null,
    notes: payment.notes ?? null,
    providerPayload: payment.providerPayload ?? null,
  }
}

function normalizeRequiredOrderId(value: string): string {
  const normalized = value.trim()

  if (!normalized) {
    throw new Error("Invalid 'orderId'. Value is required.")
  }

  return normalized
}

function normalizeAmountMinor(value: number): number {
  if (!Number.isInteger(value) || value <= 0) {
    throw new Error(
      "Invalid 'amountMinor'. Expected a positive integer in cents."
    )
  }
  return value
}

function normalizePayerName(value: string): string {
  const normalized = value.trim()
  if (!normalized) {
    throw new Error("Invalid 'payerName'. Value is required.")
  }
  return normalized
}

function normalizePaidAt(value: string): number {
  const parsed = new Date(value)
  if (Number.isNaN(parsed.getTime())) {
    throw new Error("Invalid 'paidAt'. Expected ISO date string.")
  }
  return parsed.getTime()
}

export async function createBankTransferPayment(
  input: CreateBankTransferPaymentInput,
  userId: string
): Promise<PaymentDto> {
  const validated = {
    orderId: normalizeRequiredOrderId(input.orderId),
    amountMinor: normalizeAmountMinor(input.amountMinor),
    paidAt: normalizePaidAt(input.paidAt),
    payerName: normalizePayerName(input.payerName),
    payerAccountNumber: input.payerAccountNumber?.trim() ?? undefined,
    reference: input.reference?.trim() ?? undefined,
    notes: input.notes?.trim() ?? undefined,
  }

  const id = await convexMutation(api.payments.createPayment, {
    source: "bank_transfer",
    orderId: validated.orderId,
    amountMinor: validated.amountMinor,
    paidAt: validated.paidAt,
    payerName: validated.payerName,
    payerAccountNumber: validated.payerAccountNumber,
    reference: validated.reference,
    notes: validated.notes,
    matchedBy: userId,
  })

  const payment = await convexQuery(api.payments.getPaymentById, {
    paymentId: id,
  })

  if (!payment) {
    throw new Error("Payment not found")
  }

  return mapPaymentDto(payment as ConvexPayment)
}

export async function createCashPayment(
  input: CreateCashPaymentInput,
  userId: string
): Promise<PaymentDto> {
  const validated = {
    orderId: normalizeRequiredOrderId(input.orderId),
    amountMinor: normalizeAmountMinor(input.amountMinor),
    paidAt: normalizePaidAt(input.paidAt),
    payerName: normalizePayerName(input.payerName),
    notes: input.notes?.trim() ?? undefined,
  }

  const id = await convexMutation(api.payments.createPayment, {
    source: "cash",
    orderId: validated.orderId,
    amountMinor: validated.amountMinor,
    paidAt: validated.paidAt,
    payerName: validated.payerName,
    notes: validated.notes,
    matchedBy: userId,
  })

  const payment = await convexQuery(api.payments.getPaymentById, {
    paymentId: id,
  })

  if (!payment) {
    throw new Error("Payment not found")
  }

  return mapPaymentDto(payment as ConvexPayment)
}

export async function assignPaymentToOrder(
  paymentId: string,
  input: AssignPaymentInput,
  userId: string
): Promise<PaymentDto> {
  const validatedOrderId = normalizeRequiredOrderId(input.orderId)

  await convexMutation(api.payments.assignPaymentToOrder, {
    paymentId: paymentId as Id<"payments">,
    orderId: validatedOrderId,
    status: "manual_assignment",
    matchedBy: userId,
  })

  const payment = await convexQuery(api.payments.getPaymentById, {
    paymentId: paymentId as Id<"payments">,
  })

  if (!payment) {
    throw new Error("Payment not found")
  }

  return mapPaymentDto(payment as ConvexPayment)
}

export async function getPaymentById(id: string): Promise<PaymentDto | null> {
  try {
    const payment = await convexQuery(api.payments.getPaymentById, {
      paymentId: id as Id<"payments">,
    })

    return payment ? mapPaymentDto(payment as ConvexPayment) : null
  } catch {
    return null
  }
}

export async function listPayments(
  input: ListPaymentsInput = {}
): Promise<ListPaymentsResult> {
  const payments = await convexQuery(api.payments.getPayments, {
    orderId: input.orderId,
    source: input.source,
    status: input.status,
  })

  return {
    payments: payments.map((payment) =>
      mapPaymentDto(payment as ConvexPayment)
    ),
    total: payments.length,
  }
}

export async function getUnassignedPayments(): Promise<PaymentDto[]> {
  const payments = await convexQuery(api.payments.getUnassignedPayments, {})
  return payments.map((payment: (typeof payments)[number]) =>
    mapPaymentDto(payment as ConvexPayment)
  )
}

export async function syncTikkiePayments(
  paymentRequestToken: string
): Promise<SyncTikkiePaymentsResult> {
  const result: SyncTikkiePaymentsResult = {
    paymentsFetched: 0,
    newPayments: 0,
    existingPayments: 0,
    updatedPayments: 0,
    skippedInvalid: 0,
    errors: [],
  }

  try {
    const tikkieResponse = await getPaymentRequestPayments(paymentRequestToken)

    const tikkiePayments = tikkieResponse.payments as Array<
      Record<string, unknown>
    >
    result.paymentsFetched = tikkiePayments.length

    for (const tPayment of tikkiePayments) {
      const sourceId =
        typeof tPayment.paymentToken === "string"
          ? tPayment.paymentToken.trim()
          : ""
      const payerName =
        typeof tPayment.counterPartyName === "string"
          ? tPayment.counterPartyName.trim()
          : ""
      const payerAccountNumber =
        typeof tPayment.counterPartyAccountNumber === "string"
          ? tPayment.counterPartyAccountNumber
          : undefined
      const amountMinor =
        typeof tPayment.amountInCents === "number" &&
        Number.isInteger(tPayment.amountInCents) &&
        tPayment.amountInCents >= 0
          ? tPayment.amountInCents
          : null
      const paidAtSource =
        typeof tPayment.createdDateTime === "string"
          ? Date.parse(tPayment.createdDateTime)
          : Number.NaN

      if (
        !sourceId ||
        !payerName ||
        amountMinor === null ||
        !Number.isFinite(paidAtSource)
      ) {
        result.skippedInvalid += 1
        result.errors.push(
          `Invalid payment payload for request ${paymentRequestToken}; token=${sourceId || "missing"}`
        )
        continue
      }

      const upsertResult = await convexMutation(
        api.payments.upsertTikkiePayment,
        {
          sourceId,
          payerName,
          payerAccountNumber,
          amountMinor,
          paidAt: paidAtSource,
          providerPayload: tPayment,
        }
      )

      if (upsertResult.inserted) {
        result.newPayments += 1
        continue
      }

      result.existingPayments += 1
      if (upsertResult.updated) {
        result.updatedPayments += 1
      }
    }
  } catch (error) {
    result.errors.push(error instanceof Error ? error.message : "Unknown error")
  }

  return result
}

export async function autoMatchPayments(): Promise<AutoMatchResult> {
  const result: AutoMatchResult = {
    autoMatched: 0,
    ambiguous: 0,
    unchanged: 0,
  }

  const unassignedPayments = await convexQuery(
    api.payments.getUnassignedPayments,
    {}
  )

  for (const payment of unassignedPayments) {
    const matchingOrders = (await convexQuery(api.orders.getOrders, {
      status: "paid",
    })) as Array<{ _id: string; buyerName: string | null }>

    const matches = matchingOrders.filter(
      (o) => o.buyerName?.toLowerCase() === payment.payerName.toLowerCase()
    )

    if (matches.length === 0) {
      result.unchanged++
    } else if (matches.length === 1) {
      await convexMutation(api.payments.assignPaymentToOrder, {
        paymentId: payment._id as Id<"payments">,
        orderId: matches[0]._id,
        status: "auto_matched",
        matchedBy: "auto",
      })
      result.autoMatched++
    } else {
      result.ambiguous++
    }
  }

  return result
}
