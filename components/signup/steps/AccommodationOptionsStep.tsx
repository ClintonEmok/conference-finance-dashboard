"use client"

import { BedDouble, CalendarDays, Info, Minus, Plus } from "lucide-react"

import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { formatPrice } from "@/lib/utils"
import type { PublicSignupCatalogEvent } from "@/lib/domain/signup/catalog"
import { eventHasConfiguredAccommodation } from "@/components/signup/flow-rules"
import type {
  AccommodationSelectionDraft,
  AttendeeDraft,
} from "@/components/signup/state"

type AccommodationOptionsStepProps = {
  event: PublicSignupCatalogEvent
  attendees: AttendeeDraft[]
  accommodationSelections: Record<string, AccommodationSelectionDraft>
  onChange: (
    attendeeKey: string,
    patch: Partial<AccommodationSelectionDraft>
  ) => void
}

function emptySelection(): AccommodationSelectionDraft {
  return {
    occupancy: "",
    optionSelections: [],
  }
}

function formatStayDate(epoch: number, timeZone: string): string {
  return new Intl.DateTimeFormat("en-GB", {
    timeZone,
    weekday: "short",
    day: "numeric",
    month: "short",
    year: "numeric",
  }).format(new Date(epoch))
}

/**
 * The independent night-before choice. The buyer never derives money: the
 * per-night display rates come from the server catalog (`nightBefore`), and
 * only the chosen level is sent to the server.
 */
function NightBeforeChoice({
  attendeeKey,
  occupancy,
  nightBefore,
  value,
  currency,
  onChange,
}: {
  attendeeKey: string
  occupancy: string
  nightBefore: NonNullable<PublicSignupCatalogEvent["accommodation"]["nightBefore"]>
  value: "standard" | "superior" | undefined
  currency: string
  onChange: (level: "standard" | "superior" | undefined) => void
}) {
  const rates =
    occupancy === "single"
      ? {
          standard: nightBefore.standard.single,
          superior: nightBefore.superior.single,
        }
      : {
          standard: nightBefore.standard.shared,
          superior: nightBefore.superior.shared,
        }

  const options: Array<{
    level: "standard" | "superior"
    label: string
    rateMinor: number
  }> = [
    { level: "standard", label: "Standard", rateMinor: rates.standard },
    { level: "superior", label: "Superior", rateMinor: rates.superior },
  ]

  return (
    <div className="space-y-2">
      <span
        id={`night-before-legend-${attendeeKey}`}
        className="block text-sm font-medium text-foreground"
      >
        Night before the event
      </span>
      <div
        role="radiogroup"
        aria-labelledby={`night-before-legend-${attendeeKey}`}
        className="flex flex-wrap gap-3"
      >
        <label
          className={`flex cursor-pointer items-center gap-2 rounded-lg border px-3 py-2 transition-colors ${
            value === undefined
              ? "border-primary bg-primary/5"
              : "border-border/60 hover:border-primary/40"
          }`}
        >
          <input
            type="radio"
            name={`night-before-${attendeeKey}`}
            value="none"
            checked={value === undefined}
            onChange={() => onChange(undefined)}
            className="size-4 accent-primary"
          />
          <span className="text-sm text-foreground">No night before</span>
        </label>
        {options.map((option) => {
          const selected = value === option.level
          return (
            <label
              key={option.level}
              className={`flex cursor-pointer items-center gap-2 rounded-lg border px-3 py-2 transition-colors ${
                selected
                  ? "border-primary bg-primary/5"
                  : "border-border/60 hover:border-primary/40"
              }`}
            >
              <input
                type="radio"
                name={`night-before-${attendeeKey}`}
                value={option.level}
                checked={selected}
                onChange={() => onChange(option.level)}
                className="size-4 accent-primary"
              />
              <span className="text-sm capitalize text-foreground">
                {option.label}
              </span>
              <span className="font-mono text-xs tabular-nums text-muted-foreground">
                {formatPrice(option.rateMinor, currency)} / night
              </span>
            </label>
          )
        })}
      </div>
    </div>
  )
}

export function AccommodationOptionsStep({
  event,
  attendees,
  accommodationSelections,
  onChange,
}: AccommodationOptionsStepProps) {
  const configured = eventHasConfiguredAccommodation(event)

  if (!configured) {
    return (
      <Card className="mt-5">
        <CardHeader>
          <CardTitle className="text-base">Accommodation options</CardTitle>
        </CardHeader>
        <CardContent>
          <div className="flex items-start gap-3 rounded-lg border border-border/50 bg-muted/20 p-4 text-sm text-muted-foreground">
            <Info className="mt-0.5 size-4 shrink-0" />
            <p>
              Accommodation options are not currently configured for this
              event. You can continue without accommodation preferences; the
              organizer will contact you if accommodation becomes available.
            </p>
          </div>
        </CardContent>
      </Card>
    )
  }

  const nightBefore = event.accommodation.nightBefore

  return (
    <div className="space-y-6">
      {event.accommodation.config ? (
        <div className="rounded-xl border border-border/50 bg-card p-4 shadow-sm sm:p-6">
          <div className="flex items-start gap-3">
            <CalendarDays className="mt-0.5 size-5 shrink-0 text-primary" />
            <div className="min-w-0 space-y-2">
              <div>
                <h3 className="text-base font-semibold text-foreground">
                  Included accommodation (Standard)
                </h3>
                <p className="text-sm text-muted-foreground">
                  The included stay is always a Standard room — you only choose
                  occupancy, add-ons, and whether you want the night before.
                  Final room placement is confirmed by the organizer.
                </p>
              </div>
              <dl className="grid gap-x-6 gap-y-1 text-sm sm:grid-cols-2">
                <div className="flex items-center justify-between gap-2">
                  <dt className="text-muted-foreground">Check-in</dt>
                  <dd className="font-medium tabular-nums text-foreground">
                    {formatStayDate(
                      event.accommodation.config.baseCheckInAt,
                      event.timezone
                    )}
                  </dd>
                </div>
                <div className="flex items-center justify-between gap-2">
                  <dt className="text-muted-foreground">Check-out</dt>
                  <dd className="font-medium tabular-nums text-foreground">
                    {formatStayDate(
                      event.accommodation.config.baseCheckOutAt,
                      event.timezone
                    )}
                  </dd>
                </div>
                <div className="flex items-center justify-between gap-2">
                  <dt className="text-muted-foreground">Nights</dt>
                  <dd className="font-medium tabular-nums text-foreground">
                    {event.accommodation.config.nightCount}
                  </dd>
                </div>
                <div className="flex items-center justify-between gap-2">
                  <dt className="text-muted-foreground">Breakfast</dt>
                  <dd className="font-medium text-foreground">
                    {event.accommodation.config.breakfastIncluded
                      ? "Included"
                      : "Not included"}
                  </dd>
                </div>
              </dl>
            </div>
          </div>
        </div>
      ) : null}

      {attendees.map((attendee, index) => {
        const ticket = event.tickets.find(
          (ticketType) => ticketType.ticketTypeId === attendee.ticketTypeId
        )
        const selection = accommodationSelections[attendee.attendeeKey]
        const current = selection ?? emptySelection()

        function patch(patchValue: Partial<AccommodationSelectionDraft>) {
          onChange(attendee.attendeeKey, patchValue)
        }

        function updateOption(
          optionKey: string,
          quantity: number,
          nights: number
        ) {
          const others = current.optionSelections.filter(
            (optionSelection) => optionSelection.optionKey !== optionKey
          )
          const next: AccommodationSelectionDraft["optionSelections"] = [
            ...others,
          ]
          if (quantity > 0 && nights > 0) {
            next.push({ optionKey, quantity, nights })
          }
          patch({ optionSelections: next })
        }

        return (
          <fieldset
            key={attendee.attendeeKey}
            className="min-w-0 rounded-xl border border-border/50 bg-card p-4 shadow-sm sm:p-6"
          >
            <legend className="px-1 text-sm font-semibold text-foreground">
              Attendee {index + 1}
              {attendee.name ? ` — ${attendee.name}` : ""}
            </legend>

            <div className="space-y-4">
              <div className="flex flex-wrap items-center gap-2">
                <span className="text-sm text-muted-foreground">
                  Your selected ticket:
                </span>
                <Badge variant="secondary" className="font-medium">
                  {ticket?.label ?? attendee.ticketLabel}
                </Badge>
                {ticket?.accommodationIncluded ? (
                  <Badge
                    variant="outline"
                    className="border-emerald-600/40 bg-emerald-50 text-emerald-700 dark:bg-emerald-950 dark:text-emerald-400"
                  >
                    Accommodation included with ticket
                  </Badge>
                ) : null}
              </div>

              <div className="space-y-2">
                <span
                  id={`occupancy-legend-${attendee.attendeeKey}`}
                  className="block text-sm font-medium text-foreground"
                >
                  Occupancy <span className="text-destructive">*</span>
                </span>
                <div
                  role="radiogroup"
                  aria-labelledby={`occupancy-legend-${attendee.attendeeKey}`}
                  className="flex flex-wrap gap-3"
                >
                  {(["single", "shared"] as const).map((occupancy) => {
                    const selected = current.occupancy === occupancy
                    return (
                      <label
                        key={occupancy}
                        className={`flex cursor-pointer items-center gap-2 rounded-lg border px-3 py-2 transition-colors ${
                          selected
                            ? "border-primary bg-primary/5"
                            : "border-border/60 hover:border-primary/40"
                        }`}
                      >
                        <input
                          type="radio"
                          name={`occupancy-${attendee.attendeeKey}`}
                          value={occupancy}
                          checked={selected}
                          onChange={() => patch({ occupancy })}
                          className="size-4 accent-primary"
                        />
                        <span className="text-sm capitalize text-foreground">
                          {occupancy}
                        </span>
                      </label>
                    )
                  })}
                </div>
              </div>

              {event.accommodation.options.length > 0 ? (
                <div className="space-y-2">
                  <span className="block text-sm font-medium text-foreground">
                    Add-ons
                  </span>
                  <div className="grid gap-3">
                    {event.accommodation.options.map((option) => {
                      const selectedOption = current.optionSelections.find(
                        (optionSelection) =>
                          optionSelection.optionKey === option.optionKey
                      )
                      const quantity = selectedOption?.quantity ?? 0
                      const nights = selectedOption?.nights ?? 0
                      const isSelected = quantity > 0 && nights > 0
                      const baseNights =
                        event.accommodation.config?.nightCount ?? 1
                      // The included-stay Superior upgrade is a fixed
                      // add-on: exactly one attendee for the included base
                      // nights. The server remains the charge authority.
                      const isIncludedStayUpgrade =
                        option.optionKey === "superior_upgrade"
                      return (
                        <div
                          key={option.optionKey}
                          className={`flex min-w-0 flex-col gap-2 rounded-lg border p-3 transition-colors ${
                            isSelected
                              ? "border-primary bg-primary/5"
                              : "border-border/60"
                          }`}
                        >
                          <div className="flex items-start justify-between gap-2">
                            <span className="min-w-0">
                              <span className="block text-sm font-medium text-foreground">
                                {option.label}
                              </span>
                              <span className="block text-xs text-muted-foreground">
                                {isIncludedStayUpgrade
                                  ? `${formatPrice(
                                      option.priceMinor,
                                      event.currency
                                    )} / person / night for the included stay`
                                  : `${formatPrice(
                                      option.priceMinor,
                                      event.currency
                                    )} / unit / night`}
                              </span>
                            </span>
                            <Button
                              type="button"
                              variant="outline"
                              size="sm"
                              aria-pressed={isSelected}
                              onClick={() => {
                                if (isSelected) {
                                  updateOption(option.optionKey, 0, 0)
                                } else if (isIncludedStayUpgrade) {
                                  updateOption(
                                    option.optionKey,
                                    1,
                                    baseNights
                                  )
                                } else {
                                  updateOption(option.optionKey, 1, baseNights)
                                }
                              }}
                              className="shrink-0"
                            >
                              {isSelected ? "Remove" : "Add"}
                            </Button>
                          </div>
                          {isSelected && !isIncludedStayUpgrade ? (
                            <div className="flex items-center justify-between gap-2">
                              <label className="flex items-center gap-2 text-xs text-muted-foreground">
                                <span>How many</span>
                                <span className="flex items-center gap-1">
                                  <Button
                                    type="button"
                                    variant="outline"
                                    size="icon-sm"
                                    aria-label={`Decrease quantity of ${option.label}`}
                                    onClick={() =>
                                      updateOption(
                                        option.optionKey,
                                        Math.max(0, quantity - 1),
                                        nights
                                      )
                                    }
                                  >
                                    <Minus
                                      className="size-3"
                                      aria-hidden="true"
                                    />
                                  </Button>
                                  <span className="w-8 text-center font-mono text-sm tabular-nums text-foreground">
                                    {quantity}
                                  </span>
                                  <Button
                                    type="button"
                                    variant="outline"
                                    size="icon-sm"
                                    aria-label={`Increase quantity of ${option.label}`}
                                    onClick={() =>
                                      updateOption(
                                        option.optionKey,
                                        quantity + 1,
                                        nights
                                      )
                                    }
                                  >
                                    <Plus
                                      className="size-3"
                                      aria-hidden="true"
                                    />
                                  </Button>
                                </span>
                              </label>
                              <label className="flex items-center gap-2 text-xs text-muted-foreground">
                                <span>Nights</span>
                                <span className="flex items-center gap-1">
                                  <Button
                                    type="button"
                                    variant="outline"
                                    size="icon-sm"
                                    aria-label={`Decrease nights for ${option.label}`}
                                    onClick={() =>
                                      updateOption(
                                        option.optionKey,
                                        quantity,
                                        Math.max(0, nights - 1)
                                      )
                                    }
                                  >
                                    <Minus
                                      className="size-3"
                                      aria-hidden="true"
                                    />
                                  </Button>
                                  <span className="w-8 text-center font-mono text-sm tabular-nums text-foreground">
                                    {nights}
                                  </span>
                                  <Button
                                    type="button"
                                    variant="outline"
                                    size="icon-sm"
                                    aria-label={`Increase nights for ${option.label}`}
                                    onClick={() =>
                                      updateOption(
                                        option.optionKey,
                                        quantity,
                                        nights + 1
                                      )
                                    }
                                  >
                                    <Plus
                                      className="size-3"
                                      aria-hidden="true"
                                    />
                                  </Button>
                                </span>
                              </label>
                            </div>
                          ) : null}
                        </div>
                      )
                    })}
                  </div>
                </div>
              ) : null}

              {nightBefore ? (
                <NightBeforeChoice
                  attendeeKey={attendee.attendeeKey}
                  occupancy={current.occupancy}
                  nightBefore={nightBefore}
                  value={current.nightBeforeLevel}
                  currency={event.currency}
                  onChange={(level) => patch({ nightBeforeLevel: level })}
                />
              ) : null}

              <div className="flex items-start gap-2 rounded-lg border border-border/50 bg-muted/20 p-3 text-xs text-muted-foreground">
                <BedDouble className="mt-0.5 size-4 shrink-0" />
                <p>
                  You are choosing accommodation preferences only. Final room
                  placement will be confirmed by the organizer.
                </p>
              </div>
            </div>
          </fieldset>
        )
      })}
    </div>
  )
}
