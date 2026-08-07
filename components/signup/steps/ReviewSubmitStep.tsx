"use client"

import { AlertTriangle, Info } from "lucide-react"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import type { SignupDraft } from "@/components/signup/state"
import type { SignupClientErrorCode } from "@/components/signup/submission-client"
import type { SignupSubmissionResult } from "@/lib/types/signup"
import type { PublicSignupQuoteRenderState } from "@/lib/convex/hooks/signup"
import { ReviewSection } from "@/components/signup/ReviewSection"
import { TurnstileCaptcha } from "@/components/signup/TurnstileCaptcha"
import { formatPrice } from "@/lib/utils"

type ReviewSubmitStepProps = {
  draft: SignupDraft
  currency: string
  quote: PublicSignupQuoteRenderState
  submitResult: SignupSubmissionResult | null
  submitError: { code: SignupClientErrorCode; message: string } | null
  isSubmitting: boolean
  captchaToken: string | null
  onCaptchaTokenChange: (token: string | null) => void
}

function formatAttendeeGender(gender: string): string {
  if (gender === "male") return "Male"
  if (gender === "female") return "Female"
  return gender || "Not specified"
}

function formatOccupancy(occupancy: "single" | "shared" | "family" | undefined): string {
  if (occupancy === "single") return "Single"
  if (occupancy === "shared") return "Shared"
  if (occupancy === "family") return "Family"
  return ""
}

function AttendeeDetailRow({
  label,
  value,
  isEmpty,
}: {
  label: string
  value: string
  isEmpty?: boolean
}) {
  return (
    <div className="grid grid-cols-[120px_1fr] gap-2 py-1">
      <span className="text-muted-foreground">{label}:</span>
      <span className={isEmpty ? "text-muted-foreground/70 italic" : ""}>
        {value || "-"}
      </span>
    </div>
  )
}

function QuoteContent({
  quote,
  draft,
  currency,
}: {
  quote: NonNullable<Extract<PublicSignupQuoteRenderState, { status: "ready" }>["quote"]>
  draft: SignupDraft
  currency: string
}) {
  // WR-07: every server amount below is formatted with the LIVE quote
  // currency, never the catalog event currency — if the event currency
  // changed after catalog load (or the two reactive reads momentarily
  // disagree), the review must still show the amount under the currency the
  // quote was actually priced in. The event currency is retained only as a
  // fallback for pre-quote copy.
  const displayCurrency = quote.currency || currency
  const attendeeNameByKey = new Map(
    draft.attendees.map((attendee) => [attendee.attendeeKey, attendee.name])
  )

  return (
    <div className="space-y-4">
      <ReviewSection
        title="Tickets"
        subtitle={`Total: ${formatPrice(quote.ticketTotalMinor, displayCurrency)}`}
        badge={quote.attendees.length}
        defaultExpanded={true}
      >
        <div className="space-y-2">
          {quote.attendees.map((attendee) => (
            <div
              key={attendee.attendeeKey}
              className="flex items-center justify-between gap-3 rounded-md border border-border/50 p-3"
            >
              <div className="min-w-0">
                <p className="break-words font-medium text-foreground">
                  {attendeeNameByKey.get(attendee.attendeeKey) ||
                    `Attendee ${attendee.attendeeKey}`}
                </p>
                <p className="break-words text-xs text-muted-foreground">
                  {attendee.ticketLabel}
                </p>
              </div>
              <span className="shrink-0 font-mono text-sm font-medium tabular-nums text-foreground/80">
                {formatPrice(attendee.ticketPriceMinor, displayCurrency)}
              </span>
            </div>
          ))}
        </div>
      </ReviewSection>

      <ReviewSection
        title="Accommodation"
        subtitle={`Total: ${formatPrice(quote.accommodationTotalMinor, displayCurrency)}`}
        badge={quote.attendees.filter(
          (attendee) => attendee.categoryLabel || attendee.lines.length > 0
        ).length}
        defaultExpanded={true}
      >
        {quote.attendees.every((attendee) => !attendee.categoryLabel) ? (
          <p className="text-sm text-muted-foreground">
            No accommodation is configured for this event.
          </p>
        ) : (
          <div className="space-y-4">
            {quote.attendees.map((attendee) => {
              if (!attendee.categoryLabel && attendee.lines.length === 0) {
                return null
              }
              const occupancy = formatOccupancy(attendee.occupancy)
              return (
                <div key={attendee.attendeeKey}>
                  <p className="mb-2 text-sm font-medium text-foreground">
                    {attendeeNameByKey.get(attendee.attendeeKey) ||
                      `Attendee ${attendee.attendeeKey}`}
                    {attendee.categoryLabel
                      ? ` — ${attendee.categoryLabel}`
                      : ""}
                    {occupancy ? ` · ${occupancy}` : ""}
                  </p>
                  <div className="space-y-2">
                    {attendee.categoryLabel && attendee.accommodationIncluded ? (
                      <div className="flex items-center justify-between rounded-md border border-emerald-600/30 bg-emerald-50/50 p-3 text-sm dark:bg-emerald-950/30">
                        <div className="min-w-0">
                          <p className="break-words font-medium text-foreground">
                            Accommodation
                          </p>
                          <p className="text-xs text-muted-foreground">
                            {attendee.baseNights}{" "}
                            {attendee.baseNights === 1 ? "night" : "nights"}
                            {" · included with your ticket"}
                          </p>
                        </div>
                        <span className="shrink-0 font-mono text-sm font-medium tabular-nums text-emerald-700 dark:text-emerald-400">
                          Included
                        </span>
                      </div>
                    ) : null}
                    {attendee.lines.map((line, index) => (
                      <div
                        key={`${attendee.attendeeKey}-${line.kind}-${index}`}
                        className="flex items-center justify-between rounded-md border border-border/50 p-3 text-sm"
                      >
                        <div className="min-w-0">
                          <p className="break-words font-medium text-foreground">
                            {line.label}
                          </p>
                          <p className="text-xs text-muted-foreground">
                            {formatPrice(line.ratePerNightMinor, displayCurrency)}{" "}
                            / person / night
                            {line.nights > 1
                              ? ` · ${line.nights} nights`
                              : ""}
                          </p>
                        </div>
                        <span className="shrink-0 font-mono text-sm font-medium tabular-nums text-foreground/80">
                          {formatPrice(line.chargeMinor, displayCurrency)}
                        </span>
                      </div>
                    ))}
                  </div>
                </div>
              )
            })}
            {quote.breakfastIncluded ? (
              <p className="text-sm font-medium text-emerald-700 dark:text-emerald-400">
                Breakfast is included.
              </p>
            ) : null}
          </div>
        )}
      </ReviewSection>

      <div className="space-y-2 rounded-lg border border-border/50 bg-muted/20 p-4">
        <div className="flex items-center justify-between text-sm">
          <span className="font-medium text-foreground">Tickets</span>
          <span className="font-mono tabular-nums text-foreground/80">
            {formatPrice(quote.ticketTotalMinor, displayCurrency)}
          </span>
        </div>
        <div className="flex items-center justify-between text-sm">
          <span className="font-medium text-foreground">Accommodation</span>
          <span className="font-mono tabular-nums text-foreground/80">
            {formatPrice(quote.accommodationTotalMinor, displayCurrency)}
          </span>
        </div>
        <div className="flex items-center justify-between border-t border-border/50 pt-2">
          <span className="font-bold text-foreground">Total due</span>
          <span className="font-mono text-lg font-bold tabular-nums text-foreground">
            {formatPrice(quote.totalDueMinor, displayCurrency)}
          </span>
        </div>
        <div className="flex items-start gap-2 pt-1 text-xs text-muted-foreground">
          <Info className="mt-0.5 size-3.5 shrink-0" />
          <p>
            Prices are live and provisional: they may change if the event
            configuration changes before you submit. Final room placement will
            be confirmed by the organizer.
          </p>
        </div>
      </div>
    </div>
  )
}

export function ReviewSubmitStep({
  draft,
  currency,
  quote,
  submitResult,
  submitError,
  isSubmitting,
  captchaToken,
  onCaptchaTokenChange,
}: ReviewSubmitStepProps) {
  if (submitResult) {
    return null
  }

  return (
    <div className="space-y-4">
      <Card className="mt-5">
        <CardHeader>
          <CardTitle className="text-base">Buyer Details</CardTitle>
        </CardHeader>
        <CardContent className="text-sm text-muted-foreground">
          <AttendeeDetailRow
            label="Name"
            value={draft.booker.name}
            isEmpty={!draft.booker.name}
          />
          <AttendeeDetailRow
            label="Email"
            value={draft.booker.email}
            isEmpty={!draft.booker.email}
          />
          <AttendeeDetailRow
            label="Phone"
            value={draft.booker.phone}
            isEmpty={!draft.booker.phone}
          />
        </CardContent>
      </Card>

      {/* Quote-backed tickets + accommodation */}
      {quote.status === "loading" || quote.status === "incomplete" ? (
        <Card>
          <CardHeader>
            <CardTitle className="text-base">Your live quote</CardTitle>
          </CardHeader>
          <CardContent>
            <div
              aria-live="polite"
              className="flex items-center gap-2 text-sm text-muted-foreground"
            >
              <span className="size-4 animate-spin rounded-full border-2 border-border border-t-primary" />
              {quote.status === "incomplete"
                ? "Complete the accommodation selections to see your live quote."
                : "Loading your live quote..."}
            </div>
          </CardContent>
        </Card>
      ) : quote.status === "error" ? (
        <Card>
          <CardHeader>
            <CardTitle className="text-base">Your live quote</CardTitle>
          </CardHeader>
          <CardContent>
            <div
              role="alert"
              className="flex items-start gap-2 rounded-lg border border-destructive/30 bg-destructive/10 p-3 text-sm text-destructive"
            >
              <AlertTriangle className="mt-0.5 size-4 shrink-0" />
              <div>
                <p className="font-medium">Quote unavailable</p>
                <p>{quote.message}</p>
                <p className="mt-1 text-xs">
                  Please review your accommodation selections before
                  submitting.
                </p>
              </div>
            </div>
          </CardContent>
        </Card>
      ) : quote.status === "unconfigured" ? (
        <Card>
          <CardHeader>
            <CardTitle className="text-base">Your live quote</CardTitle>
          </CardHeader>
          <CardContent>
            <p className="text-sm text-muted-foreground">
              No accommodation is configured for this event; you will be
              charged for your selected tickets only.
            </p>
          </CardContent>
        </Card>
      ) : (
        <QuoteContent quote={quote.quote} draft={draft} currency={currency} />
      )}

      {/* Attendee Details Section */}
      <ReviewSection
        title="Attendee Details"
        badge={draft.attendees.length}
        defaultExpanded={false}
      >
        {draft.attendees.length === 0 ? (
          <p className="text-muted-foreground">No attendees added.</p>
        ) : (
          <div className="space-y-4">
            {draft.attendees.map((attendee, index) => (
              <div
                key={attendee.attendeeKey}
                className="rounded-md border border-border/50 p-3"
              >
                <p className="mb-2 font-medium text-foreground">
                  Attendee {index + 1}: {attendee.name || "Unnamed"}
                </p>
                <div className="space-y-0.5 text-sm">
                  <AttendeeDetailRow
                    label="Ticket"
                    value={attendee.ticketLabel}
                  />
                  <AttendeeDetailRow
                    label="Email"
                    value={attendee.email}
                    isEmpty={!attendee.email}
                  />
                  <AttendeeDetailRow
                    label="Phone"
                    value={attendee.phone}
                    isEmpty={!attendee.phone}
                  />
                  <AttendeeDetailRow
                    label="Gender"
                    value={formatAttendeeGender(attendee.gender)}
                    isEmpty={!attendee.gender}
                  />
                  <AttendeeDetailRow
                    label="Location"
                    value={attendee.location}
                    isEmpty={!attendee.location}
                  />
                  <AttendeeDetailRow
                    label="Dietary"
                    value={attendee.dietaryRestrictions}
                    isEmpty={!attendee.dietaryRestrictions}
                  />
                  <AttendeeDetailRow
                    label="Roommate pref"
                    value={attendee.roommatePreference}
                    isEmpty={!attendee.roommatePreference}
                  />
                </div>
              </div>
            ))}
          </div>
        )}
      </ReviewSection>

      {draft.notes.trim() ? (
        <Card>
          <CardHeader>
            <CardTitle className="text-base">Notes</CardTitle>
          </CardHeader>
          <CardContent className="text-sm text-muted-foreground">
            {draft.notes}
          </CardContent>
        </Card>
      ) : null}

      <Card>
        <CardHeader>
          <CardTitle className="text-base">Verification</CardTitle>
        </CardHeader>
        <CardContent>
          <TurnstileCaptcha
            siteKey={process.env.NEXT_PUBLIC_TURNSTILE_SITE_KEY ?? ""}
            token={captchaToken}
            onTokenChange={onCaptchaTokenChange}
          />
        </CardContent>
      </Card>

      {submitError ? (
        <div
          role="alert"
          className="rounded-lg border border-destructive/30 bg-destructive/10 p-3 text-sm text-destructive"
        >
          <p className="font-medium">{submitError.code}</p>
          <p>{submitError.message}</p>
        </div>
      ) : null}
    </div>
  )
}
