"use client"

import { BedDouble, Info, Minus, Plus } from "lucide-react"

import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
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
    optionSelections: [],
  }
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

        function updateOption(optionKey: string, quantity: number, nights: number) {
          const others = current.optionSelections.filter(
            (optionSelection) => optionSelection.optionKey !== optionKey
          )
          const next: AccommodationSelectionDraft["optionSelections"] = [...others]
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
                              onChange={() => {
                                // A category change clears an occupancy that
                                // is not offered by the new category's
                                // configured rate rows, so the draft can never
                                // hold an invalid category/occupancy
                                // combination.
                                const rateOccupancies = new Set(
                                  category.rates.map((rate) => rate.occupancy)
                                )
                                const patchValue: Partial<AccommodationSelectionDraft> =
                                  { categoryId: category.categoryId }
                                if (
                                  current.occupancy &&
                                  !rateOccupancies.has(current.occupancy)
                                ) {
                                  patchValue.occupancy = ""
                                }
                                patch(patchValue)
                              }}
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

                  {event.accommodation.options.length > 0 ? (
                    <div className="space-y-2">
                      <span className="block text-sm font-medium text-foreground">
                        Add-ons
                      </span>
                      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
                        {event.accommodation.options.map((option) => {
                          const selectedOption = current.optionSelections.find(
                            (optionSelection) =>
                              optionSelection.optionKey === option.optionKey
                          )
                          const quantity = selectedOption?.quantity ?? 0
                          const nights = selectedOption?.nights ?? 0
                          const isSelected = quantity > 0 && nights > 0
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
                                    {formatPrice(
                                      option.priceMinor,
                                      event.currency
                                    )}{" "}
                                    / unit / night
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
                                    } else {
                                      updateOption(
                                        option.optionKey,
                                        1,
                                        event.accommodation.config?.nightCount ?? 1
                                      )
                                    }
                                  }}
                                  className="shrink-0"
                                >
                                  {isSelected ? "Remove" : "Add"}
                                </Button>
                              </div>
                              {isSelected ? (
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
                                        <Minus className="size-3" aria-hidden="true" />
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
                                        <Plus className="size-3" aria-hidden="true" />
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
                                        <Minus className="size-3" aria-hidden="true" />
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
                                        <Plus className="size-3" aria-hidden="true" />
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
