import { NextResponse } from "next/server"

import { requireApiUser } from "@/lib/auth/server"
import type { Id } from "@/convex/_generated/dataModel"
import { api } from "@/lib/convex/api"
import { convexMutation } from "@/lib/convex/server"
import { listStandaloneDonations } from "@/lib/domain/finance/standalone-donations"

type DonationSource = "cash" | "bank_transfer"

const allowedSources: DonationSource[] = ["cash", "bank_transfer"]

function parseDonationFilters(request: Request) {
  const params = new URL(request.url).searchParams
  const eventIdParam = params.get("eventId")
  const fromParam = params.get("from")
  const toParam = params.get("to")

  const eventId =
    eventIdParam && eventIdParam.trim()
      ? (eventIdParam.trim() as Id<"events">)
      : undefined
  const from = fromParam ? new Date(fromParam) : null
  const to = toParam ? new Date(toParam) : null

  if (from && Number.isNaN(from.getTime())) {
    throw new Error("Invalid 'from' date")
  }

  if (to && Number.isNaN(to.getTime())) {
    throw new Error("Invalid 'to' date")
  }

  if (from && to && from.getTime() > to.getTime()) {
    throw new Error("Invalid date range")
  }

  return {
    eventId,
    from: from?.getTime(),
    to: to?.getTime(),
  }
}

function parseDonationBody(body: unknown) {
  if (!body || typeof body !== "object") {
    throw new Error("Invalid request body")
  }

  const data = body as Record<string, unknown>

  if (!data.eventId || typeof data.eventId !== "string") {
    throw new Error("eventId is required")
  }

  if (!data.payerName || typeof data.payerName !== "string") {
    throw new Error("payerName is required")
  }

  if (
    typeof data.amountMinor !== "number" ||
    !Number.isInteger(data.amountMinor) ||
    data.amountMinor <= 0
  ) {
    throw new Error("amountMinor must be a positive integer")
  }

  if (typeof data.paidAt !== "number" || !Number.isFinite(data.paidAt)) {
    throw new Error("paidAt must be a valid timestamp")
  }

  if (
    !data.source ||
    typeof data.source !== "string" ||
    !allowedSources.includes(data.source as DonationSource)
  ) {
    throw new Error(`source must be one of: ${allowedSources.join(", ")}`)
  }

  return {
    eventId: data.eventId as Id<"events">,
    payerName: data.payerName as string,
    amountMinor: data.amountMinor as number,
    paidAt: data.paidAt as number,
    source: data.source as DonationSource,
    notes: typeof data.notes === "string" ? data.notes : undefined,
  }
}

export async function GET(request: Request) {
  const authResult = await requireApiUser()

  if (authResult instanceof NextResponse) {
    return authResult
  }

  try {
    const { eventId, from, to } = parseDonationFilters(request)

    const donations = await listStandaloneDonations({
      eventId,
      from,
      to,
    })

    return NextResponse.json({
      donations: donations.map((d) => ({
        id: d._id,
        source: d.source,
        payerName: d.payerName,
        amountMinor: d.amountMinor,
        paidAt: new Date(d.paidAt).toISOString(),
        eventId: d.eventId,
        notes: d.notes,
      })),
    })
  } catch (error) {
    const message = error instanceof Error ? error.message : "Failed to load donations"
    const isBadRequest = message.startsWith("Invalid")

    console.error("Failed to load donations:", error)
    return NextResponse.json(
      {
        error: {
          code: isBadRequest ? "BAD_REQUEST" : "INTERNAL_ERROR",
          message: isBadRequest ? message : "Failed to load donations",
        },
      },
      { status: isBadRequest ? 400 : 500 }
    )
  }
}

export async function POST(request: Request) {
  const authResult = await requireApiUser()

  if (authResult instanceof NextResponse) {
    return authResult
  }

  try {
    const body = await request.json()
    const donation = parseDonationBody(body)

    const id = await convexMutation(api.payments.createStandaloneDonation, {
      eventId: donation.eventId,
      payerName: donation.payerName,
      amountMinor: donation.amountMinor,
      paidAt: donation.paidAt,
      source: donation.source,
      notes: donation.notes,
    })

    return NextResponse.json({
      id,
      donation: {
        id,
        eventId: donation.eventId,
        payerName: donation.payerName,
        amountMinor: donation.amountMinor,
        paidAt: new Date(donation.paidAt).toISOString(),
        source: donation.source,
        notes: donation.notes ?? null,
      },
      message: "Donation created successfully",
    })
  } catch (error) {
    const message =
      error instanceof Error ? error.message : "Failed to create donation"

    if (
      message.includes("required") ||
      message.includes("must be") ||
      message.includes("Invalid") ||
      message.includes("Event not found")
    ) {
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

    console.error("Failed to create donation:", error)
    return NextResponse.json(
      {
        error: {
          code: "INTERNAL_ERROR",
          message: "Failed to create donation",
        },
      },
      { status: 500 }
    )
  }
}
