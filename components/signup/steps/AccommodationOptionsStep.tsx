"use client"

import { BedDouble, Info } from "lucide-react"

import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { Badge } from "@/components/ui/badge"
import { Label } from "@/components/ui/label"
import { formatPrice } from "@/lib/utils"
import type { PublicSignupCatalogEvent } from "@/lib/domain/signup/catalog"
import {
  eventHasConfiguredAccommodation,
} from "@/components/signup/flow-rules"
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
    categoryId: "",
    occupancy: "",
    upgradeSelected: false,
    cotSelected: false,
    ageBandCode: "",
  }
}

export function AccommodationOptionsStep({
  event,
  attendees,
  accommodationSelections,
  onChange,
}: AccommodationOptionsStepProps) {
  const configured = eventHasConfiguredAccommodation(event)
  const superiorOption = event.accommodation.options.find(
    (option) => option.optionCode === "superior_upgrade"
  )
  const cotOption = event.accommodation.options.find(
    (option) => option.optionCode === "cot"
  )
  const cotEligibilityLabel = cotOption?.eligibilityAgeBandCode
    ? event.accommodation.ageBands.find(
        (band) => band.code === cotOption.eligibilityAgeBandCode
      )?.label
    : null

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

  return (
    <div className="space-y-6">
      {attendees.map((attendee, index) => {
        const ticket = event.tickets.find(
          (ticketType) => ticketType.ticketTypeId === attendee.ticketTypeId
        )
        const selection = accommodationSelections[attendee.attendeeKey]
        const current = selection ?? emptySelection()

        // Ticket-constrained eligibility comes exclusively from the server
        // contract: when the ticket's room type resolves to a category, only
        // that category is offered.
        const eligibleCategories = event.accommodation.activeCategories.filter(
          (category) =>
            !ticket?.roomTypeCategoryId ||
            category.categoryId === ticket.roomTypeCategoryId
        )
        const selectedCategory = eligibleCategories.find(
          (category) => category.categoryId === current.categoryId
        )

        function patch(patchValue: Partial<AccommodationSelectionDraft>) {
          onChange(attendee.attendeeKey, patchValue)
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
              </div>

              {eligibleCategories.length === 0 ? (
                <div
                  role="alert"
                  className="rounded-lg border border-destructive/30 bg-destructive/10 p-3 text-sm text-destructive"
                >
                  No accommodation category is currently available for your
                  selected ticket.
                </div>
              ) : (
                <>
                  <div className="space-y-2">
                    <span
                      id={`category-legend-${attendee.attendeeKey}`}
                      className="block text-sm font-medium text-foreground"
                    >
                      Category
                    </span>
                    <div
                      role="radiogroup"
                      aria-labelledby={`category-legend-${attendee.attendeeKey}`}
                      className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3"
                    >
                      {eligibleCategories.map((category) => {
                        const selected =
                          current.categoryId === category.categoryId
                        return (
                          <label
                            key={category.categoryId}
                            className={`flex min-w-0 cursor-pointer items-start gap-3 rounded-lg border p-3 transition-colors ${
                              selected
                                ? "border-primary bg-primary/5"
                                : "border-border/60 hover:border-primary/40"
                            }`}
                          >
                            <input
                              type="radio"
                              name={`category-${attendee.attendeeKey}`}
                              value={category.categoryId}
                              checked={selected}
                              onChange={() =>
                                patch({ categoryId: category.categoryId })
                              }
                              className="mt-0.5 size-4 shrink-0 accent-primary"
                            />
                            <span className="min-w-0">
                              <span className="block text-sm font-medium text-foreground">
                                {category.label}
                              </span>
                              {category.rates.length > 0 && (
                                <span className="block text-xs text-muted-foreground">
                                  {category.rates
                                    .map(
                                      (rate) =>
                                        `${formatPrice(
                                          rate.pricePerPersonMinor,
                                          event.currency
                                        )} / person / night`
                                    )
                                    .join(" · ")}
                                </span>
                              )}
                            </span>
                          </label>
                        )
                      })}
                    </div>
                  </div>

                  {selectedCategory ? (
                    <div className="space-y-2">
                      <span
                        id={`occupancy-legend-${attendee.attendeeKey}`}
                        className="block text-sm font-medium text-foreground"
                      >
                        Room type
                      </span>
                      <div
                        role="radiogroup"
                        aria-labelledby={`occupancy-legend-${attendee.attendeeKey}`}
                        className="flex flex-wrap gap-3"
                      >
                        {selectedCategory.rates.map((rate) => {
                          const selected = current.occupancy === rate.occupancy
                          return (
                            <label
                              key={rate.occupancy}
                              className={`flex cursor-pointer items-center gap-2 rounded-lg border px-3 py-2 transition-colors ${
                                selected
                                  ? "border-primary bg-primary/5"
                                  : "border-border/60 hover:border-primary/40"
                              }`}
                            >
                              <input
                                type="radio"
                                name={`occupancy-${attendee.attendeeKey}`}
                                value={rate.occupancy}
                                checked={selected}
                                onChange={() =>
                                  patch({ occupancy: rate.occupancy })
                                }
                                className="size-4 accent-primary"
                              />
                              <span className="text-sm capitalize text-foreground">
                                {rate.occupancy}
                              </span>
                              <span className="font-mono text-xs tabular-nums text-muted-foreground">
                                {formatPrice(
                                  rate.pricePerPersonMinor,
                                  event.currency
                                )}{" "}
                                / night
                              </span>
                            </label>
                          )
                        })}
                      </div>
                    </div>
                  ) : null}

                  {event.accommodation.ageBands.length > 0 ? (
                    <div className="space-y-2">
                      <Label
                        htmlFor={`age-band-${attendee.attendeeKey}`}
                        className="text-sm font-medium"
                      >
                        Age band{" "}
                        <span className="font-normal text-muted-foreground">
                          (optional)
                        </span>
                      </Label>
                      <select
                        id={`age-band-${attendee.attendeeKey}`}
                        value={current.ageBandCode}
                        onChange={(eventValue) =>
                          patch({ ageBandCode: eventValue.target.value })
                        }
                        className="min-h-11 w-full rounded-lg border border-input bg-background px-3 py-2 text-sm text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary/50 sm:w-auto"
                      >
                        <option value="">Prefer not to say</option>
                        {event.accommodation.ageBands.map((band) => (
                          <option key={band.code} value={band.code}>
                            {band.label}
                          </option>
                        ))}
                      </select>
                    </div>
                  ) : null}

                  <div className="flex flex-col gap-3 sm:flex-row sm:flex-wrap">
                    {superiorOption ? (
                      <label
                        className={`flex min-w-0 cursor-pointer items-start gap-3 rounded-lg border p-3 transition-colors ${
                          current.upgradeSelected
                            ? "border-primary bg-primary/5"
                            : "border-border/60 hover:border-primary/40"
                        }`}
                      >
                        <input
                          type="checkbox"
                          checked={current.upgradeSelected}
                          onChange={(eventValue) =>
                            patch({
                              upgradeSelected: eventValue.target.checked,
                            })
                          }
                          className="mt-0.5 size-4 shrink-0 accent-primary"
                        />
                        <span className="min-w-0">
                          <span className="block text-sm font-medium text-foreground">
                            {superiorOption.label}
                          </span>
                          <span className="block text-xs text-muted-foreground">
                            {formatPrice(
                              superiorOption.priceMinor,
                              event.currency
                            )}{" "}
                            / person / night
                          </span>
                        </span>
                      </label>
                    ) : null}

                    {cotOption ? (
                      (() => {
                        const cotEligible =
                          Boolean(current.ageBandCode) &&
                          Boolean(cotOption.eligibilityAgeBandCode) &&
                          current.ageBandCode === cotOption.eligibilityAgeBandCode
                        const differentBandSelected =
                          Boolean(current.ageBandCode) &&
                          Boolean(cotOption.eligibilityAgeBandCode) &&
                          current.ageBandCode !== cotOption.eligibilityAgeBandCode
                        return (
                          <label
                            aria-disabled={!cotEligible}
                            className={`flex min-w-0 items-start gap-3 rounded-lg border p-3 transition-colors ${
                              current.cotSelected
                                ? "border-primary bg-primary/5"
                                : "border-border/60 hover:border-primary/40"
                            } ${
                              cotEligible
                                ? "cursor-pointer"
                                : "cursor-not-allowed opacity-50"
                            }`}
                          >
                            <input
                              type="checkbox"
                              disabled={!cotEligible}
                              checked={current.cotSelected}
                              onChange={(eventValue) =>
                                patch({ cotSelected: eventValue.target.checked })
                              }
                              className="mt-0.5 size-4 shrink-0 accent-primary"
                            />
                            <span className="min-w-0">
                              <span className="block text-sm font-medium text-foreground">
                                {cotOption.label}
                              </span>
                              <span className="block text-xs text-muted-foreground">
                                {formatPrice(
                                  cotOption.priceMinor,
                                  event.currency
                                )}{" "}
                                / person / night
                              </span>
                              {cotEligibilityLabel ? (
                                <span className="block text-xs text-muted-foreground">
                                  Available for attendees in the{" "}
                                  {cotEligibilityLabel} age band
                                </span>
                              ) : null}
                              {differentBandSelected ? (
                                <span className="block text-xs text-muted-foreground">
                                  A cot is only available for attendees in the{" "}
                                  {cotEligibilityLabel} age band.
                                </span>
                              ) : null}
                              {!current.ageBandCode ? (
                                <span className="block text-xs text-muted-foreground">
                                  Select an age band above to add a cot.
                                </span>
                              ) : null}
                            </span>
                          </label>
                        )
                      })()
                    ) : null}
                  </div>
                </>
              )}

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
