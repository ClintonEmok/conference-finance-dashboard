"use client"

import { useEffect, useMemo, useRef, useState } from "react"
import { useRouter } from "next/navigation"

import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { Skeleton } from "@/components/ui/skeleton"
import { normalizePublicSignupCatalog } from "@/lib/domain/signup/catalog"
import {
  usePublicSignupCatalogRaw,
  usePublicSignupAccommodationQuote,
  type PublicSignupAccommodationQuote,
  type PublicSignupQuoteRenderState,
} from "@/lib/convex/hooks/signup"
import {
  createInitialSignupDraft,
  deriveAttendeeDraftsFromTicketSelections,
  invalidateDownstreamForTicketChange,
  SIGNUP_STEP_ORDER,
  type AccommodationSelectionDraft,
  type SignupDraft,
  type SignupStep,
  type TicketSelectionDraft,
} from "@/components/signup/state"
import {
  allAttendeesHaveAccommodationSelections,
  eventHasConfiguredAccommodation,
} from "@/components/signup/flow-rules"
import { TicketStep } from "@/components/signup/steps/TicketStep"
import { AccommodationOptionsStep } from "@/components/signup/steps/AccommodationOptionsStep"
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

function emptyAccommodationSelection(): AccommodationSelectionDraft {
  return {
    occupancy: "",
    optionSelections: [],
  }
}

function isQuoteResult(value: unknown): value is PublicSignupAccommodationQuote {
  return (
    Boolean(value) &&
    typeof value === "object" &&
    "totalDueMinor" in (value as Record<string, unknown>) &&
    "attendees" in (value as Record<string, unknown>)
  )
}

function quoteErrorMessage(value: unknown): string | null {
  if (!value || typeof value !== "object") {
    return null
  }
  const record = value as Record<string, unknown>
  if ("totalDueMinor" in record) {
    return null
  }
  if (typeof record.message === "string") {
    return record.message
  }
  if (record instanceof Error) {
    return record.message
  }
  return null
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
  const [captchaToken, setCaptchaToken] = useState<string | null>(null)
  const [idempotencyKey] = useState(() => `signup-${Date.now()}`)

  // Quote staleness: the quote query is only issued for a complete selection
  // set; a rendered quote is only trusted when its signature matches the
  // current draft selections.
  const [quoteReadyForSignature, setQuoteReadyForSignature] = useState<
    string | null
  >(null)
  const [quoteError, setQuoteError] = useState<string | null>(null)
  const quoteSignatureRef = useRef<string | null>(null)

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

  const configuredAccommodation = event
    ? eventHasConfiguredAccommodation(event)
    : false

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

  // The quote hook receives only attendee keys, ticket IDs, occupancy,
  // option selections, and the independent night-before level — never client
  // prices, dates, categories, room IDs, slot IDs, or totals. For a
  // configured event it is only issued once every attendee has an occupancy
  // selection; for an unconfigured event a server ticket-only quote is issued
  // so the review can show a server-derived total and the flow stays
  // submittable (CR-05).
  const quoteAttendeeArgs = useMemo(() => {
    if (!draft) return null
    return draft.attendees.map((attendee) => {
      const selection = draft.accommodationSelections[attendee.attendeeKey]
      return {
        attendeeKey: attendee.attendeeKey,
        ticketTypeId: attendee.ticketTypeId,
        occupancy: selection?.occupancy || undefined,
        // Omitted nightBeforeLevel means "no night before"; the server
        // resolves the derived total stay and all money authoritatively.
        nightBeforeLevel: selection?.nightBeforeLevel,
        optionSelections: selection?.optionSelections ?? [],
      }
    })
  }, [draft?.attendees, draft?.accommodationSelections])

  const quoteSignature = useMemo(
    () => JSON.stringify(quoteAttendeeArgs),
    [quoteAttendeeArgs]
  )

  const allAccommodationSelected = useMemo(() => {
    if (!draft) return false
    return allAttendeesHaveAccommodationSelections(
      draft.attendees,
      draft.accommodationSelections
    )
  }, [draft?.attendees, draft?.accommodationSelections])

  const shouldQueryQuote =
    Boolean(eventId) &&
    draft !== null &&
    draft.attendees.length > 0 &&
    (!configuredAccommodation || allAccommodationSelected)

  const quoteResult = usePublicSignupAccommodationQuote(
    eventId,
    shouldQueryQuote ? quoteAttendeeArgs : null
  )

  useEffect(() => {
    quoteSignatureRef.current = quoteSignature
  }, [quoteSignature])

  useEffect(() => {
    if (quoteResult === undefined) {
      return
    }
    const errorMessage = quoteErrorMessage(quoteResult)
    if (errorMessage !== null) {
      setQuoteReadyForSignature(null)
      setQuoteError(errorMessage)
      return
    }
    setQuoteReadyForSignature(quoteSignatureRef.current)
    setQuoteError(null)
  }, [quoteResult, quoteSignature])

  const quoteRenderState: PublicSignupQuoteRenderState = (() => {
    if (quoteError) {
      return { status: "error", message: quoteError }
    }
    if (configuredAccommodation && !allAccommodationSelected) {
      return { status: "incomplete" }
    }
    if (
      quoteResult === undefined ||
      quoteReadyForSignature !== quoteSignature ||
      !isQuoteResult(quoteResult)
    ) {
      // For an unconfigured event the server ticket-only quote is still
      // loading; show the honest unconfigured copy until it arrives, then
      // flip to ready (CR-05). No fabricated zero totals are rendered.
      return {
        status: !configuredAccommodation ? "unconfigured" : "loading",
      }
    }
    return { status: "ready", quote: quoteResult }
  })()

  useEffect(() => {
    if (draft?.step !== "review") {
      setCaptchaToken(null)
    }
  }, [draft?.step])

  const completedByStep: Record<SignupStep, boolean> = useMemo(() => {
    if (!event || !draft) {
      return {
        tickets: false,
        buyer: false,
        attendees: false,
        accommodation: false,
        review: false,
      }
    }
    return {
      tickets: totalSelectedTickets > 0,
      buyer: buyerValidationSnapshot.isValid,
      attendees: draft.attendees.length > 0 && attendeeValidationSnapshot.isValid,
      accommodation: !configuredAccommodation || allAccommodationSelected,
      review: false,
    }
  }, [
    draft?.attendees?.length,
    configuredAccommodation,
    allAccommodationSelected,
    buyerValidationSnapshot.isValid,
    attendeeValidationSnapshot.isValid,
    totalSelectedTickets,
  ])

  // Early returns after all hooks are called
  if (catalogRaw === undefined) {
    return (
      <main className="mx-auto flex min-h-svh w-full max-w-3xl items-center justify-center p-6">
        <div className="w-full max-w-lg space-y-4 rounded-2xl border bg-card/70 p-6 shadow-sm backdrop-blur">
          <div className="flex items-center gap-3">
            <Skeleton className="size-10 rounded-full" />
            <div className="space-y-2">
              <Skeleton className="h-4 w-28" />
              <Skeleton className="h-3 w-44" />
            </div>
          </div>
          <Skeleton className="h-10 w-full rounded-xl" />
          <Skeleton className="h-28 w-full rounded-2xl" />
          <div className="grid gap-3 sm:grid-cols-3">
            <Skeleton className="h-10 rounded-full" />
            <Skeleton className="h-10 rounded-full" />
            <Skeleton className="h-10 rounded-full" />
          </div>
        </div>
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
          roomTypeId: ticket.roomTypeId,
          roomTypeCategoryId: ticket.roomTypeCategoryId,
        }))

  function handleTicketSelectionsChange(
    nextSelections: TicketSelectionDraft[]
  ) {
    setAttendeeValidation(null)
    setSubmitResult(null)
    setSubmitError(null)
    setCaptchaToken(null)
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

  function handleAccommodationSelectionChange(
    attendeeKey: string,
    patch: Partial<AccommodationSelectionDraft>
  ) {
    setSubmitResult(null)
    setSubmitError(null)
    setCaptchaToken(null)
    setDraft((current) => {
      if (!current) {
        return current
      }

      const existing =
        current.accommodationSelections[attendeeKey] ??
        emptyAccommodationSelection()

      return {
        ...current,
        accommodationSelections: {
          ...current.accommodationSelections,
          [attendeeKey]: {
            ...existing,
            ...patch,
          },
        },
      }
    })
  }

  function handleAttendeeChange(
    attendeeKey: string,
    field: keyof SignupDraft["attendees"][number],
    value: string
  ) {
    setAttendeeValidation(null)
    setSubmitResult(null)
    setSubmitError(null)
    setCaptchaToken(null)
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
    setCaptchaToken(null)
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

  function handleCaptchaTokenChange(token: string | null) {
    setCaptchaToken(token)
    setSubmitError(null)
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

    // The quote is the only pricing authority: submission is blocked until a
    // fresh valid server quote exists for the current selections.
    if (quoteRenderState.status !== "ready") {
      setSubmitError({
        code: "SUBMISSION_CONFLICT",
        message:
          quoteRenderState.status === "incomplete"
            ? "Complete the accommodation selections to see your live quote before submitting."
            : "Your live quote is not ready yet. Please wait or review your selections.",
      })
      return
    }

    if (!captchaToken) {
      setSubmitError({
        code: "CAPTCHA_REQUIRED",
        message: "Complete the verification challenge before submitting.",
      })
      return
    }

    setIsSubmitting(true)
    setSubmitError(null)

    const result = await submitSignupDraft(activeDraft, {
      idempotencyKey,
      captchaToken,
    })

    if (!result.ok) {
      setSubmitResult(null)
      setSubmitError(result.error)
      setIsSubmitting(false)
      if (
        result.error.code === "CAPTCHA_REQUIRED" ||
        result.error.code === "CAPTCHA_FAILED"
      ) {
        setCaptchaToken(null)
      }
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
        : activeDraft.step === "attendees"
          ? "Attendee details"
          : activeDraft.step === "accommodation"
            ? "Accommodation options"
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
              <SignupSummary
                event={activeEvent}
                draft={activeDraft}
                quote={quoteRenderState}
              />
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

                {activeDraft.step === "attendees" && (
                  <AttendeeDetailsStep
                    attendees={activeDraft.attendees}
                    validationSummary={attendeeValidation}
                    onAttendeeChange={handleAttendeeChange}
                  />
                )}

                {activeDraft.step === "accommodation" && (
                  <div className="space-y-6">
                    <AccommodationOptionsStep
                      event={activeEvent}
                      attendees={activeDraft.attendees}
                      accommodationSelections={activeDraft.accommodationSelections}
                      onChange={handleAccommodationSelectionChange}
                    />
                    {configuredAccommodation &&
                      !allAccommodationSelected && (
                        <div
                          role="alert"
                          className="rounded-lg border border-destructive/20 bg-destructive/5 p-4 text-sm font-medium text-destructive"
                        >
                          Select an occupancy (Single or Shared) for every
                          attendee to continue.
                        </div>
                      )}
                  </div>
                )}

                {activeDraft.step === "review" && (
                  <ReviewSubmitStep
                    draft={activeDraft}
                    currency={activeEvent.currency}
                    quote={quoteRenderState}
                    submitResult={submitResult}
                    submitError={submitError}
                    isSubmitting={isSubmitting}
                    captchaToken={captchaToken}
                    onCaptchaTokenChange={handleCaptchaTokenChange}
                  />
                )}

                <Separator className="my-8" />

                <SignupNavigation
                  currentStepIndex={currentStepIndex}
                  totalSteps={SIGNUP_STEP_ORDER.length}
                  canProceed={
                    completedByStep[activeDraft.step] ||
                    (activeDraft.step === "review" &&
                      captchaToken !== null &&
                      // The review button stays gated on a fresh server quote
                      // (WR-03): an incomplete/loading/invalid quote must not
                      // offer an apparently valid submit action. Unconfigured
                      // events flip to ready once their ticket-only quote
                      // arrives (CR-05).
                      quoteRenderState.status === "ready")
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
              <SignupSummary
                event={activeEvent}
                draft={activeDraft}
                quote={quoteRenderState}
              />
            </CardContent>
          </Card>
        </div>
      </main>
    </div>
  )
}
