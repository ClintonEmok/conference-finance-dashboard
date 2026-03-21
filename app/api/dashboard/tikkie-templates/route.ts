import { headers } from "next/headers"
import { NextResponse } from "next/server"

import { auth } from "@/lib/auth"
import {
  createTemplate,
  deleteTemplate,
  getTemplatesByEvent,
  getTemplatesWithAttendeeCounts,
  updateTemplate,
} from "@/lib/domain/finance/tikkie-templates"

export const dynamic = "force-dynamic"

export async function GET(request: Request) {
  const session = await auth.api.getSession({
    headers: await headers(),
  })

  if (!session) {
    return NextResponse.json(
      {
        error: {
          code: "UNAUTHORIZED",
          message: "Authentication required",
        },
      },
      { status: 401 },
    )
  }

  try {
    const params = new URL(request.url).searchParams
    const eventId = params.get("eventId")

    if (!eventId || !eventId.trim()) {
      return NextResponse.json(
        {
          error: {
            code: "BAD_REQUEST",
            message: "Missing required query parameter: eventId",
          },
        },
        { status: 400 },
      )
    }

    const summary = params.get("summary") === "1"

    if (summary) {
      const summaries = await getTemplatesWithAttendeeCounts(eventId.trim())
      return NextResponse.json({ templates: summaries })
    }

    const templates = await getTemplatesByEvent(eventId.trim())
    return NextResponse.json({ templates })
  } catch (error) {
    const message = error instanceof Error ? error.message : "Invalid request"

    if (message.startsWith("Invalid")) {
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
          code: "INTERNAL_ERROR",
          message: "Failed to load templates",
        },
      },
      { status: 500 },
    )
  }
}

export async function POST(request: Request) {
  const session = await auth.api.getSession({
    headers: await headers(),
  })

  if (!session) {
    return NextResponse.json(
      {
        error: {
          code: "UNAUTHORIZED",
          message: "Authentication required",
        },
      },
      { status: 401 },
    )
  }

  try {
    const body = (await request.json()) as unknown

    if (!body || typeof body !== "object") {
      return NextResponse.json(
        {
          error: {
            code: "BAD_REQUEST",
            message: "Request body must be a JSON object",
          },
        },
        { status: 400 },
      )
    }

    const input = body as Record<string, unknown>
    const template = await createTemplate({
      eventId: input.eventId as string,
      ticketTypeLabel: input.ticketTypeLabel as string,
      amountMinor: Number(input.amountMinor),
      descriptionTemplate: input.descriptionTemplate as string,
      expiryDays: input.expiryDays !== undefined ? Number(input.expiryDays) : undefined,
    })

    return NextResponse.json({ template }, { status: 201 })
  } catch (error) {
    const message = error instanceof Error ? error.message : "Invalid request"

    if (message.startsWith("Invalid") || message.includes("not found")) {
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
          code: "INTERNAL_ERROR",
          message: "Failed to create template",
        },
      },
      { status: 500 },
    )
  }
}

export async function PUT(request: Request) {
  const session = await auth.api.getSession({
    headers: await headers(),
  })

  if (!session) {
    return NextResponse.json(
      {
        error: {
          code: "UNAUTHORIZED",
          message: "Authentication required",
        },
      },
      { status: 401 },
    )
  }

  try {
    const body = (await request.json()) as unknown

    if (!body || typeof body !== "object") {
      return NextResponse.json(
        {
          error: {
            code: "BAD_REQUEST",
            message: "Request body must be a JSON object",
          },
        },
        { status: 400 },
      )
    }

    const input = body as Record<string, unknown>
    const template = await updateTemplate({
      id: input.id as string,
      amountMinor: Number(input.amountMinor),
      descriptionTemplate: input.descriptionTemplate as string,
      expiryDays: input.expiryDays !== undefined ? Number(input.expiryDays) : undefined,
      isActive: input.isActive !== undefined ? Boolean(input.isActive) : undefined,
    })

    return NextResponse.json({ template })
  } catch (error) {
    const message = error instanceof Error ? error.message : "Invalid request"

    if (message.startsWith("Invalid") || message.includes("not found")) {
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
          code: "INTERNAL_ERROR",
          message: "Failed to update template",
        },
      },
      { status: 500 },
    )
  }
}

export async function DELETE(request: Request) {
  const session = await auth.api.getSession({
    headers: await headers(),
  })

  if (!session) {
    return NextResponse.json(
      {
        error: {
          code: "UNAUTHORIZED",
          message: "Authentication required",
        },
      },
      { status: 401 },
    )
  }

  try {
    const params = new URL(request.url).searchParams
    const id = params.get("id")

    if (!id || !id.trim()) {
      return NextResponse.json(
        {
          error: {
            code: "BAD_REQUEST",
            message: "Missing required query parameter: id",
          },
        },
        { status: 400 },
      )
    }

    const template = await deleteTemplate(id.trim())
    return NextResponse.json({ template })
  } catch (error) {
    const message = error instanceof Error ? error.message : "Invalid request"

    if (message.startsWith("Invalid") || message.includes("not found")) {
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
          code: "INTERNAL_ERROR",
          message: "Failed to delete template",
        },
      },
      { status: 500 },
    )
  }
}
