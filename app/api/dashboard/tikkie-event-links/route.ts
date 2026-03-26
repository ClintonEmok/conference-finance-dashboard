import { NextResponse } from "next/server"
import { requireApiUser } from "@/lib/auth/server"
import { createEventTikkieLink } from "@/lib/domain/finance/tikkie-event-links"
import { manuallyMatchTikkiePayment } from "@/lib/domain/finance/tikkie-event-payments"
import { TikkieApiError } from "@/lib/integrations/tikkie/client"
import { api } from "@/lib/convex/api"
import { convexQuery } from "@/lib/convex/server"

function badRequest(message: string) {
  return NextResponse.json(
    { error: { code: "BAD_REQUEST", message } },
    { status: 400 }
  )
}

function parseAmountMinor(
  value: unknown
): { amountMinor: number | undefined } | { error: string } {
  if (value === undefined) {
    return { amountMinor: undefined }
  }

  if (!Number.isInteger(value) || Number(value) < 0) {
    return {
      error: "'amountMinor' must be a non-negative integer when provided",
    }
  }

  return { amountMinor: Number(value) }
}

export async function GET(request: Request) {
  const authResult = await requireApiUser()
  if (authResult instanceof NextResponse) return authResult

  const url = new URL(request.url)
  const eventId = url.searchParams.get("eventId")
  if (!eventId) return badRequest("Missing 'eventId' parameter")

  try {
    const link = await convexQuery(api.tikkie.getEventPaymentLink, { eventId })
    if (!link) {
      return NextResponse.json({
        link: null,
        payments: [],
        stats: {
          totalPayments: 0,
          matchedPayments: 0,
          unmatchedPayments: 0,
          totalAmountMinor: 0,
        },
      })
    }

    const payments = await convexQuery(api.tikkie.getTikkiePaymentsByLink, {
      paymentLinkId: link._id,
    })

    const matchedPayments = (payments as Array<Record<string, unknown>>).filter(
      (p) => p.matchStatus !== "unmatched"
    )
    const unmatchedPayments = (
      payments as Array<Record<string, unknown>>
    ).filter((p) => p.matchStatus === "unmatched")
    const totalAmountMinor = (
      payments as Array<Record<string, unknown>>
    ).reduce((sum, p) => sum + ((p.amountMinor as number) ?? 0), 0)

    return NextResponse.json({
      link,
      payments,
      stats: {
        totalPayments: (payments as unknown[]).length,
        matchedPayments: matchedPayments.length,
        unmatchedPayments: unmatchedPayments.length,
        totalAmountMinor,
      },
    })
  } catch (error) {
    const message =
      error instanceof Error
        ? error.message
        : "Failed to fetch event Tikkie data"
    return badRequest(message)
  }
}

export async function POST(request: Request) {
  const authResult = await requireApiUser()
  if (authResult instanceof NextResponse) return authResult

  let body: Record<string, unknown>
  try {
    body = await request.json()
  } catch {
    return badRequest("Request body must be valid JSON")
  }

  const eventId = typeof body.eventId === "string" ? body.eventId : undefined
  const providerEventId =
    typeof body.providerEventId === "string" ? body.providerEventId : undefined
  if (!eventId || !providerEventId) {
    return badRequest("'eventId' and 'providerEventId' are required")
  }

  const parsedAmountMinor = parseAmountMinor(body.amountMinor)
  if ("error" in parsedAmountMinor) {
    return badRequest(parsedAmountMinor.error)
  }

  try {
    const result = await createEventTikkieLink({
      eventId,
      providerEventId,
      amountMinor: parsedAmountMinor.amountMinor,
      description:
        typeof body.description === "string" ? body.description : undefined,
      expiryDays:
        typeof body.expiryDays === "number" ? body.expiryDays : undefined,
    })

    return NextResponse.json(
      { ok: true, created: result.created, link: result.link },
      { status: result.created ? 201 : 200 }
    )
  } catch (error) {
    if (error instanceof TikkieApiError) {
      return NextResponse.json(
        { error: { code: `TIKKIE_${error.kind}`, message: error.message } },
        { status: error.status >= 500 ? 502 : error.status }
      )
    }
    const message =
      error instanceof Error
        ? error.message
        : "Failed to create event Tikkie link"
    return badRequest(message)
  }
}

export async function PATCH(request: Request) {
  const authResult = await requireApiUser()
  if (authResult instanceof NextResponse) return authResult

  let body: Record<string, unknown>
  try {
    body = await request.json()
  } catch {
    return badRequest("Request body must be valid JSON")
  }

  const paymentId =
    typeof body.paymentId === "string" ? body.paymentId : undefined
  const orderId = typeof body.orderId === "string" ? body.orderId : undefined
  if (!paymentId || !orderId) {
    return badRequest("'paymentId' and 'orderId' are required")
  }

  try {
    const result = await manuallyMatchTikkiePayment(paymentId, orderId)
    return NextResponse.json({ ok: true, result })
  } catch (error) {
    const message =
      error instanceof Error ? error.message : "Failed to match payment"
    return badRequest(message)
  }
}
