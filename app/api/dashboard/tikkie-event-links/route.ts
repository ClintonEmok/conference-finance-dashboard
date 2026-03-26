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

function parseAmountEuro(
  value: unknown
): { amountMinor: number | undefined } | { error: string } {
  if (value === undefined) {
    return { amountMinor: undefined }
  }

  if (typeof value !== "string") {
    return { error: "'amountEuro' must be a string when provided" }
  }

  const normalized = value.trim().replace(",", ".")
  if (!normalized) {
    return { error: "'amountEuro' cannot be empty" }
  }

  if (!/^\d+(\.\d{1,2})?$/.test(normalized)) {
    return {
      error: "'amountEuro' must be a non-negative number with up to 2 decimals",
    }
  }

  const euros = Number(normalized)
  if (!Number.isFinite(euros) || euros < 0) {
    return {
      error: "'amountEuro' must be a non-negative number with up to 2 decimals",
    }
  }

  return { amountMinor: Math.round(euros * 100) }
}

function parseExpiryDate(
  value: unknown
): { expiryDate: string | undefined } | { error: string } {
  if (value === undefined) {
    return { expiryDate: undefined }
  }

  if (typeof value !== "string") {
    return { error: "'expiryDate' must be a string when provided" }
  }

  const normalized = value.trim()
  if (!/^\d{4}-\d{2}-\d{2}$/.test(normalized)) {
    return { error: "'expiryDate' must use YYYY-MM-DD format" }
  }

  const parsed = new Date(`${normalized}T00:00:00.000Z`)
  if (Number.isNaN(parsed.getTime())) {
    return { error: "'expiryDate' is invalid" }
  }

  return { expiryDate: normalized }
}

export async function GET(request: Request) {
  const authResult = await requireApiUser()
  if (authResult instanceof NextResponse) return authResult

  const url = new URL(request.url)
  const eventId = url.searchParams.get("eventId")
  if (!eventId) return badRequest("Missing 'eventId' parameter")

  try {
    const allLinks = await convexQuery(api.tikkie.getPaymentLinks, {})
    const links = (allLinks as Array<Record<string, unknown>>)
      .filter((link) => link.linkType === "event" && link.eventId === eventId)
      .sort((a, b) => {
        const timeDiff =
          ((b._creationTime as number | undefined) ?? 0) -
          ((a._creationTime as number | undefined) ?? 0)
        if (timeDiff !== 0) return timeDiff
        return String(b._id).localeCompare(String(a._id))
      })

    if (links.length === 0) {
      return NextResponse.json({
        link: null,
        links: [],
        payments: [],
        stats: {
          totalPayments: 0,
          matchedPayments: 0,
          unmatchedPayments: 0,
          totalAmountMinor: 0,
        },
      })
    }

    const paymentGroups = await Promise.all(
      links.map((link) =>
        convexQuery(api.tikkie.getTikkiePaymentsByLink, {
          paymentLinkId: String(link._id),
        })
      )
    )

    const payments = paymentGroups.flat()

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
      link: links[0],
      links,
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

  const parsedAmountEuro = parseAmountEuro(body.amountEuro)
  if ("error" in parsedAmountEuro) {
    return badRequest(parsedAmountEuro.error)
  }

  const parsedAmountMinor =
    parsedAmountEuro.amountMinor !== undefined
      ? parsedAmountEuro
      : parseAmountMinor(body.amountMinor)
  if ("error" in parsedAmountMinor) {
    return badRequest(parsedAmountMinor.error)
  }

  const parsedExpiryDate = parseExpiryDate(body.expiryDate)
  if ("error" in parsedExpiryDate) {
    return badRequest(parsedExpiryDate.error)
  }

  try {
    const result = await createEventTikkieLink({
      eventId,
      providerEventId,
      amountMinor: parsedAmountMinor.amountMinor,
      description:
        typeof body.description === "string" ? body.description : undefined,
      expiryDate: parsedExpiryDate.expiryDate,
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
