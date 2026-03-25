import type { Prisma } from "@prisma/client"

import { prisma } from "@/lib/prisma"

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
