"use client"

import { useEffect, useMemo, useState } from "react"
import { useRouter } from "next/navigation"

import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { usePublicSignupCatalog } from "@/lib/convex/hooks/signup"
import {
  createInitialSignupDraft,
  deriveAttendeeDraftsFromTicketSelections,
  invalidateDownstreamForTicketChange,
  invalidateDownstreamForRoomChange,
  SIGNUP_STEP_ORDER,
  type SignupDraft,
  type SignupStep,
  type TicketSelectionDraft,
} from "@/components/signup/state"
import {
  buildAssignmentBoard,
  summarizeUnfilledBeds,
} from "@/components/signup/assignment"
import { TicketStep } from "@/components/signup/steps/TicketStep"
import { RoomAssignmentStep } from "@/components/signup/steps/RoomAssignmentStep"
import { BuyerDetailsStep } from "@/components/signup/steps/BuyerDetailsStep"
import {
  AttendeeDetailsStep,
  type AttendeeValidationSummary,
} from "@/components/signup/steps/AttendeeDetailsStep"
import { ReviewSubmitStep } from "@/components/signup/steps/ReviewSubmitStep"
import {
  submitSignupDraft,
  type SignupClientErrorCode,
} from "@/components/signup/submission-client"
import { SignupProgress } from "@/components/signup/SignupProgress"
import { SignupNavigation } from "@/components/signup/SignupNavigation"
import type { SignupSubmissionResult } from "@/lib/types/signup"

type SignupFlowShellProps = {
  slug: string
}

export function SignupFlowShell({ slug }: SignupFlowShellProps) {
  const router = useRouter()
  const catalog = usePublicSignupCatalog()
  const event = catalog.find((entry) => entry.slug === slug)
  const [draft, setDraft] = useState<SignupDraft | null>(null)
  const [attendeeValidation, setAttendeeValidation] =
    useState<AttendeeValidationSummary | null>(null)
  const [submitResult, setSubmitResult] =
    useState<SignupSubmissionResult | null>(null)
  const [submitError, setSubmitError] = useState<{
    code: SignupClientErrorCode
    message: string
  } | null>(null)
  const [isSubmitting, setIsSubmitting] = useState(false)
  const [idempotencyKey] = useState(() => `signup-${Date.now()}`)

  // Use primitive values for stable effect dependencies
  const eventId = event?.eventId
  const sourceKind = event?.source?.kind

  useEffect(() => {
    if (!eventId || !sourceKind) {
      return
    }

    const storageKey = `signup-draft:${eventId}`

    try {
      const raw = window.localStorage.getItem(storageKey)
      if (!raw) {
        setDraft(createInitialSignupDraft(eventId, sourceKind))
        return
      }

      const parsed = JSON.parse(raw) as SignupDraft

      if (parsed.eventId !== eventId || parsed.source !== sourceKind) {
        setDraft(createInitialSignupDraft(eventId, sourceKind))
        return
      }

      setDraft(parsed)
    } catch {
      setDraft(createInitialSignupDraft(eventId, sourceKind))
    }
  }, [eventId, sourceKind])

  useEffect(() => {
    if (!event || !draft) {
      return
    }

    if (eventId) {
      window.localStorage.setItem(
        `signup-draft:${eventId}`,
        JSON.stringify(draft)
      )
    }
  }, [draft, eventId])

  // Memoized computed values - always called, but only computed when data is ready
  const currentStepIndex = useMemo(() => {
    if (!draft) return 0
    return SIGNUP_STEP_ORDER.indexOf(draft.step)
  }, [draft?.step])

  const totalSelectedTickets = useMemo(() => {
    if (!draft) return 0
    return draft.ticketSelections.reduce(
      (sum, ticket) => sum + ticket.quantity,
      0
    )
  }, [draft?.ticketSelections])

  const roomBoard = useMemo(() => {
    if (!event || !draft) return null
    return buildAssignmentBoard(
      draft.attendees.map((attendee) => ({
        attendeeId: attendee.attendeeKey,
        name: attendee.name || `Attendee ${attendee.attendeeKey}`,
      })),
      event.accommodation.slots,
      draft.assignments
    )
  }, [event?.accommodation?.slots, draft?.attendees, draft?.assignments])

  const roomSummary = useMemo(() => {
    if (!roomBoard) return { unfilledBeds: 0 }
    return summarizeUnfilledBeds(roomBoard)
  }, [roomBoard])

  const attendeeValidationSnapshot = useMemo(() => {
    if (!draft) return { isValid: false, byAttendee: {} }
    return validateAttendeeDetails(draft.attendees)
  }, [draft?.attendees])

  const completedByStep: Record<SignupStep, boolean> = useMemo(() => {
    if (!event || !draft) {
      return {
        tickets: false,
        buyer: false,
        rooms: false,
        attendees: false,
        review: false,
      }
    }
    const buyerComplete =
      draft.booker.name.trim().length > 0 &&
      draft.booker.email.trim().length > 0 &&
      draft.booker.phone.trim().length > 0
    return {
      tickets: totalSelectedTickets > 0,
      buyer: buyerComplete,
      rooms:
        !event.accommodation.eligible ||
        roomSummary.unfilledBeds === 0 ||
        draft.acknowledgeRandomFill,
      attendees:
        draft.attendees.length > 0 && attendeeValidationSnapshot.isValid,
      review: false,
    }
  }, [
    draft?.acknowledgeRandomFill,
    draft?.attendees?.length,
    draft?.booker?.name,
    draft?.booker?.email,
    draft?.booker?.phone,
    event?.accommodation?.eligible,
    attendeeValidationSnapshot.isValid,
    roomSummary.unfilledBeds,
    totalSelectedTickets,
  ])

  // Early returns after all hooks are called
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

  function validateAttendeeDetails(attendees: SignupDraft["attendees"]) {
    const byAttendee: Record<string, string[]> = {}

    for (const attendee of attendees) {
      const missingFields: string[] = []

      if (!attendee.name.trim()) missingFields.push("name")
      if (!attendee.gender) missingFields.push("gender")

      byAttendee[attendee.attendeeKey] = missingFields
    }

    return {
      isValid: Object.values(byAttendee).every(
        (missing) => missing.length === 0
      ),
      byAttendee,
    }
  }

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

    const targetIndex = SIGNUP_STEP_ORDER.indexOf(step)
    if (activeDraft.step === "attendees" && targetIndex > currentStepIndex) {
      const validation = validateAttendeeDetails(activeDraft.attendees)
      setAttendeeValidation(validation)
      if (!validation.isValid) {
        return
      }
    }

    setDraft((current) => (current ? { ...current, step } : current))
  }

  function moveNext() {
    if (activeDraft.step === "buyer") {
      const buyerComplete =
        activeDraft.booker.name.trim().length > 0 &&
        activeDraft.booker.email.trim().length > 0 &&
        activeDraft.booker.phone.trim().length > 0
      if (!buyerComplete) {
        return
      }
    }

    if (activeDraft.step === "attendees") {
      const validation = validateAttendeeDetails(activeDraft.attendees)
      setAttendeeValidation(validation)
      if (!validation.isValid) {
        return
      }
    }

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
    setAttendeeValidation(null)
    setSubmitResult(null)
    setSubmitError(null)
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

  function handleRoomAssignmentsChange(
    nextAssignments: Record<string, string>
  ) {
    setAttendeeValidation(null)
    setSubmitResult(null)
    setSubmitError(null)
    setDraft((current) =>
      current
        ? invalidateDownstreamForRoomChange(current, nextAssignments)
        : current
    )
  }

  function handleAcknowledgeRandomFill(checked: boolean) {
    setDraft((current) =>
      current
        ? {
            ...current,
            acknowledgeRandomFill: checked,
          }
        : current
    )
  }

  function handleAttendeeChange(
    attendeeKey: string,
    field: keyof SignupDraft["attendees"][number],
    value: string
  ) {
    setAttendeeValidation(null)
    setSubmitResult(null)
    setSubmitError(null)
    setDraft((current) => {
      if (!current) {
        return current
      }

      return {
        ...current,
        attendees: current.attendees.map((attendee) =>
          attendee.attendeeKey === attendeeKey
            ? {
                ...attendee,
                [field]: value,
              }
            : attendee
        ),
      }
    })
  }

  function handleBookerChange(
    field: keyof SignupDraft["booker"],
    value: string
  ) {
    setAttendeeValidation(null)
    setSubmitResult(null)
    setSubmitError(null)
    setDraft((current) => {
      if (!current) {
        return current
      }
      return {
        ...current,
        booker: {
          ...current.booker,
          [field]: value,
        },
      }
    })
  }

  async function handleSubmitFromReview() {
    const validation = validateAttendeeDetails(activeDraft.attendees)
    setAttendeeValidation(validation)

    if (!validation.isValid) {
      setDraft((current) =>
        current ? { ...current, step: "attendees" } : current
      )
      return
    }

    setIsSubmitting(true)
    setSubmitError(null)

    const result = await submitSignupDraft(activeDraft, { idempotencyKey })

    if (!result.ok) {
      setSubmitResult(null)
      setSubmitError(result.error)
      setIsSubmitting(false)
      return
    }

    // Clear localStorage draft on successful submission
    if (eventId) {
      try {
        window.localStorage.removeItem(`signup-draft:${eventId}`)
      } catch {
        // Ignore localStorage errors (e.g. private browsing)
      }
    }

    setSubmitResult(result.data)
    setSubmitError(null)
    setIsSubmitting(false)

    // Redirect to success page
    router.push(`/signup/success/${result.data.bookingRef}`)
  }

  const stepTitle =
    activeDraft.step === "tickets"
      ? "Tickets"
      : activeDraft.step === "buyer"
        ? "Your Details"
        : activeDraft.step === "rooms"
          ? "Rooms"
          : activeDraft.step === "attendees"
            ? "Attendee details"
            : "Review & submit"

  return (
    <main className="mx-auto w-full max-w-5xl p-4 md:p-6">
      <Card className="mb-4 md:mb-6">
        <CardHeader className="space-y-3 md:space-y-4">
          <CardTitle>{activeEvent.title} signup</CardTitle>
          <SignupProgress
            currentStep={activeDraft.step}
            completedByStep={completedByStep}
            onStepClick={moveToStep}
            canAccessStep={canAccessStep}
          />
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
          {activeDraft.step === "buyer" ? (
            <>
              <BuyerDetailsStep
                booker={activeDraft.booker}
                onBookerChange={handleBookerChange}
              />
              {!completedByStep.buyer ? (
                <p className="font-medium text-destructive">
                  Fill in all your details to continue.
                </p>
              ) : null}
            </>
          ) : null}
          {activeDraft.step === "rooms" ? (
            <>
              <RoomAssignmentStep
                event={activeEvent}
                attendees={activeDraft.attendees}
                assignments={activeDraft.assignments}
                acknowledgeRandomFill={activeDraft.acknowledgeRandomFill}
                onAssignmentChange={handleRoomAssignmentsChange}
                onAcknowledgeRandomFillChange={handleAcknowledgeRandomFill}
              />
              {activeEvent.accommodation.eligible &&
              roomSummary.unfilledBeds > 0 &&
              !activeDraft.acknowledgeRandomFill ? (
                <p className="font-medium text-destructive">
                  Acknowledge random-fill risk or assign all beds before
                  continuing.
                </p>
              ) : null}
            </>
          ) : null}
          {activeDraft.step === "attendees" ? (
            <AttendeeDetailsStep
              attendees={activeDraft.attendees}
              validationSummary={attendeeValidation}
              onAttendeeChange={handleAttendeeChange}
            />
          ) : null}
          {activeDraft.step === "review" ? (
            <ReviewSubmitStep
              draft={activeDraft}
              event={activeEvent}
              submitResult={submitResult}
              submitError={submitError}
              isSubmitting={isSubmitting}
              onSubmit={handleSubmitFromReview}
            />
          ) : null}

          <SignupNavigation
            currentStepIndex={currentStepIndex}
            totalSteps={SIGNUP_STEP_ORDER.length}
            canProceed={completedByStep[activeDraft.step]}
            onBack={moveBack}
            onNext={moveNext}
            isSubmitting={isSubmitting}
          />
        </CardContent>
      </Card>
    </main>
  )
}
