"use client"

import { useEffect, useMemo, useState } from "react"
import { useRouter } from "next/navigation"

import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { Skeleton } from "@/components/ui/skeleton"
import { normalizePublicSignupCatalog } from "@/lib/domain/signup/catalog"
import { usePublicSignupCatalogRaw } from "@/lib/convex/hooks/signup"
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
import { AttendeeDetailsStep } from "@/components/signup/steps/AttendeeDetailsStep"
import { ReviewSubmitStep } from "@/components/signup/steps/ReviewSubmitStep"
import {
  submitSignupDraft,
  type SignupClientErrorCode,
} from "@/components/signup/submission-client"
import { SignupProgress } from "@/components/signup/SignupProgress"
import { SignupNavigation } from "@/components/signup/SignupNavigation"
import { SignupSummary } from "@/components/signup/SignupSummary"
import { SignupHeader } from "@/components/signup/SignupHeader"
import { shouldSkipRoomsStep } from "@/components/signup/flow-rules"
import {
  validateSignupAttendees,
  validateSignupBooker,
  type SignupAttendeeValidationSummary,
  type SignupBookerValidationSummary,
} from "@/components/signup/validation"
import { Separator } from "@/components/ui/separator"
import type { SignupSubmissionResult } from "@/lib/types/signup"

type SignupFlowShellProps = {
  slug: string
}

export function SignupFlowShell({ slug }: SignupFlowShellProps) {
  const router = useRouter()
  const catalogRaw = usePublicSignupCatalogRaw()
  const catalog = useMemo(
    () => normalizePublicSignupCatalog(catalogRaw),
    [catalogRaw]
  )
  const event = catalog.find((entry) => entry.slug === slug)
  const [draft, setDraft] = useState<SignupDraft | null>(null)
  const [buyerValidation, setBuyerValidation] =
    useState<SignupBookerValidationSummary | null>(null)
  const [attendeeValidation, setAttendeeValidation] =
    useState<SignupAttendeeValidationSummary | null>(null)
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

    // Clear any existing localStorage draft for this event
    try {
      window.localStorage.removeItem(`signup-draft:${eventId}`)
    } catch {
      // Ignore localStorage errors (e.g. private browsing)
    }

    setDraft(createInitialSignupDraft(eventId, sourceKind))
  }, [eventId, sourceKind])

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

  const buyerValidationSnapshot = useMemo(
    () =>
      draft
        ? validateSignupBooker(draft.booker)
        : { isValid: false, errors: {} },
    [draft?.booker]
  )

  const attendeeValidationSnapshot = useMemo(
    () =>
      draft
        ? validateSignupAttendees(draft.attendees)
        : { isValid: false, byAttendee: {} },
    [draft?.attendees]
  )

  const skipRooms = useMemo(() => {
    if (!event || !draft) return false
    return shouldSkipRoomsStep(event, draft.attendees)
  }, [event, draft?.attendees])

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
    return {
      tickets: totalSelectedTickets > 0,
      buyer: buyerValidationSnapshot.isValid,
      rooms:
        skipRooms ||
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
    event?.accommodation?.eligible,
    buyerValidationSnapshot.isValid,
    attendeeValidationSnapshot.isValid,
    roomSummary.unfilledBeds,
    totalSelectedTickets,
    skipRooms,
  ])

  // Early returns after all hooks are called
  if (catalogRaw === undefined) {
    return (
      <main className="mx-auto w-full max-w-4xl space-y-6 p-6">
        <Card>
          <CardHeader>
            <CardTitle>Loading signup...</CardTitle>
          </CardHeader>
          <CardContent className="space-y-3">
            <Skeleton className="h-4 w-56" />
            <Skeleton className="h-4 w-80" />
            <Skeleton className="h-24 w-full" />
          </CardContent>
        </Card>
      </main>
    )
  }

  if (!event) {
    return (
      <main className="mx-auto flex min-h-svh w-full max-w-4xl items-center justify-center p-6">
        <Card className="w-full">
          <CardHeader>
            <CardTitle>Signup event not found</CardTitle>
          </CardHeader>
          <CardContent className="text-sm text-muted-foreground">
            We couldn&apos;t find a published signup event for this link.
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
      const validation = validateSignupAttendees(activeDraft.attendees)
      setAttendeeValidation(validation)
      if (!validation.isValid) {
        return
      }
    }

    setDraft((current) => (current ? { ...current, step } : current))
  }

  function moveNext() {
    if (activeDraft.step === "buyer") {
      const validation = validateSignupBooker(activeDraft.booker)
      setBuyerValidation(validation)
      if (!validation.isValid) {
        return
      }
    }

    if (activeDraft.step === "attendees") {
      const validation = validateSignupAttendees(activeDraft.attendees)
      setAttendeeValidation(validation)
      if (!validation.isValid) {
        return
      }
    }

    if (!completedByStep[activeDraft.step]) {
      return
    }

    let nextIndex = Math.min(currentStepIndex + 1, SIGNUP_STEP_ORDER.length - 1)

    // Skip rooms step when all attendees have an effective room type
    if (skipRooms && SIGNUP_STEP_ORDER[currentStepIndex] === "attendees") {
      nextIndex = SIGNUP_STEP_ORDER.indexOf("review")
    }

    moveToStep(SIGNUP_STEP_ORDER[nextIndex])
  }

  function moveBack() {
    let previousIndex = Math.max(currentStepIndex - 1, 0)

    // Skip rooms step when all attendees have an effective room type
    if (skipRooms && SIGNUP_STEP_ORDER[currentStepIndex] === "review") {
      previousIndex = SIGNUP_STEP_ORDER.indexOf("attendees")
    }

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
          roomTypeId: ticket.roomTypeId,
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
    setBuyerValidation(null)
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

  function handleBookerFieldBlur() {
    setBuyerValidation(validateSignupBooker(activeDraft.booker))
  }

  async function handleSubmitFromReview() {
    const buyerValidationResult = validateSignupBooker(activeDraft.booker)
    setBuyerValidation(buyerValidationResult)

    if (!buyerValidationResult.isValid) {
      setDraft((current) => (current ? { ...current, step: "buyer" } : current))
      return
    }

    const validation = validateSignupAttendees(activeDraft.attendees)
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
    <div className="min-h-svh bg-muted/30">
      <SignupHeader
        eventName={activeEvent.title}
        stepTitle={`Step ${currentStepIndex + 1}: ${stepTitle}`}
      />
      <main className="mx-auto flex h-full max-w-[1400px] flex-col gap-6 p-4 md:p-8 lg:flex-row lg:items-start lg:gap-10">
        {/* Sidebar: Progress & Summary */}
        <div className="flex flex-col gap-6 lg:sticky lg:top-28 lg:w-[340px] lg:shrink-0">
          <Card className="shadow-sm">
            <CardHeader className="space-y-6 pb-8">
              <div className="space-y-1">
                <p className="text-[10px] font-black tracking-[0.2em] text-muted-foreground/60 uppercase">
                  Event Registration
                </p>
                <div className="mb-4 h-2 w-12 rounded-full bg-primary/20" />
              </div>

              <SignupProgress
                currentStep={activeDraft.step}
                completedByStep={completedByStep}
                onStepClick={moveToStep}
                canAccessStep={canAccessStep}
                skipRooms={skipRooms}
              />
            </CardHeader>
          </Card>

          <Card className="hidden shadow-sm lg:block">
            <CardHeader>
              <CardTitle className="text-sm font-bold tracking-wider text-muted-foreground uppercase">
                Registration Summary
              </CardTitle>
            </CardHeader>
            <CardContent>
              <SignupSummary event={activeEvent} draft={activeDraft} />
            </CardContent>
          </Card>
        </div>

        {/* Main Content: Active Step */}
        <div className="flex flex-1 flex-col gap-6">
          <Card className="flex-1 shadow-sm">
            <CardHeader className="border-b bg-muted/5 pb-6">
              <div className="flex flex-col gap-1">
                <CardTitle className="text-2xl font-bold tracking-tight">
                  {stepTitle}
                </CardTitle>
                <p className="text-sm text-muted-foreground">
                  Complete this section to proceed to the next step.
                </p>
              </div>
            </CardHeader>
            <CardContent className="pt-8">
              <div className="space-y-8">
                {activeDraft.step === "tickets" && (
                  <div className="space-y-6">
                    <TicketStep
                      ticketSelections={effectiveTicketSelections}
                      onChange={handleTicketSelectionsChange}
                    />
                    {totalSelectedTickets <= 0 && (
                      <div className="rounded-lg border border-destructive/20 bg-destructive/5 p-4 text-sm font-medium text-destructive">
                        Please select at least one ticket to continue with your
                        registration.
                      </div>
                    )}
                  </div>
                )}

                {activeDraft.step === "buyer" && (
                  <div className="space-y-6">
                    <BuyerDetailsStep
                      booker={activeDraft.booker}
                      onBookerChange={handleBookerChange}
                      errors={buyerValidation?.errors}
                      onFieldBlur={handleBookerFieldBlur}
                    />
                    {!completedByStep.buyer && (
                      <div className="rounded-lg border border-destructive/20 bg-destructive/5 p-4 text-sm font-medium text-destructive">
                        Please provide your contact information to continue.
                      </div>
                    )}
                  </div>
                )}

                {activeDraft.step === "rooms" && (
                  <div className="space-y-6">
                    <RoomAssignmentStep
                      event={activeEvent}
                      attendees={activeDraft.attendees}
                      assignments={activeDraft.assignments}
                      acknowledgeRandomFill={activeDraft.acknowledgeRandomFill}
                      onAssignmentChange={handleRoomAssignmentsChange}
                      onAcknowledgeRandomFillChange={
                        handleAcknowledgeRandomFill
                      }
                    />
                    {activeEvent.accommodation.eligible &&
                      roomSummary.unfilledBeds > 0 &&
                      !activeDraft.acknowledgeRandomFill && (
                        <div className="rounded-lg border border-destructive/20 bg-destructive/5 p-4 text-sm font-medium text-destructive">
                          Acknowledge random-fill risk or assign all beds before
                          continuing.
                        </div>
                      )}
                  </div>
                )}

                {activeDraft.step === "attendees" && (
                  <AttendeeDetailsStep
                    attendees={activeDraft.attendees}
                    validationSummary={attendeeValidation}
                    onAttendeeChange={handleAttendeeChange}
                  />
                )}

                {activeDraft.step === "review" && (
                  <ReviewSubmitStep
                    draft={activeDraft}
                    event={activeEvent}
                    submitResult={submitResult}
                    submitError={submitError}
                    isSubmitting={isSubmitting}
                    onSubmit={handleSubmitFromReview}
                    skipRooms={skipRooms}
                  />
                )}

                <Separator className="my-8" />

                <SignupNavigation
                  currentStepIndex={currentStepIndex}
                  totalSteps={SIGNUP_STEP_ORDER.length}
                  canProceed={
                    completedByStep[activeDraft.step] ||
                    activeDraft.step === "review"
                  }
                  onBack={moveBack}
                  onNext={
                    activeDraft.step === "review"
                      ? handleSubmitFromReview
                      : moveNext
                  }
                  isSubmitting={isSubmitting}
                  showSubmit={activeDraft.step === "review"}
                  submitLabel="Complete Registration"
                />
              </div>
            </CardContent>
          </Card>

          {/* Mobile Summary (only visible on small screens) */}
          <Card className="bg-muted/10 lg:hidden">
            <CardHeader>
              <CardTitle className="text-sm font-bold tracking-wider text-muted-foreground uppercase">
                Registration Summary
              </CardTitle>
            </CardHeader>
            <CardContent>
              <SignupSummary event={activeEvent} draft={activeDraft} />
            </CardContent>
          </Card>
        </div>
      </main>
    </div>
  )
}
