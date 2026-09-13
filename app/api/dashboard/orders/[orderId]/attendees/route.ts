import { NextResponse } from "next/server"

import { requireApiUser } from "@/lib/auth/server"
import { api } from "@/lib/convex/api"
import { convexMutation } from "@/lib/convex/server"
import type { Id } from "@/convex/_generated/dataModel"

export const dynamic = "force-dynamic"

function badRequest(message: string) {
  return NextResponse.json(
    { error: { code: "BAD_REQUEST", message } },
    { status: 400 }
  )
}

export async function POST(
  request: Request,
  context: { params: Promise<{ orderId: string }> }
) {
  const authResult = await requireApiUser()
  if (authResult instanceof NextResponse) return authResult

  try {
    const { orderId: rawOrderId } = await context.params
    const orderId = rawOrderId.trim()
    if (!orderId) return badRequest("Invalid orderId")

    let body: unknown
    try {
      body = await request.json()
    } catch {
      return badRequest("Request body must be valid JSON")
    }
    if (!body || typeof body !== "object" || Array.isArray(body)) {
      return badRequest("Request body must be a JSON object")
    }

    const input = body as Record<string, unknown>
    const allowedKeys = new Set(["eventId", "name", "email", "ticketTypeId"])
    for (const key of Object.keys(input)) {
      if (!allowedKeys.has(key)) {
        return badRequest(
          `Unexpected field '${key}'. Allowed fields: eventId, name, email, ticketTypeId.`
        )
      }
    }

    const eventId = typeof input.eventId === "string" ? input.eventId.trim() : ""
    if (!eventId) return badRequest("eventId is required")

    const name = typeof input.name === "string" ? input.name.trim() : ""
    if (!name) return badRequest("name is required")

    const ticketTypeId =
      typeof input.ticketTypeId === "string" ? input.ticketTypeId.trim() : ""
    if (!ticketTypeId) return badRequest("ticketTypeId is required")

    if (input.email !== undefined && input.email !== null && typeof input.email !== "string") {
      return badRequest("Invalid email. Expected a string or null.")
    }

    const email = typeof input.email === "string" ? input.email.trim() || undefined : undefined
    const result = await convexMutation(api.attendees.addAttendeeToOrder as any, {
      orderId: orderId as Id<"orders">,
      eventId: eventId as Id<"events">,
      name,
      ...(email ? { email } : {}),
      ticketTypeId: ticketTypeId as Id<"ticketTypes">,
    })

    return NextResponse.json({ ok: true, ...result })
  } catch (error) {
    console.error("Error adding attendee to order:", error)
    const message = (error instanceof Error ? error.message : "Invalid request")
      .replace(/^Convex mutation failed:\s*/, "")

    if (message.includes("not found")) {
      return NextResponse.json(
        { error: { code: "NOT_FOUND", message } },
        { status: 404 }
      )
    }
    if (
      message.startsWith("Attendee") ||
      message.startsWith("Order") ||
      message.startsWith("Ticket type") ||
      message.startsWith("Cannot") ||
      message.includes("does not belong") ||
      message.includes("ArgumentValidationError") ||
      message.includes("Invalid ID")
    ) {
      return badRequest(message)
    }

    return NextResponse.json(
      { error: { code: "INTERNAL_ERROR", message: "Failed to add attendee" } },
      { status: 500 }
    )
  }
}
