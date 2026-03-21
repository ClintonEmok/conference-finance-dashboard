import { prisma } from "@/lib/prisma"

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

type DbTemplate = {
  id: string
  eventId: string
  ticketTypeLabel: string
  amountMinor: number
  descriptionTemplate: string
  expiryDays: number
  isActive: boolean
  createdAt: Date
  updatedAt: Date
}

function mapTemplate(template: DbTemplate): TikkiePaymentTemplateDto {
  return {
    id: template.id,
    eventId: template.eventId,
    ticketTypeLabel: template.ticketTypeLabel,
    amountMinor: template.amountMinor,
    descriptionTemplate: template.descriptionTemplate,
    expiryDays: template.expiryDays,
    isActive: template.isActive,
    createdAt: template.createdAt.toISOString(),
    updatedAt: template.updatedAt.toISOString(),
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
    throw new Error("Invalid 'amountMinor'. Expected a positive integer in cents.")
  }
  return value
}

function normalizeExpiryDays(value: number | undefined): number {
  const days = value ?? 14
  if (!Number.isInteger(days) || days < 1 || days > 365) {
    throw new Error("Invalid 'expiryDays'. Expected an integer between 1 and 365.")
  }
  return days
}

function normalizeDescriptionTemplate(value: string): string {
  const normalized = value.trim()
  if (!normalized) {
    throw new Error("Invalid 'descriptionTemplate'. Value is required.")
  }
  if (normalized.length > 200) {
    throw new Error("Invalid 'descriptionTemplate'. Maximum length is 200 characters.")
  }
  return normalized
}

export function validateCreateTemplateInput(input: CreateTemplateInput) {
  return {
    eventId: normalizeEventId(input.eventId),
    ticketTypeLabel: normalizeTicketTypeLabel(input.ticketTypeLabel),
    amountMinor: normalizeAmountMinor(input.amountMinor),
    descriptionTemplate: normalizeDescriptionTemplate(input.descriptionTemplate),
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
    descriptionTemplate: normalizeDescriptionTemplate(input.descriptionTemplate),
    expiryDays: normalizeExpiryDays(input.expiryDays),
    isActive: input.isActive ?? true,
  }
}

export async function createTemplate(input: CreateTemplateInput): Promise<TikkiePaymentTemplateDto> {
  const validated = validateCreateTemplateInput(input)

  const event = await prisma.ticketTailorEvent.findUnique({
    where: { id: validated.eventId },
    select: { id: true },
  })

  if (!event) {
    throw new Error("Event not found for given 'eventId'.")
  }

  const template = await prisma.tikkiePaymentTemplate.upsert({
    where: {
      eventId_ticketTypeLabel: {
        eventId: validated.eventId,
        ticketTypeLabel: validated.ticketTypeLabel,
      },
    },
    update: {
      amountMinor: validated.amountMinor,
      descriptionTemplate: validated.descriptionTemplate,
      expiryDays: validated.expiryDays,
      isActive: true,
    },
    create: {
      eventId: validated.eventId,
      ticketTypeLabel: validated.ticketTypeLabel,
      amountMinor: validated.amountMinor,
      descriptionTemplate: validated.descriptionTemplate,
      expiryDays: validated.expiryDays,
      isActive: true,
    },
  })

  return mapTemplate(template)
}

export async function updateTemplate(input: UpdateTemplateInput): Promise<TikkiePaymentTemplateDto> {
  const validated = validateUpdateTemplateInput(input)

  const existing = await prisma.tikkiePaymentTemplate.findUnique({
    where: { id: validated.id },
  })

  if (!existing) {
    throw new Error("Template not found for given 'id'.")
  }

  const template = await prisma.tikkiePaymentTemplate.update({
    where: { id: validated.id },
    data: {
      amountMinor: validated.amountMinor,
      descriptionTemplate: validated.descriptionTemplate,
      expiryDays: validated.expiryDays,
      isActive: validated.isActive,
    },
  })

  return mapTemplate(template)
}

export async function deleteTemplate(id: string): Promise<TikkiePaymentTemplateDto> {
  const normalizedId = id.trim()
  if (!normalizedId) {
    throw new Error("Invalid 'id'. Value is required.")
  }

  const existing = await prisma.tikkiePaymentTemplate.findUnique({
    where: { id: normalizedId },
  })

  if (!existing) {
    throw new Error("Template not found for given 'id'.")
  }

  const template = await prisma.tikkiePaymentTemplate.update({
    where: { id: normalizedId },
    data: { isActive: false },
  })

  return mapTemplate(template)
}

export async function getTemplatesByEvent(eventId: string): Promise<TikkiePaymentTemplateDto[]> {
  const normalizedEventId = normalizeEventId(eventId)

  const templates = await prisma.tikkiePaymentTemplate.findMany({
    where: {
      eventId: normalizedEventId,
      isActive: true,
    },
    orderBy: [{ ticketTypeLabel: "asc" }],
  })

  return templates.map(mapTemplate)
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
  attendee: AttendeeForMatch,
): Promise<TemplateMatchResult> {
  const providerOrderId = attendee.providerOrderId.trim()
  if (!providerOrderId) {
    throw new Error("Invalid attendee. 'providerOrderId' is required.")
  }

  // Priority 1: attendee-level amount override
  if (attendee.tikkieAmountOverrideMinor !== null && attendee.tikkieAmountOverrideMinor > 0) {
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

  // Priority 2: ticket-type template
  if (attendee.ticketTypeLabel && attendee.ticketTypeLabel.trim()) {
    const template = await prisma.tikkiePaymentTemplate.findUnique({
      where: {
        eventId_ticketTypeLabel: {
          eventId: attendee.eventId,
          ticketTypeLabel: attendee.ticketTypeLabel.trim(),
        },
      },
    })

    if (template && template.isActive) {
      // Substitute placeholders in description template
      const description = template.descriptionTemplate
        .replace(/\{\{name\}\}/gi, "attendee")
        .replace(/\{\{email\}\}/gi, "contact")
        .replace(/\{\{ticketType\}\}/gi, attendee.ticketTypeLabel ?? "")
        .slice(0, 35)

      const expiryDate = new Date(Date.now() + template.expiryDays * 24 * 60 * 60 * 1000)
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
        templateId: template.id,
      }
    }
  }

  // Priority 3: default (no template, no override)
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

export async function getTemplatesWithAttendeeCounts(eventId: string): Promise<TemplateSummary[]> {
  const normalizedEventId = normalizeEventId(eventId)

  // Get all unique ticket type labels for attendees in this event
  const attendeeTicketTypes = await prisma.ticketTailorAttendee.groupBy({
    by: ["ticketTypeLabel"],
    where: {
      eventId: normalizedEventId,
      ticketTypeLabel: { not: null },
    },
    _count: { _all: true },
  })

  // Get active templates for this event
  const templates = await prisma.tikkiePaymentTemplate.findMany({
    where: {
      eventId: normalizedEventId,
      isActive: true,
    },
  })

  const templateByLabel = new Map(templates.map((t) => [t.ticketTypeLabel, mapTemplate(t)]))

  // Build summary including ticket types with and without templates
  return attendeeTicketTypes
    .filter((at) => at.ticketTypeLabel)
    .map((at) => ({
      eventId: normalizedEventId,
      ticketTypeLabel: at.ticketTypeLabel!,
      template: templateByLabel.get(at.ticketTypeLabel!) ?? null,
      attendeeCount: at._count._all,
    }))
    .sort((a, b) => a.ticketTypeLabel.localeCompare(b.ticketTypeLabel))
}
