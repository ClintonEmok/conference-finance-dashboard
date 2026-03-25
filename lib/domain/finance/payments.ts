import type { Prisma } from "@prisma/client"

import { prisma } from "@/lib/prisma"
import { getPaymentRequestPayments } from "@/lib/integrations/tikkie/client"

export type PaymentSource = "tikkie" | "bank_transfer" | "cash"

export type PaymentMatchStatus =
  | "auto_matched"
  | "manual_assignment"
  | "ambiguous"
  | "unassigned"

export type PaymentDto = {
  id: string
  source: PaymentSource
  sourceId: string | null
  payerName: string
  payerAccountNumber: string | null
  amountMinor: number
  paidAt: string
  orderId: string | null
  status: PaymentMatchStatus
  matchedAt: string | null
  matchedBy: string | null
  reference: string | null
  notes: string | null
  providerPayload: Prisma.JsonValue | null
  createdAt: string
  updatedAt: string
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

function mapPayment(payment: {
  id: string
  source: PaymentSource
  sourceId: string | null
  payerName: string
  payerAccountNumber: string | null
  amountMinor: number
  paidAt: Date
  orderId: string | null
  status: PaymentMatchStatus
  matchedAt: Date | null
  matchedBy: string | null
  reference: string | null
  notes: string | null
  providerPayload: Prisma.JsonValue | null
  createdAt: Date
  updatedAt: Date
}): PaymentDto {
  return {
    id: payment.id,
    source: payment.source,
    sourceId: payment.sourceId,
    payerName: payment.payerName,
    payerAccountNumber: payment.payerAccountNumber,
    amountMinor: payment.amountMinor,
    paidAt: payment.paidAt.toISOString(),
    orderId: payment.orderId,
    status: payment.status,
    matchedAt: payment.matchedAt?.toISOString() ?? null,
    matchedBy: payment.matchedBy,
    reference: payment.reference,
    notes: payment.notes,
    providerPayload: payment.providerPayload,
    createdAt: payment.createdAt.toISOString(),
    updatedAt: payment.updatedAt.toISOString(),
  }
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

function normalizePaidAt(value: string): Date {
  const parsed = new Date(value)
  if (Number.isNaN(parsed.getTime())) {
    throw new Error("Invalid 'paidAt'. Expected ISO date string.")
  }
  return parsed
}

export async function createBankTransferPayment(
  input: CreateBankTransferPaymentInput,
  userId: string
): Promise<PaymentDto> {
  const validated = {
    orderId: input.orderId.trim(),
    amountMinor: normalizeAmountMinor(input.amountMinor),
    paidAt: normalizePaidAt(input.paidAt),
    payerName: normalizePayerName(input.payerName),
    payerAccountNumber: input.payerAccountNumber?.trim() ?? null,
    reference: input.reference?.trim() ?? null,
    notes: input.notes?.trim() ?? null,
  }

  // Verify order exists
  const order = await prisma.ticketTailorOrder.findUnique({
    where: { id: validated.orderId },
    select: { id: true },
  })

  if (!order) {
    throw new Error("Order not found for given 'orderId'.")
  }

  const payment = await prisma.payment.create({
    data: {
      source: "bank_transfer",
      amountMinor: validated.amountMinor,
      paidAt: validated.paidAt,
      payerName: validated.payerName,
      payerAccountNumber: validated.payerAccountNumber,
      reference: validated.reference,
      notes: validated.notes,
      orderId: validated.orderId,
      status: "manual_assignment",
      matchedBy: userId,
      matchedAt: new Date(),
    },
  })

  return mapPayment(payment)
}

export async function createCashPayment(
  input: CreateCashPaymentInput,
  userId: string
): Promise<PaymentDto> {
  const validated = {
    orderId: input.orderId.trim(),
    amountMinor: normalizeAmountMinor(input.amountMinor),
    paidAt: normalizePaidAt(input.paidAt),
    payerName: normalizePayerName(input.payerName),
    notes: input.notes?.trim() ?? null,
  }

  // Verify order exists
  const order = await prisma.ticketTailorOrder.findUnique({
    where: { id: validated.orderId },
    select: { id: true },
  })

  if (!order) {
    throw new Error("Order not found for given 'orderId'.")
  }

  const payment = await prisma.payment.create({
    data: {
      source: "cash",
      amountMinor: validated.amountMinor,
      paidAt: validated.paidAt,
      payerName: validated.payerName,
      notes: validated.notes,
      orderId: validated.orderId,
      status: "manual_assignment",
      matchedBy: userId,
      matchedAt: new Date(),
    },
  })

  return mapPayment(payment)
}

export async function assignPaymentToOrder(
  paymentId: string,
  input: AssignPaymentInput,
  userId: string
): Promise<PaymentDto> {
  const validatedOrderId = input.orderId.trim()

  // Verify order exists
  const order = await prisma.ticketTailorOrder.findUnique({
    where: { id: validatedOrderId },
    select: { id: true },
  })

  if (!order) {
    throw new Error("Order not found for given 'orderId'.")
  }

  // Verify payment exists
  const payment = await prisma.payment.findUnique({
    where: { id: paymentId },
  })

  if (!payment) {
    throw new Error("Payment not found.")
  }

  const updated = await prisma.payment.update({
    where: { id: paymentId },
    data: {
      orderId: validatedOrderId,
      status: "manual_assignment",
      matchedBy: userId,
      matchedAt: new Date(),
    },
  })

  return mapPayment(updated)
}

export async function getPaymentById(id: string): Promise<PaymentDto | null> {
  const payment = await prisma.payment.findUnique({
    where: { id },
  })

  if (!payment) {
    return null
  }

  return mapPayment(payment)
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

export async function listPayments(
  input: ListPaymentsInput = {}
): Promise<ListPaymentsResult> {
  const where: Prisma.PaymentWhereInput = {}

  if (input.status) {
    where.status = input.status
  }

  if (input.source) {
    where.source = input.source
  }

  if (input.orderId) {
    where.orderId = input.orderId
  }

  const [payments, total] = await Promise.all([
    prisma.payment.findMany({
      where,
      orderBy: { createdAt: "desc" },
    }),
    prisma.payment.count({ where }),
  ])

  return {
    payments: payments.map(mapPayment),
    total,
  }
}

export async function getUnassignedPayments(): Promise<PaymentDto[]> {
  const payments = await prisma.payment.findMany({
    where: {
      status: "unassigned",
      orderId: null,
    },
    orderBy: { createdAt: "desc" },
  })

  return payments.map(mapPayment)
}

export type SyncTikkiePaymentsResult = {
  newPayments: number
  existingPayments: number
  errors: string[]
}

/**
 * Syncs payments from Tikkie Open Payment API and creates Payment records.
 * Fetches all payments for a payment request token and stores new ones.
 */
export async function syncTikkiePayments(
  paymentRequestToken: string
): Promise<SyncTikkiePaymentsResult> {
  const result: SyncTikkiePaymentsResult = {
    newPayments: 0,
    existingPayments: 0,
    errors: [],
  }

  try {
    // Fetch payments from Tikkie API
    const tikkieResponse = await getPaymentRequestPayments(paymentRequestToken)

    // The response has a 'payments' array with payment objects
    const tikkiePayments = tikkieResponse.payments as Array<{
      paymentId: string
      payerName: string
      payerAccountNumber?: string
      amountPaidInCents: number
      paidAt: string
    }>

    for (const tPayment of tikkiePayments) {
      // Check if payment already exists by sourceId
      const existing = await prisma.payment.findFirst({
        where: {
          source: "tikkie",
          sourceId: tPayment.paymentId,
        },
      })

      if (existing) {
        result.existingPayments++
        continue
      }

      // Create new Payment record
      await prisma.payment.create({
        data: {
          source: "tikkie",
          sourceId: tPayment.paymentId,
          payerName: tPayment.payerName,
          payerAccountNumber: tPayment.payerAccountNumber || null,
          amountMinor: tPayment.amountPaidInCents,
          paidAt: new Date(tPayment.paidAt),
          status: "unassigned",
          providerPayload: tPayment as unknown as Prisma.JsonValue,
        },
      })
      result.newPayments++
    }
  } catch (error) {
    result.errors.push(error instanceof Error ? error.message : "Unknown error")
  }

  return result
}

export type AutoMatchResult = {
  autoMatched: number
  ambiguous: number
  unchanged: number
}

/**
 * Automatically matches unassigned payments to orders by payerName -> buyerName exact match.
 * - Single match: status = 'auto_matched', orderId set
 * - Multiple matches: status = 'ambiguous' (manual review)
 * - No match: status remains 'unassigned'
 */
export async function autoMatchPayments(): Promise<AutoMatchResult> {
  const result: AutoMatchResult = {
    autoMatched: 0,
    ambiguous: 0,
    unchanged: 0,
  }

  // Get all unassigned payments with payerName
  const unassignedPayments = await prisma.payment.findMany({
    where: {
      status: "unassigned",
      payerName: { not: "" },
    },
  })

  for (const payment of unassignedPayments) {
    // Find orders where buyerName exactly matches payerName
    const matchingOrders = await prisma.ticketTailorOrder.findMany({
      where: {
        buyerName: {
          equals: payment.payerName,
          mode: "insensitive",
        },
      },
      select: { id: true },
    })

    if (matchingOrders.length === 0) {
      // No match - remains unassigned
      result.unchanged++
    } else if (matchingOrders.length === 1) {
      // Exact single match - auto-assign
      await prisma.payment.update({
        where: { id: payment.id },
        data: {
          orderId: matchingOrders[0].id,
          status: "auto_matched",
          matchedAt: new Date(),
          matchedBy: "auto",
        },
      })
      result.autoMatched++
    } else {
      // Multiple matches - ambiguous, needs manual review
      await prisma.payment.update({
        where: { id: payment.id },
        data: {
          status: "ambiguous",
        },
      })
      result.ambiguous++
    }
  }

  return result
}
