import { getPaymentRequestPayments } from "@/lib/integrations/tikkie/client"

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
  newPayments: number
  existingPayments: number
  errors: string[]
}

export type AutoMatchResult = {
  autoMatched: number
  ambiguous: number
  unchanged: number
}

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
    orderId: input.orderId.trim(),
    amountMinor: normalizeAmountMinor(input.amountMinor),
    paidAt: normalizePaidAt(input.paidAt),
    payerName: normalizePayerName(input.payerName),
    payerAccountNumber: input.payerAccountNumber?.trim() ?? undefined,
    reference: input.reference?.trim() ?? undefined,
    notes: input.notes?.trim() ?? undefined,
  }

  const id = await convexMutation<
    {
      source: "bank_transfer"
      orderId: string
      amountMinor: number
      paidAt: number
      payerName: string
      payerAccountNumber?: string
      reference?: string
      notes?: string
      matchedBy: string
    },
    string
  >("payments/createPayment", {
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

  const payment = await convexQuery<{ paymentId: string }, PaymentDto>(
    "payments/getPaymentById",
    { paymentId: id as any }
  )

  return payment
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
    notes: input.notes?.trim() ?? undefined,
  }

  const id = await convexMutation<
    {
      source: "cash"
      orderId: string
      amountMinor: number
      paidAt: number
      payerName: string
      notes?: string
      matchedBy: string
    },
    string
  >("payments/createPayment", {
    source: "cash",
    orderId: validated.orderId,
    amountMinor: validated.amountMinor,
    paidAt: validated.paidAt,
    payerName: validated.payerName,
    notes: validated.notes,
    matchedBy: userId,
  })

  const payment = await convexQuery<{ paymentId: string }, PaymentDto>(
    "payments/getPaymentById",
    { paymentId: id as any }
  )

  return payment
}

export async function assignPaymentToOrder(
  paymentId: string,
  input: AssignPaymentInput,
  userId: string
): Promise<PaymentDto> {
  const validatedOrderId = input.orderId.trim()

  await convexMutation<
    {
      paymentId: string
      orderId: string
      status: "manual_assignment"
      matchedBy: string
    },
    string
  >("payments/assignPaymentToOrder", {
    paymentId: paymentId as any,
    orderId: validatedOrderId,
    status: "manual_assignment",
    matchedBy: userId,
  })

  const payment = await convexQuery<{ paymentId: string }, PaymentDto>(
    "payments/getPaymentById",
    { paymentId: paymentId as any }
  )

  return payment
}

export async function getPaymentById(id: string): Promise<PaymentDto | null> {
  try {
    return await convexQuery<{ paymentId: string }, PaymentDto>(
      "payments/getPaymentById",
      { paymentId: id as any }
    )
  } catch {
    return null
  }
}

export async function listPayments(
  input: ListPaymentsInput = {}
): Promise<ListPaymentsResult> {
  const payments = await convexQuery<
    {
      orderId?: string
      source?: PaymentSource
      status?: PaymentMatchStatus
    },
    PaymentDto[]
  >("payments/getPayments", {
    orderId: input.orderId,
    source: input.source,
    status: input.status,
  })

  return {
    payments,
    total: payments.length,
  }
}

export async function getUnassignedPayments(): Promise<PaymentDto[]> {
  return convexQuery<{}, PaymentDto[]>("payments/getUnassignedPayments", {})
}

export async function syncTikkiePayments(
  paymentRequestToken: string
): Promise<SyncTikkiePaymentsResult> {
  const result: SyncTikkiePaymentsResult = {
    newPayments: 0,
    existingPayments: 0,
    errors: [],
  }

  try {
    const tikkieResponse = await getPaymentRequestPayments(paymentRequestToken)

    const tikkiePayments = tikkieResponse.payments as Array<{
      paymentId: string
      payerName: string
      payerAccountNumber?: string
      amountPaidInCents: number
      paidAt: string
    }>

    for (const tPayment of tikkiePayments) {
      const existing = await convexQuery<
        {
          source: "tikkie"
          sourceId: string
        },
        PaymentDto[]
      >("payments/getPayments", {
        source: "tikkie",
        sourceId: tPayment.paymentId,
      })

      if (existing.length > 0) {
        result.existingPayments++
        continue
      }

      await convexMutation<
        {
          source: "tikkie"
          sourceId: string
          payerName: string
          payerAccountNumber?: string
          amountMinor: number
          paidAt: number
          providerPayload: unknown
        },
        string
      >("payments/createPayment", {
        source: "tikkie",
        sourceId: tPayment.paymentId,
        payerName: tPayment.payerName,
        payerAccountNumber: tPayment.payerAccountNumber,
        amountMinor: tPayment.amountPaidInCents,
        paidAt: new Date(tPayment.paidAt).getTime(),
        providerPayload: tPayment,
      })
      result.newPayments++
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

  const unassignedPayments = await convexQuery<{}, PaymentDto[]>(
    "payments/getUnassignedPayments",
    {}
  )

  for (const payment of unassignedPayments) {
    const matchingOrders = await convexQuery<
      { status: "paid" },
      Array<{ _id: string; buyerName: string | null }>
    >("orders/getOrders", { status: "paid" })

    const matches = matchingOrders.filter(
      (o) => o.buyerName?.toLowerCase() === payment.payerName.toLowerCase()
    )

    if (matches.length === 0) {
      result.unchanged++
    } else if (matches.length === 1) {
      await convexMutation<
        {
          paymentId: string
          orderId: string
          status: "auto_matched"
          matchedBy: string
        },
        string
      >("payments/assignPaymentToOrder", {
        paymentId: payment._id as any,
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
