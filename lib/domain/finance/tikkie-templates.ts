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

export type TikkiePaymentTemplateDto = {
  id: string
  eventId: string
  ticketTypeLabel: string
  amountMinor: number
  descriptionTemplate: string
  expiryDays: number
  isActive: boolean
  createdAt: string
  updatedAt: string
}

export type CreateTemplateInput = {
  eventId: string
  ticketTypeLabel: string
  amountMinor: number
  descriptionTemplate: string
  expiryDays?: number
}

export type UpdateTemplateInput = {
  id: string
  amountMinor: number
  descriptionTemplate: string
  expiryDays?: number
  isActive?: boolean
}

type ConvexTemplate = {
  _id: string
  _creationTime: number
  eventId: string
  ticketTypeLabel: string
  amountMinor: number
  descriptionTemplate: string
  expiryDays?: number
  isActive?: boolean
}

function mapTemplate(template: ConvexTemplate): TikkiePaymentTemplateDto {
  return {
    id: template._id,
    eventId: template.eventId,
    ticketTypeLabel: template.ticketTypeLabel,
    amountMinor: template.amountMinor,
    descriptionTemplate: template.descriptionTemplate,
    expiryDays: template.expiryDays ?? 14,
    isActive: template.isActive ?? true,
    createdAt: new Date(template._creationTime).toISOString(),
    updatedAt: new Date(template._creationTime).toISOString(),
  }
}

function normalizeTicketTypeLabel(value: string): string {
  const normalized = value.trim()
  if (!normalized) {
    throw new Error("Invalid 'ticketTypeLabel'. Value is required.")
  }
  return normalized
}

function normalizeEventId(value: string): string {
  const normalized = value.trim()
  if (!normalized) {
    throw new Error("Invalid 'eventId'. Value is required.")
  }
  return normalized
}

function normalizeAmountMinor(value: number): number {
  if (!Number.isInteger(value) || value <= 0) {
    throw new Error(
      "Invalid 'amountMinor'. Expected a positive integer in cents."
    )
  }
  return value
}

function normalizeExpiryDays(value: number | undefined): number {
  const days = value ?? 14
  if (!Number.isInteger(days) || days < 1 || days > 365) {
    throw new Error(
      "Invalid 'expiryDays'. Expected an integer between 1 and 365."
    )
  }
  return days
}

function normalizeDescriptionTemplate(value: string): string {
  const normalized = value.trim()
  if (!normalized) {
    throw new Error("Invalid 'descriptionTemplate'. Value is required.")
  }
  if (normalized.length > 200) {
    throw new Error(
      "Invalid 'descriptionTemplate'. Maximum length is 200 characters."
    )
  }
  return normalized
}

export function validateCreateTemplateInput(input: CreateTemplateInput) {
  return {
    eventId: normalizeEventId(input.eventId),
    ticketTypeLabel: normalizeTicketTypeLabel(input.ticketTypeLabel),
    amountMinor: normalizeAmountMinor(input.amountMinor),
    descriptionTemplate: normalizeDescriptionTemplate(
      input.descriptionTemplate
    ),
    expiryDays: normalizeExpiryDays(input.expiryDays),
  }
}

export function validateUpdateTemplateInput(input: UpdateTemplateInput) {
  const normalizedId = input.id.trim()
  if (!normalizedId) {
    throw new Error("Invalid 'id'. Value is required.")
  }
  return {
    id: normalizedId,
    amountMinor: normalizeAmountMinor(input.amountMinor),
    descriptionTemplate: normalizeDescriptionTemplate(
      input.descriptionTemplate
    ),
    expiryDays: normalizeExpiryDays(input.expiryDays),
    isActive: input.isActive ?? true,
  }
}

export async function createTemplate(
  input: CreateTemplateInput
): Promise<TikkiePaymentTemplateDto> {
  const validated = validateCreateTemplateInput(input)

  const eventResult = await convexQuery<{ eventId: string }, unknown | null>(
    "tickettailor:getEventById",
    { eventId: validated.eventId }
  )

  if (!eventResult) {
    throw new Error("Event not found for given 'eventId'.")
  }

  await convexMutation("tikkie:createPaymentTemplate", {
    eventId: validated.eventId,
    ticketTypeLabel: validated.ticketTypeLabel,
    amountMinor: validated.amountMinor,
    descriptionTemplate: validated.descriptionTemplate,
    expiryDays: validated.expiryDays,
    isActive: true,
  })

  const templates = await convexQuery<{ eventId: string }, ConvexTemplate[]>(
    "tikkie:getPaymentTemplates",
    { eventId: validated.eventId }
  )

  const created = templates.find(
    (t) => t.ticketTypeLabel === validated.ticketTypeLabel
  )
  if (!created) {
    throw new Error("Failed to create template")
  }

  return mapTemplate(created)
}

export async function updateTemplate(
  input: UpdateTemplateInput
): Promise<TikkiePaymentTemplateDto> {
  const validated = validateUpdateTemplateInput(input)

  await convexMutation("tikkie:updatePaymentTemplate", {
    templateId: validated.id,
    amountMinor: validated.amountMinor,
    descriptionTemplate: validated.descriptionTemplate,
    expiryDays: validated.expiryDays,
    isActive: validated.isActive,
  })

  const templates = await convexQuery<{ eventId?: string }, ConvexTemplate[]>(
    "tikkie:getPaymentTemplates",
    {}
  )
  const updated = templates.find((t) => t._id === validated.id)

  if (!updated) {
    throw new Error("Template not found for given 'id'.")
  }

  return mapTemplate(updated)
}

export async function deleteTemplate(
  id: string
): Promise<TikkiePaymentTemplateDto> {
  const normalizedId = id.trim()
  if (!normalizedId) {
    throw new Error("Invalid 'id'. Value is required.")
  }

  const templates = await convexQuery<{ eventId?: string }, ConvexTemplate[]>(
    "tikkie:getPaymentTemplates",
    {}
  )
  const existing = templates.find((t) => t._id === normalizedId)

  if (!existing) {
    throw new Error("Template not found for given 'id'.")
  }

  await convexMutation("tikkie:deletePaymentTemplate", {
    templateId: normalizedId,
  })

  return mapTemplate({ ...existing, isActive: false })
}

export async function getTemplatesByEvent(
  eventId: string
): Promise<TikkiePaymentTemplateDto[]> {
  const normalizedEventId = normalizeEventId(eventId)

  const templates = await convexQuery<{ eventId: string }, ConvexTemplate[]>(
    "tikkie:getPaymentTemplates",
    { eventId: normalizedEventId }
  )

  return templates
    .filter((t) => t.isActive ?? true)
    .sort((a, b) => a.ticketTypeLabel.localeCompare(b.ticketTypeLabel))
    .map(mapTemplate)
}

export type TemplateMatchResult = {
  hasTemplate: boolean
  hasOverride: boolean
  amountMinor: number
  description: string
  expiryDate: string
  referenceId: string
  source: "override" | "template" | "default"
  templateId: string | null
}

type AttendeeForMatch = {
  id: string
  eventId: string
  orderId: string
  providerOrderId: string
  providerEventId: string
  ticketTypeLabel: string | null
  tikkieAmountOverrideMinor: number | null
}

export async function matchTemplateForAttendee(
  attendee: AttendeeForMatch
): Promise<TemplateMatchResult> {
  const providerOrderId = attendee.providerOrderId.trim()
  if (!providerOrderId) {
    throw new Error("Invalid attendee. 'providerOrderId' is required.")
  }

  if (
    attendee.tikkieAmountOverrideMinor !== null &&
    attendee.tikkieAmountOverrideMinor > 0
  ) {
    const description = `Order ${providerOrderId}`.slice(0, 35)
    const expiryDate = new Date(Date.now() + 14 * 24 * 60 * 60 * 1000)
      .toISOString()
      .slice(0, 10)
    return {
      hasTemplate: false,
      hasOverride: true,
      amountMinor: attendee.tikkieAmountOverrideMinor,
      description,
      expiryDate,
      referenceId: providerOrderId.slice(0, 35),
      source: "override",
      templateId: null,
    }
  }

  if (attendee.ticketTypeLabel && attendee.ticketTypeLabel.trim()) {
    const template = await convexQuery<
      { eventId: string; ticketTypeLabel: string },
      ConvexTemplate | null
    >("tikkie:getTemplateByEventAndTicketType", {
      eventId: attendee.eventId,
      ticketTypeLabel: attendee.ticketTypeLabel.trim(),
    })

    if (template && (template.isActive ?? true)) {
      const description = template.descriptionTemplate
        .replace(/\{\{name\}\}/gi, "attendee")
        .replace(/\{\{email\}\}/gi, "contact")
        .replace(/\{\{ticketType\}\}/gi, attendee.ticketTypeLabel ?? "")
        .slice(0, 35)

      const expiryDate = new Date(
        Date.now() + (template.expiryDays ?? 14) * 24 * 60 * 60 * 1000
      )
        .toISOString()
        .slice(0, 10)

      return {
        hasTemplate: true,
        hasOverride: false,
        amountMinor: template.amountMinor,
        description,
        expiryDate,
        referenceId: providerOrderId.slice(0, 35),
        source: "template",
        templateId: template._id,
      }
    }
  }

  const description = `Order ${providerOrderId}`.slice(0, 35)
  const expiryDate = new Date(Date.now() + 14 * 24 * 60 * 60 * 1000)
    .toISOString()
    .slice(0, 10)
  return {
    hasTemplate: false,
    hasOverride: false,
    amountMinor: 0,
    description,
    expiryDate,
    referenceId: providerOrderId.slice(0, 35),
    source: "default",
    templateId: null,
  }
}

export type TemplateSummary = {
  eventId: string
  ticketTypeLabel: string
  template: TikkiePaymentTemplateDto | null
  attendeeCount: number
}

export async function getTemplatesWithAttendeeCounts(
  eventId: string
): Promise<TemplateSummary[]> {
  const normalizedEventId = normalizeEventId(eventId)

  const attendees = await convexQuery<
    { eventId: string },
    { ticketTypeLabel?: string }[]
  >("attendees:getAttendeesByEvent", { eventId: normalizedEventId })

  const ticketTypeMap = new Map<string, number>()
  for (const attendee of attendees) {
    if (attendee.ticketTypeLabel) {
      ticketTypeMap.set(
        attendee.ticketTypeLabel,
        (ticketTypeMap.get(attendee.ticketTypeLabel) ?? 0) + 1
      )
    }
  }

  const templates = await convexQuery<{ eventId: string }, ConvexTemplate[]>(
    "tikkie:getPaymentTemplates",
    { eventId: normalizedEventId }
  )

  const templateByLabel = new Map(
    templates
      .filter((t) => t.isActive ?? true)
      .map((t) => [t.ticketTypeLabel, mapTemplate(t)])
  )

  return Array.from(ticketTypeMap.entries()).map(
    ([ticketTypeLabel, attendeeCount]) => ({
      eventId: normalizedEventId,
      ticketTypeLabel,
      template: templateByLabel.get(ticketTypeLabel) ?? null,
      attendeeCount,
    })
  )
}
