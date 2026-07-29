import { NextResponse } from "next/server"

import { requireApiUser } from "@/lib/auth/server"
import type { Id } from "@/convex/_generated/dataModel"
import { api } from "@/lib/convex/api"
import { convexMutation, convexQuery } from "@/lib/convex/server"

type DonationSource = "cash" | "bank_transfer"

const allowedSources: DonationSource[] = ["cash", "bank_transfer"]

function parseDonationFilters(request: Request) {
  const params = new URL(request.url).searchParams
  const eventIdParam = params.get("eventId")

  const eventId =
    eventIdParam && eventIdParam.trim()
      ? (eventIdParam.trim() as Id<"events">)
      : undefined

  return { eventId }
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
    const { eventId } = parseDonationFilters(request)

    const donations = await convexQuery(api.payments.getStandaloneDonations, {
      eventId,
    })

    return NextResponse.json({
      donations: donations.map((d: {
        _id: string
        source: string
        payerName: string
        amountMinor: number
        paidAt: number
        eventId: string | null
        notes: string | null
      }) => ({
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
    console.error("Failed to load donations:", error)
    return NextResponse.json(
      {
        error: {
          code: "INTERNAL_ERROR",
          message: "Failed to load donations",
        },
      },
      { status: 500 }
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
      message: "Donation created successfully",
    })
  } catch (error) {
    const message =
      error instanceof Error ? error.message : "Failed to create donation"

    if (
      message.includes("required") ||
      message.includes("must be") ||
      message.includes("Invalid")
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
