import { NextResponse } from "next/server"

import { requireApiUser } from "@/lib/auth/server"
import { createBankTransferPayment } from "@/lib/domain/finance/payments"

type CreateBody = {
  orderId?: unknown
  amountMinor?: unknown
  paidAt?: unknown
  payerName?: unknown
  payerAccountNumber?: unknown
  reference?: unknown
  notes?: unknown
}

function badRequest(message: string) {
  return NextResponse.json(
    {
      error: {
        code: "BAD_REQUEST",
        message,
      },
    },
    { status: 400 }
  )
}

function unauthorized() {
  return NextResponse.json(
    {
      error: {
        code: "UNAUTHORIZED",
        message: "Authentication required",
      },
    },
    { status: 401 }
  )
}

function parseRequiredString(value: unknown, fieldName: string) {
  if (typeof value !== "string") {
    throw new Error(`Invalid '${fieldName}'. Expected a string.`)
  }

  const normalized = value.trim()

  if (!normalized) {
    throw new Error(`Invalid '${fieldName}'. Value is required.`)
  }

  return normalized
}

function parseOptionalString(value: unknown, fieldName: string) {
  if (value === undefined || value === null) {
    return undefined
  }

  if (typeof value !== "string") {
    throw new Error(`Invalid '${fieldName}'. Expected a string.`)
  }

  const normalized = value.trim()
  return normalized || undefined
}

function parseAmountMinor(value: unknown) {
  if (typeof value !== "number" || !Number.isInteger(value) || value <= 0) {
    throw new Error(
      "Invalid 'amountMinor'. Expected a positive integer in cents."
    )
  }

  return value
}

function parseCreateBody(body: CreateBody) {
  return {
    orderId: parseRequiredString(body.orderId, "orderId"),
    amountMinor: parseAmountMinor(body.amountMinor),
    paidAt: parseRequiredString(body.paidAt, "paidAt"),
    payerName: parseRequiredString(body.payerName, "payerName"),
    payerAccountNumber: parseOptionalString(
      body.payerAccountNumber,
      "payerAccountNumber"
    ),
    reference: parseOptionalString(body.reference, "reference"),
    notes: parseOptionalString(body.notes, "notes"),
  }
}

export async function POST(request: Request) {
  const authResult = await requireApiUser()

  if (authResult instanceof NextResponse) {
    return authResult
  }

  let payload: CreateBody

  try {
    payload = (await request.json()) as CreateBody
  } catch {
    return badRequest("Request body must be valid JSON")
  }

  try {
    const input = parseCreateBody(payload)
    const payment = await createBankTransferPayment(input, authResult.userId)

    return NextResponse.json(
      {
        ok: true,
        payment,
      },
      { status: 201 }
    )
  } catch (error) {
    const message = error instanceof Error ? error.message : "Invalid request"

    if (
      message.startsWith("Invalid") ||
      message.includes("required") ||
      message.includes("not found")
    ) {
      return badRequest(message)
    }

    return NextResponse.json(
      {
        error: {
          code: "INTERNAL_ERROR",
          message: "Failed to create bank transfer payment",
        },
      },
      { status: 500 }
    )
  }
}
