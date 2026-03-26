import { NextResponse } from "next/server"

import { requireApiUser } from "@/lib/auth/server"
import { runTicketTailorSync, type TicketTailorSyncScopeInput } from "@/lib/integrations/ticket-tailor/sync"

function isNonEmptyString(value: unknown): value is string {
  return typeof value === "string" && value.trim().length > 0
}

function parseScopeDate(value: unknown, field: "from" | "to") {
  if (value === undefined || value === null || value === "") {
    return null
  }

  if (typeof value !== "string") {
    throw new Error(`Invalid '${field}' date. Provide an ISO-8601 date string.`)
  }

  const parsed = new Date(value)

  if (Number.isNaN(parsed.getTime())) {
    throw new Error(`Invalid '${field}' date. Provide an ISO-8601 date string.`)
  }

  return parsed
}

async function parseManualSyncScope(request: Request): Promise<TicketTailorSyncScopeInput> {
  const contentLength = request.headers.get("content-length")

  if (contentLength === "0") {
    return {}
  }

  const rawBody = await request.text()

  if (!rawBody.trim()) {
    return {}
  }

  let payload: unknown

  try {
    payload = JSON.parse(rawBody)
  } catch {
    throw new Error("Invalid JSON payload")
  }

  if (typeof payload !== "object" || payload === null || Array.isArray(payload)) {
    throw new Error("Request body must be a JSON object")
  }

  const body = payload as Record<string, unknown>
  const eventId = isNonEmptyString(body.eventId) ? body.eventId.trim() : null
  const from = parseScopeDate(body.from, "from")
  const to = parseScopeDate(body.to, "to")

  if (from && to && from.getTime() > to.getTime()) {
    throw new Error("Invalid date range. 'from' must be less than or equal to 'to'.")
  }

  return {
    eventId,
    from,
    to,
  }
}

export async function POST(request: Request) {
  const authResult = await requireApiUser()

  if (authResult instanceof NextResponse) {
    return authResult
  }

  try {
    const scope = await parseManualSyncScope(request)
    const summary = await runTicketTailorSync(scope)

    return NextResponse.json({
      ok: true,
      runId: summary.runId,
      status: summary.status,
      scope: summary.scope,
      counts: summary.counts,
      diagnostics: summary.diagnostics,
    })
  } catch (error) {
    const message = error instanceof Error ? error.message : "Ticket Tailor sync failed"

    if (
      message.startsWith("Invalid") ||
      message.includes("must be") ||
      message.includes("Request body")
    ) {
      return NextResponse.json(
        {
          error: {
            code: "BAD_REQUEST",
            message,
          },
        },
        { status: 400 },
      )
    }

    return NextResponse.json(
      {
        error: {
          code: "SYNC_FAILED",
          message: "Ticket Tailor sync failed",
        },
        diagnostics: {
          detail: message,
        },
      },
      { status: 500 },
    )
  }
}
