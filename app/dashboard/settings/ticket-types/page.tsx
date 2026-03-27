"use client"

import { useEffect, useMemo, useState } from "react"
import { LayoutTemplate, Pencil, Plus, Trash2, X } from "lucide-react"

import { Button } from "@/components/ui/button"
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card"

type EventOption = {
  id: string
  name: string | null
}

type TemplateDto = {
  id: string
  eventId: string
  ticketTypeLabel: string
  amountMinor: number
  descriptionTemplate: string
  expiryDays: number
  isActive: boolean
}

type TemplateSummary = {
  eventId: string
  ticketTypeLabel: string
  template: TemplateDto | null
  attendeeCount: number
}

function formatMoney(minor: number) {
  return new Intl.NumberFormat("en-US", {
    style: "currency",
    currency: "EUR",
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  }).format(minor / 100)
}

type TemplateFormState = {
  ticketTypeLabel: string
  amountMinor: string
  descriptionTemplate: string
  expiryDays: string
}

const DEFAULT_FORM: TemplateFormState = {
  ticketTypeLabel: "",
  amountMinor: "",
  descriptionTemplate: "",
  expiryDays: "14",
}

export default function TicketTypesSettingsPage() {
  const [events, setEvents] = useState<EventOption[]>([])
  const [selectedEventId, setSelectedEventId] = useState<string>("")
  const [templates, setTemplates] = useState<TemplateSummary[]>([])
  const [isLoadingEvents, setIsLoadingEvents] = useState(true)
  const [isLoadingTemplates, setIsLoadingTemplates] = useState(false)
  const [errorMessage, setErrorMessage] = useState<string | null>(null)

  const [isFormOpen, setIsFormOpen] = useState(false)
  const [formState, setFormState] = useState<TemplateFormState>(DEFAULT_FORM)
  const [editingTemplateId, setEditingTemplateId] = useState<string | null>(
    null
  )
  const [isSubmitting, setIsSubmitting] = useState(false)
  const [formError, setFormError] = useState<string | null>(null)

  const uniqueEvents = useMemo(() => {
    const seen = new Set<string>()
    return events.filter((event) => {
      if (seen.has(event.id)) {
        return false
      }
      seen.add(event.id)
      return true
    })
  }, [events])

  const selectedEvent = useMemo(
    () => uniqueEvents.find((event) => event.id === selectedEventId) ?? null,
    [uniqueEvents, selectedEventId]
  )

  useEffect(() => {
    if (uniqueEvents.length === 0) {
      if (selectedEventId) {
        setSelectedEventId("")
      }
      return
    }
    if (!uniqueEvents.some((event) => event.id === selectedEventId)) {
      setSelectedEventId(uniqueEvents[0].id)
    }
  }, [selectedEventId, uniqueEvents])

  // Load available events on mount
  useEffect(() => {
    async function loadEvents() {
      setIsLoadingEvents(true)
      try {
        const response = await fetch(
          "/api/dashboard/attendees?page=1&pageSize=1"
        )
        if (!response.ok) {
          throw new Error("Failed to load events")
        }
        const body = (await response.json()) as {
          availableEvents: EventOption[]
        }
        setEvents(body.availableEvents)
        if (body.availableEvents.length > 0 && !selectedEventId) {
          setSelectedEventId(body.availableEvents[0].id)
        }
      } catch {
        setErrorMessage("Failed to load events. Please refresh the page.")
      } finally {
        setIsLoadingEvents(false)
      }
    }

    void loadEvents()
  }, [])

  // Load templates when event is selected
  useEffect(() => {
    if (!selectedEventId) {
      setTemplates([])
      return
    }

    async function loadTemplates() {
      setIsLoadingTemplates(true)
      setErrorMessage(null)
      try {
        const response = await fetch(
          `/api/dashboard/tikkie-templates?eventId=${encodeURIComponent(selectedEventId)}&summary=1`
        )
        if (!response.ok) {
          throw new Error("Failed to load templates")
        }
        const body = (await response.json()) as { templates: TemplateSummary[] }
        setTemplates(body.templates)
      } catch {
        setErrorMessage("Failed to load templates. Please try again.")
      } finally {
        setIsLoadingTemplates(false)
      }
    }

    void loadTemplates()
  }, [selectedEventId])

  function openAddForm(ticketTypeLabel: string) {
    setEditingTemplateId(null)
    setFormState({
      ticketTypeLabel,
      amountMinor: "",
      descriptionTemplate: "",
      expiryDays: "14",
    })
    setFormError(null)
    setIsFormOpen(true)
  }

  function openEditForm(template: TemplateDto) {
    setEditingTemplateId(template.id)
    setFormState({
      ticketTypeLabel: template.ticketTypeLabel,
      amountMinor: (template.amountMinor / 100).toFixed(2),
      descriptionTemplate: template.descriptionTemplate,
      expiryDays: String(template.expiryDays),
    })
    setFormError(null)
    setIsFormOpen(true)
  }

  function closeForm() {
    setIsFormOpen(false)
    setEditingTemplateId(null)
    setFormState(DEFAULT_FORM)
    setFormError(null)
  }

  async function handleSubmitForm(e: React.FormEvent) {
    e.preventDefault()
    setIsSubmitting(true)
    setFormError(null)

    const euros = Number.parseFloat(formState.amountMinor)
    if (isNaN(euros) || euros <= 0) {
      setFormError("Please enter a valid positive amount in euros.")
      setIsSubmitting(false)
      return
    }

    try {
      const payload = {
        eventId: selectedEventId,
        ticketTypeLabel: formState.ticketTypeLabel.trim(),
        amountMinor: Math.round(euros * 100),
        descriptionTemplate: formState.descriptionTemplate.trim(),
        expiryDays: formState.expiryDays ? Number(formState.expiryDays) : 14,
      }

      const response = await fetch("/api/dashboard/tikkie-templates", {
        method: editingTemplateId ? "PUT" : "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(
          editingTemplateId ? { ...payload, id: editingTemplateId } : payload
        ),
      })

      if (!response.ok) {
        const body = (await response.json()) as {
          error?: { message?: string }
        } | null
        throw new Error(
          body?.error?.message ??
            `Failed to ${editingTemplateId ? "update" : "create"} template`
        )
      }

      closeForm()
      // Reload templates
      const refreshResponse = await fetch(
        `/api/dashboard/tikkie-templates?eventId=${encodeURIComponent(selectedEventId)}&summary=1`
      )
      if (refreshResponse.ok) {
        const body = (await refreshResponse.json()) as {
          templates: TemplateSummary[]
        }
        setTemplates(body.templates)
      }
    } catch (err) {
      setFormError(err instanceof Error ? err.message : "An error occurred")
    } finally {
      setIsSubmitting(false)
    }
  }

  async function handleDeleteTemplate(templateId: string) {
    if (
      !confirm(
        "Are you sure you want to remove this template? It will be soft-deleted and no longer used for auto-fill."
      )
    ) {
      return
    }

    try {
      const response = await fetch(
        `/api/dashboard/tikkie-templates?id=${encodeURIComponent(templateId)}`,
        {
          method: "DELETE",
        }
      )

      if (!response.ok) {
        throw new Error("Failed to delete template")
      }

      // Reload templates
      const refreshResponse = await fetch(
        `/api/dashboard/tikkie-templates?eventId=${encodeURIComponent(selectedEventId)}&summary=1`
      )
      if (refreshResponse.ok) {
        const body = (await refreshResponse.json()) as {
          templates: TemplateSummary[]
        }
        setTemplates(body.templates)
      }
    } catch {
      setErrorMessage("Failed to delete template. Please try again.")
    }
  }

  return (
    <section className="space-y-6">
      <header>
        <h2 className="text-xl font-semibold">Ticket type payment templates</h2>
        <p className="mt-1 text-sm text-muted-foreground">
          Configure reusable Tikkie payment templates per ticket type. When
          generating links, the amount and description will be pre-filled from
          the matching template.
        </p>
      </header>

      {errorMessage && (
        <div className="rounded-lg border border-red-200 bg-red-50 p-4 text-sm text-red-700 dark:border-red-900 dark:bg-red-950/20 dark:text-red-300">
          {errorMessage}
        </div>
      )}

      <Card>
        <CardHeader>
          <CardTitle className="text-base">Select event</CardTitle>
          <CardDescription>
            Choose an event to manage its ticket type templates.
          </CardDescription>
        </CardHeader>
        <CardContent>
          {isLoadingEvents ? (
            <p className="text-sm text-muted-foreground">Loading events...</p>
          ) : uniqueEvents.length === 0 ? (
            <p className="text-sm text-muted-foreground">
              No events found. Sync Ticket Tailor data first.
            </p>
          ) : (
            <div className="rounded-md border border-border/70 bg-muted/20 p-3 text-sm">
              <p className="font-medium text-foreground">
                {selectedEvent?.name ?? selectedEvent?.id ?? "Event"}
              </p>
              <p className="mt-1 text-muted-foreground">
                Event switching is temporarily hidden while we stabilize this
                page.
              </p>
            </div>
          )}
        </CardContent>
      </Card>

      {selectedEventId && (
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2 text-base">
              <LayoutTemplate className="size-4" />
              Ticket types and templates
            </CardTitle>
            <CardDescription>
              Each unique ticket type for the selected event is shown below.
              Configure a template to enable auto-fill when generating Tikkie
              links.
            </CardDescription>
          </CardHeader>
          <CardContent>
            {isLoadingTemplates ? (
              <p className="text-sm text-muted-foreground">
                Loading templates...
              </p>
            ) : templates.length === 0 ? (
              <p className="text-sm text-muted-foreground">
                No ticket types found for this event. Ticket types are
                discovered from attendee records.
              </p>
            ) : (
              <div className="space-y-3">
                {templates.map((item) => (
                  <div
                    key={item.ticketTypeLabel}
                    className="flex items-start justify-between gap-4 rounded-lg border border-border/70 bg-background p-4"
                  >
                    <div className="min-w-0 flex-1">
                      <div className="flex items-center gap-3">
                        <p className="font-medium">{item.ticketTypeLabel}</p>
                        <span className="rounded-full bg-slate-100 px-2 py-0.5 text-xs text-slate-600 dark:bg-slate-800 dark:text-slate-300">
                          {item.attendeeCount} attendee
                          {item.attendeeCount !== 1 ? "s" : ""}
                        </span>
                      </div>
                      {item.template ? (
                        <div className="mt-2 space-y-1 text-sm text-muted-foreground">
                          <p>
                            <span className="font-medium text-foreground">
                              {formatMoney(item.template.amountMinor)}
                            </span>
                            {" · "}
                            Expires in {item.template.expiryDays} days
                          </p>
                          <p className="truncate">
                            {item.template.descriptionTemplate}
                          </p>
                        </div>
                      ) : (
                        <p className="mt-2 text-sm text-muted-foreground">
                          No template configured. Tikkie links will use default
                          values.
                        </p>
                      )}
                    </div>
                    <div className="flex shrink-0 gap-2">
                      <Button
                        variant="outline"
                        size="sm"
                        onClick={() =>
                          item.template
                            ? void openEditForm(item.template)
                            : void openAddForm(item.ticketTypeLabel)
                        }
                      >
                        {item.template ? (
                          <>
                            <Pencil className="mr-1 size-3" />
                            Edit
                          </>
                        ) : (
                          <>
                            <Plus className="mr-1 size-3" />
                            Add template
                          </>
                        )}
                      </Button>
                      {item.template && (
                        <Button
                          variant="ghost"
                          size="sm"
                          onClick={() =>
                            void handleDeleteTemplate(item.template!.id)
                          }
                        >
                          <Trash2 className="size-4 text-red-500" />
                        </Button>
                      )}
                    </div>
                  </div>
                ))}
              </div>
            )}
          </CardContent>
        </Card>
      )}

      {/* Form Modal */}
      {isFormOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/55 px-4 py-8 backdrop-blur-sm">
          <div
            className="absolute inset-0"
            onClick={() => !isSubmitting && closeForm()}
          />
          <Card className="relative z-10 w-full max-w-md overflow-hidden">
            <div className="flex items-center justify-between border-b border-border/70 bg-muted/30 px-5 py-4">
              <div>
                <h3 className="font-semibold">
                  {editingTemplateId ? "Edit template" : "Add template"}
                </h3>
                <p className="text-sm text-muted-foreground">
                  {formState.ticketTypeLabel}
                </p>
              </div>
              <Button
                type="button"
                variant="ghost"
                size="icon-sm"
                onClick={closeForm}
                disabled={isSubmitting}
              >
                <X className="size-4" />
              </Button>
            </div>

            <CardContent className="p-5">
              <form
                onSubmit={(e) => void handleSubmitForm(e)}
                className="space-y-4"
              >
                <div className="space-y-2">
                  <label htmlFor="amountMinor" className="text-sm font-medium">
                    Amount (in cents)
                  </label>
                  <input
                    id="amountMinor"
                    type="number"
                    min={1}
                    step={1}
                    value={formState.amountMinor}
                    onChange={(e) =>
                      setFormState((s) => ({
                        ...s,
                        amountMinor: e.target.value,
                      }))
                    }
                    placeholder="e.g. 2500 for €25.00"
                    required
                    className="h-10 w-full rounded-md border border-input bg-background px-3 text-sm"
                  />
                </div>

                <div className="space-y-2">
                  <label
                    htmlFor="descriptionTemplate"
                    className="text-sm font-medium"
                  >
                    Description template
                  </label>
                  <input
                    id="descriptionTemplate"
                    type="text"
                    value={formState.descriptionTemplate}
                    onChange={(e) =>
                      setFormState((s) => ({
                        ...s,
                        descriptionTemplate: e.target.value,
                      }))
                    }
                    placeholder="e.g. Conference ticket for {{name}}"
                    maxLength={200}
                    required
                    className="h-10 w-full rounded-md border border-input bg-background px-3 text-sm"
                  />
                  <p className="text-xs text-muted-foreground">
                    Supports placeholders: {"{{name}}"}, {"{{email}}"},{" "}
                    {"{{ticketType}}"}
                  </p>
                </div>

                <div className="space-y-2">
                  <label htmlFor="expiryDays" className="text-sm font-medium">
                    Expiry days
                  </label>
                  <input
                    id="expiryDays"
                    type="number"
                    min={1}
                    max={365}
                    value={formState.expiryDays}
                    onChange={(e) =>
                      setFormState((s) => ({
                        ...s,
                        expiryDays: e.target.value,
                      }))
                    }
                    placeholder="14"
                    className="h-10 w-full rounded-md border border-input bg-background px-3 text-sm"
                  />
                  <p className="text-xs text-muted-foreground">
                    How many days the Tikkie link should remain valid (1-365).
                  </p>
                </div>

                {formError && (
                  <div className="rounded-md border border-red-200 bg-red-50 p-3 text-sm text-red-700 dark:border-red-900 dark:bg-red-950/20 dark:text-red-300">
                    {formError}
                  </div>
                )}

                <div className="flex justify-end gap-2 border-t border-border/70 pt-4">
                  <Button
                    type="button"
                    variant="outline"
                    onClick={closeForm}
                    disabled={isSubmitting}
                  >
                    Cancel
                  </Button>
                  <Button type="submit" disabled={isSubmitting}>
                    {isSubmitting
                      ? "Saving..."
                      : editingTemplateId
                        ? "Update template"
                        : "Create template"}
                  </Button>
                </div>
              </form>
            </CardContent>
          </Card>
        </div>
      )}
    </section>
  )
}
