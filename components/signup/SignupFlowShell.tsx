"use client"

import { useEffect, useMemo, useState } from "react"

import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { usePublicSignupCatalog } from "@/lib/convex/hooks/signup"
import {
  createInitialSignupDraft,
  deriveAttendeeDraftsFromTicketSelections,
  invalidateDownstreamForTicketChange,
  SIGNUP_STEP_ORDER,
  type SignupDraft,
  type SignupStep,
  type TicketSelectionDraft,
} from "@/components/signup/state"
import { TicketStep } from "@/components/signup/steps/TicketStep"

type SignupFlowShellProps = {
  slug: string
}

export function SignupFlowShell({ slug }: SignupFlowShellProps) {
  const catalog = usePublicSignupCatalog()
  const event = catalog.find((entry) => entry.slug === slug)
  const [draft, setDraft] = useState<SignupDraft | null>(null)

  useEffect(() => {
    if (!event) {
      return
    }

    const storageKey = `signup-draft:${event.eventId}`

    try {
      const raw = window.localStorage.getItem(storageKey)
      if (!raw) {
        setDraft(createInitialSignupDraft(event.eventId, event.source.kind))
        return
      }

      const parsed = JSON.parse(raw) as SignupDraft

      if (
        parsed.eventId !== event.eventId ||
        parsed.source !== event.source.kind
      ) {
        setDraft(createInitialSignupDraft(event.eventId, event.source.kind))
        return
      }

      setDraft(parsed)
    } catch {
      setDraft(createInitialSignupDraft(event.eventId, event.source.kind))
    }
  }, [event])

  useEffect(() => {
    if (!event || !draft) {
      return
    }

    window.localStorage.setItem(
      `signup-draft:${event.eventId}`,
      JSON.stringify(draft)
    )
  }, [draft, event])

  if (!event) {
    return (
      <main className="mx-auto flex min-h-svh w-full max-w-4xl items-center justify-center p-6">
        <Card className="w-full">
          <CardHeader>
            <CardTitle>Signup event not found</CardTitle>
          </CardHeader>
          <CardContent className="text-sm text-muted-foreground">
            This signup link is unavailable. Return to the event page and try
            again.
          </CardContent>
        </Card>
      </main>
    )
  }

  if (!draft) {
    return (
      <main className="mx-auto w-full max-w-5xl p-6">
        <Card>
          <CardHeader>
            <CardTitle>Preparing signup flow...</CardTitle>
          </CardHeader>
        </Card>
      </main>
    )
  }

  const activeEvent = event
  const activeDraft = draft

  const currentStepIndex = SIGNUP_STEP_ORDER.indexOf(activeDraft.step)
  const totalSelectedTickets = activeDraft.ticketSelections.reduce(
    (sum, ticket) => sum + ticket.quantity,
    0
  )

  const completedByStep: Record<SignupStep, boolean> = useMemo(
    () => ({
      tickets: totalSelectedTickets > 0,
      rooms: true,
      attendees: activeDraft.attendees.length > 0,
      review: false,
    }),
    [activeDraft.attendees.length, totalSelectedTickets]
  )

  function canAccessStep(step: SignupStep) {
    const targetIndex = SIGNUP_STEP_ORDER.indexOf(step)
    if (targetIndex <= currentStepIndex) {
      return true
    }

    for (let index = 0; index < targetIndex; index += 1) {
      const previousStep = SIGNUP_STEP_ORDER[index]
      if (!completedByStep[previousStep]) {
        return false
      }
    }

    return true
  }

  function moveToStep(step: SignupStep) {
    if (!canAccessStep(step)) {
      return
    }

    setDraft((current) => (current ? { ...current, step } : current))
  }

  function moveNext() {
    if (!completedByStep[activeDraft.step]) {
      return
    }

    const nextIndex = Math.min(
      currentStepIndex + 1,
      SIGNUP_STEP_ORDER.length - 1
    )
    moveToStep(SIGNUP_STEP_ORDER[nextIndex])
  }

  function moveBack() {
    const previousIndex = Math.max(currentStepIndex - 1, 0)
    moveToStep(SIGNUP_STEP_ORDER[previousIndex])
  }

  const effectiveTicketSelections: TicketSelectionDraft[] =
    activeDraft.ticketSelections.length > 0
      ? activeDraft.ticketSelections
      : activeEvent.tickets.map((ticket) => ({
          ticketTypeId: ticket.ticketTypeId,
          label: ticket.label,
          priceMinor: ticket.priceMinor,
          quantity: 0,
          selectable: ticket.selectable,
          reason: ticket.reason,
        }))

  function handleTicketSelectionsChange(
    nextSelections: TicketSelectionDraft[]
  ) {
    setDraft((current) => {
      if (!current) {
        return current
      }

      const attendeeDrafts = deriveAttendeeDraftsFromTicketSelections(
        nextSelections,
        current.attendees
      )

      return invalidateDownstreamForTicketChange(
        {
          ...current,
          attendees: attendeeDrafts,
        },
        nextSelections
      )
    })
  }

  const stepTitle =
    activeDraft.step === "tickets"
      ? "Tickets"
      : activeDraft.step === "rooms"
        ? "Rooms"
        : activeDraft.step === "attendees"
          ? "Attendee details"
          : "Review & submit"

  return (
    <main className="mx-auto w-full max-w-5xl p-6">
      <Card className="mb-6">
        <CardHeader className="space-y-4">
          <CardTitle>{activeEvent.title} signup</CardTitle>
          <div className="grid gap-2 md:grid-cols-4">
            {SIGNUP_STEP_ORDER.map((step, index) => {
              const isActive = activeDraft.step === step
              const isComplete =
                completedByStep[step] && index < currentStepIndex
              const label =
                step === "tickets"
                  ? "Tickets"
                  : step === "rooms"
                    ? "Rooms"
                    : step === "attendees"
                      ? "Attendee details"
                      : "Review & submit"

              return (
                <button
                  key={step}
                  type="button"
                  className="rounded-lg border border-border/70 px-3 py-2 text-left disabled:opacity-50"
                  disabled={!canAccessStep(step)}
                  onClick={() => moveToStep(step)}
                >
                  <p className="text-xs text-muted-foreground">
                    Step {index + 1}
                  </p>
                  <p className="text-sm font-medium">{label}</p>
                  {isActive ? <Badge className="mt-2">Active</Badge> : null}
                  {!isActive && isComplete ? (
                    <Badge className="mt-2" variant="secondary">
                      Complete
                    </Badge>
                  ) : null}
                </button>
              )
            })}
          </div>
        </CardHeader>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>{stepTitle}</CardTitle>
        </CardHeader>
        <CardContent className="space-y-4 text-sm text-muted-foreground">
          {activeDraft.step === "tickets" ? (
            <>
              <TicketStep
                ticketSelections={effectiveTicketSelections}
                onChange={handleTicketSelectionsChange}
              />
              {totalSelectedTickets <= 0 ? (
                <p className="font-medium text-destructive">
                  Select at least one ticket to continue.
                </p>
              ) : null}
            </>
          ) : null}
          {activeDraft.step === "rooms" ? (
            <p>Room assignment interaction appears in the next task.</p>
          ) : null}
          {activeDraft.step === "attendees" ? (
            <p>Attendee details form appears in a later plan.</p>
          ) : null}
          {activeDraft.step === "review" ? (
            <p>Review &amp; submit interaction appears in a later plan.</p>
          ) : null}

          <div className="flex gap-2 pt-2">
            <Button
              type="button"
              variant="outline"
              onClick={moveBack}
              disabled={currentStepIndex === 0}
            >
              Back
            </Button>
            <Button
              type="button"
              onClick={moveNext}
              disabled={!completedByStep[activeDraft.step]}
            >
              Next
            </Button>
          </div>
        </CardContent>
      </Card>
    </main>
  )
}
