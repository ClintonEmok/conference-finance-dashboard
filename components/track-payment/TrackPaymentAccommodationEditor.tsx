"use client"

import { useEffect, useMemo, useRef, useState } from "react"
import {
  AlertCircle,
  BedDouble,
  CheckCircle2,
  Info,
  Loader2,
  Minus,
  Plus,
  Save,
  ShieldAlert,
} from "lucide-react"

import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { formatMoney } from "@/lib/format"
import { formatPrice } from "@/lib/utils"

export type TrackPaymentEditSelection = {
  attendeeKey: string
  categoryId: string
  occupancy: "single" | "shared" | "family"
  optionSelections: Array<{
    optionKey: string
    quantity: number
    nights: number
  }>
}

export type TrackPaymentEditResult = {
  bookingRef: string
  status: "applied" | "unchanged" | "replayed"
  amountDueMinor: number
  totalPaidMinor: number
  remainingMinor: number
  progressPercent: number
  overpaymentDeltaMinor: number
}

export type TrackPaymentEditContext = {
  bookingRef: string
  event: { slug: string; title: string; startsAt: number; currency: string }
  locked: boolean
  hasSelections: boolean
  selections: Array<{
    attendeeKey: string
    attendeeName: string
    ticketLabel: string
    ticketCategoryId?: string
    categoryId?: string
    occupancy?: "single" | "shared" | "family"
    optionSelections: Array<{
      optionKey: string
      quantity: number
      nights: number
    }>
    confirmed: boolean
  }>
  accommodation: {
    eligible: boolean
    config: {
      baseCheckInAt: number
      baseCheckOutAt: number
      nightCount: number
      breakfastIncluded: boolean
    } | null
    activeCategories: Array<{
      categoryId: string
      code: string
      label: string
      rates: Array<{
        occupancy: "single" | "shared" | "family"
        pricePerPersonMinor: number
      }>
    }>
    options: Array<{
      optionKey: string
      label: string
      priceMinor: number
    }>
  }
}

type Draft = {
  categoryId: string
  occupancy: string
  optionSelections: Array<{
    optionKey: string
    quantity: number
    nights: number
  }>
}

type SubmitStatus =
  | { kind: "idle" }
  | { kind: "saving" }
  | { kind: "success"; result: TrackPaymentEditResult }
  | { kind: "error"; code: string; message: string }

/**
 * Build the complete options-only edit request body. Only ownership /
 * idempotency metadata plus attendee preferences are sent — never an amount,
 * date, night count, room, slot, or snapshot. The API route rejects any such
 * field before it reaches Convex.
 */
export function buildTrackPaymentEditBody(input: {
  bookingRef: string
  bookerEmail: string
  editToken: string
  idempotencyKey: string
  selections: TrackPaymentEditSelection[]
}): Record<string, unknown> {
  const bookerEmail = input.bookerEmail.trim().toLowerCase()
  const editToken = input.editToken.trim()
  return {
    bookerEmail: bookerEmail || undefined,
    editToken: editToken || undefined,
    idempotencyKey: input.idempotencyKey,
    website: "",
    selections: input.selections.map((selection) => ({
      attendeeKey: selection.attendeeKey,
      categoryId: selection.categoryId,
      occupancy: selection.occupancy,
      optionSelections: selection.optionSelections,
    })),
  }
}

function messageForEditError(code: string): string {
  switch (code) {
    case "EDIT_OWNERSHIP":
      return "We couldn't verify ownership of this booking. Check the booking email or the edit link in your confirmation email and try again."
    case "EDIT_CONFIRMED":
      return "Accommodation changes are closed because the organizer has confirmed this configuration."
    case "EDIT_INVALID":
    case "EDIT_CONFLICT":
      return "Some of your preferences are no longer available. Review your choices and try again."
    case "EDIT_IDEMPOTENCY_CONFLICT":
      return "This change was already submitted. If it did not save, reload the page and try again with a fresh attempt."
    case "EDIT_NOT_FOUND":
      return "We couldn't locate that booking."
    case "RATE_LIMITED":
      return "Too many attempts. Please wait a moment and try again."
    case "EDIT_UNAVAILABLE":
      return "Editing is temporarily unavailable. Please try again later."
    case "INCOMPLETE":
      return "Complete every attendee's accommodation preferences before saving."
    case "OWNERSHIP_MISSING":
      return "Enter the booking email or the edit link to verify ownership before saving."
    default:
      return "Something went wrong while saving. Please try again."
  }
}

export { messageForEditError }

function emptyDraft(): Draft {
  return {
    categoryId: "",
    occupancy: "",
    optionSelections: [],
  }
}

export function TrackPaymentAccommodationEditor({
  bookingRef,
  currency,
  editContext,
  initialEditToken,
}: {
  bookingRef: string | null
  currency: string
  editContext: TrackPaymentEditContext | null | undefined
  initialEditToken?: string
}) {
  const [drafts, setDrafts] = useState<Record<string, Draft>>({})
  const [bookerEmail, setBookerEmail] = useState("")
  const [editToken, setEditToken] = useState(initialEditToken ?? "")
  const [status, setStatus] = useState<SubmitStatus>({ kind: "idle" })
  const idempotencyKeyRef = useRef<string | null>(null)

  const currentKey = useMemo(() => {
    if (!editContext) return ""
    return JSON.stringify(
      editContext.selections.map((selection) => [
        selection.attendeeKey,
        selection.categoryId ?? "",
        selection.occupancy ?? "",
        selection.optionSelections,
      ])
    )
  }, [editContext])

  const [hydratedKey, setHydratedKey] = useState<string | null>(null)

  // Hydrate drafts from the server's current selections; re-hydrates after a
  // successful edit (Convex queries refresh reactively).
  useEffect(() => {
    if (!editContext || hydratedKey === currentKey) return
    const next: Record<string, Draft> = {}
    for (const selection of editContext.selections) {
      next[selection.attendeeKey] = {
        categoryId: selection.categoryId ?? "",
        occupancy: selection.occupancy ?? "",
        optionSelections: selection.optionSelections,
      }
    }
    setDrafts(next)
    setHydratedKey(currentKey)
  }, [editContext, currentKey, hydratedKey])

  const idempotencyKey = () => {
    if (!idempotencyKeyRef.current) {
      idempotencyKeyRef.current = newIdempotencyKey()
    }
    return idempotencyKeyRef.current
  }

  if (!editContext) {
    return null
  }

  if (!editContext.hasSelections) {
    return (
      <article className="rounded-3xl border border-border/40 bg-card/40 p-6 shadow-sm backdrop-blur-xl sm:p-8">
        <h3 className="mb-4 text-[10px] font-bold tracking-[0.2em] text-muted-foreground uppercase">
          Accommodation preferences
        </h3>
        <div className="flex items-start gap-3 rounded-xl border border-border/50 bg-muted/20 p-4 text-sm text-muted-foreground">
          <Info className="mt-0.5 size-4 shrink-0" />
          <p>
            There are no accommodation preferences recorded for this booking.
            The organizer will contact you if accommodation becomes available.
          </p>
        </div>
      </article>
    )
  }

  if (editContext.locked) {
    return (
      <article className="rounded-3xl border border-border/40 bg-card/40 p-6 shadow-sm backdrop-blur-xl sm:p-8">
        <h3 className="mb-4 text-[10px] font-bold tracking-[0.2em] text-muted-foreground uppercase">
          Accommodation preferences
        </h3>
        <div className="flex items-start gap-3 rounded-xl border border-amber-500/30 bg-amber-500/10 p-4 text-sm text-amber-800 dark:text-amber-200">
          <ShieldAlert className="mt-0.5 size-4 shrink-0" />
          <div>
            <p className="font-semibold">
              Accommodation changes are closed because the organizer has
              confirmed this configuration.
            </p>
            <p className="mt-1 text-amber-700/80 dark:text-amber-200/80">
              Your current preferences are final. For changes, please contact
              the organizers directly.
            </p>
          </div>
        </div>
        <ul className="mt-4 space-y-2">
          {editContext.selections.map((selection) => (
            <li
              key={selection.attendeeKey}
              className="flex flex-wrap items-center justify-between gap-2 rounded-xl border border-border/30 bg-background/50 px-4 py-3 text-sm"
            >
              <span className="min-w-0 font-medium text-foreground">
                {selection.attendeeName}
              </span>
              <span className="min-w-0 text-muted-foreground">
                {selection.ticketLabel} ·{" "}
                {selectionCategoryLabel(editContext, selection.categoryId)}
                {selection.occupancy ? ` · ${selection.occupancy}` : ""}
              </span>
            </li>
          ))}
        </ul>
      </article>
    )
  }

  const allComplete =
    editContext.selections.length > 0 &&
    editContext.selections.every((selection) => {
      const draft = drafts[selection.attendeeKey]
      return Boolean(draft && draft.categoryId && draft.occupancy)
    })
  const ownershipReady =
    Boolean(bookerEmail.trim()) || Boolean(editToken.trim())
  const saving = status.kind === "saving"

  const handleSave = async () => {
    if (saving || !bookingRef) return
    if (!allComplete) {
      setStatus({ kind: "error", code: "INCOMPLETE", message: messageForEditError("INCOMPLETE") })
      return
    }
    if (!ownershipReady) {
      setStatus({ kind: "error", code: "OWNERSHIP_MISSING", message: messageForEditError("OWNERSHIP_MISSING") })
      return
    }

    const selections: TrackPaymentEditSelection[] = editContext.selections.map(
      (selection) => {
        const draft = drafts[selection.attendeeKey]
        return {
          attendeeKey: selection.attendeeKey,
          categoryId: draft?.categoryId ?? "",
          occupancy: (draft?.occupancy ?? "shared") as
            | "single"
            | "shared"
            | "family",
          optionSelections: draft?.optionSelections ?? [],
        }
      }
    )

    setStatus({ kind: "saving" })
    const outcome = await submitTrackPaymentEdit({
      bookingRef,
      bookerEmail,
      editToken,
      idempotencyKey: idempotencyKey(),
      selections,
    })
    if (!outcome.ok) {
      setStatus({
        kind: "error",
        code: outcome.code,
        message: messageForEditError(outcome.code),
      })
      return
    }
    setStatus({ kind: "success", result: outcome.result })
  }

  const successResult = status.kind === "success" ? status.result : null

  return (
    <article className="rounded-3xl border border-border/40 bg-card/40 p-6 shadow-sm backdrop-blur-xl sm:p-8">
      <h3 className="mb-2 text-[10px] font-bold tracking-[0.2em] text-muted-foreground uppercase">
        Accommodation preferences
      </h3>
      <p className="mb-6 max-w-2xl text-sm text-muted-foreground">
        Your amount due is recalculated from the organizer's current
        configuration when you save. Final room placement will be confirmed by
        the organizer.
      </p>

      <div className="space-y-4">
        {editContext.selections.map((selection, index) => (
          <AttendeePreferenceFieldset
            key={selection.attendeeKey}
            attendee={selection}
            index={index}
            editContext={editContext}
            draft={drafts[selection.attendeeKey] ?? emptyDraft()}
            onChange={(patch) => {
              setDrafts((current) => ({
                ...current,
                [selection.attendeeKey]: {
                  ...(current[selection.attendeeKey] ?? emptyDraft()),
                  ...patch,
                },
              }))
            }}
          />
        ))}
      </div>

      <div className="mt-6 space-y-4 rounded-xl border border-border/50 bg-muted/20 p-4">
        <p className="text-xs text-muted-foreground">
          To verify ownership, enter the email address used for this booking
          or the edit link from your confirmation email.
        </p>
        <div className="grid gap-4 sm:grid-cols-2">
          <div className="min-w-0 space-y-2">
            <Label htmlFor="track-edit-email" className="text-sm font-medium">
              Booking email
            </Label>
            <Input
              id="track-edit-email"
              type="email"
              autoComplete="email"
              value={bookerEmail}
              onChange={(event) => setBookerEmail(event.target.value)}
              placeholder="you@example.com"
              className="min-w-0"
            />
          </div>
          <div className="min-w-0 space-y-2">
            <Label htmlFor="track-edit-token" className="text-sm font-medium">
              Edit link
              <span className="ml-1 font-normal text-muted-foreground">
                (optional)
              </span>
            </Label>
            <Input
              id="track-edit-token"
              type="text"
              autoComplete="off"
              spellCheck={false}
              value={editToken}
              onChange={(event) => setEditToken(event.target.value)}
              placeholder="Paste the edit link from your email"
              className="min-w-0 font-mono text-xs"
            />
          </div>
        </div>

        <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
          <div
            aria-live="polite"
            className="min-w-0 text-sm text-muted-foreground"
          >
            {saving ? (
              <span className="flex items-center gap-2">
                <Loader2 className="size-4 animate-spin" />
                Saving your preferences…
              </span>
            ) : successResult ? (
              <span className="flex items-center gap-2 font-medium text-emerald-600 dark:text-emerald-400">
                <CheckCircle2 className="size-4" />
                Your accommodation preferences were saved. The balance shown is
                the latest server calculation.
              </span>
            ) : (
              <span className="text-xs text-muted-foreground/70">
                Prices shown are per person per night and are set by the
                organizer.
              </span>
            )}
          </div>
          <Button
            type="button"
            onClick={handleSave}
            disabled={saving || !allComplete || !ownershipReady}
            className="shrink-0"
          >
            <Save className="mr-2 size-4" />
            {saving ? "Saving…" : "Save preferences"}
          </Button>
        </div>
      </div>

      {status.kind === "error" ? (
        <div
          role="alert"
          className="mt-4 flex items-start gap-3 rounded-xl border border-destructive/30 bg-destructive/10 p-4 text-sm text-destructive"
        >
          <AlertCircle className="mt-0.5 size-4 shrink-0" />
          <p>{status.message}</p>
        </div>
      ) : null}

      {successResult ? (
        <div className="mt-4">
          <TrackPaymentEditResultPanel
            result={successResult}
            currency={currency}
          />
        </div>
      ) : null}
    </article>
  )
}

function selectionCategoryLabel(
  editContext: TrackPaymentEditContext,
  categoryId?: string
): string {
  if (!categoryId) return "No category"
  return (
    editContext.accommodation.activeCategories.find(
      (category) => category.categoryId === categoryId
    )?.label ?? "Unknown category"
  )
}

function AttendeePreferenceFieldset({
  attendee,
  index,
  editContext,
  draft,
  onChange,
}: {
  attendee: TrackPaymentEditContext["selections"][number]
  index: number
  editContext: TrackPaymentEditContext
  draft: Draft
  onChange: (patch: Partial<Draft>) => void
}) {
  const ticketCategoryId = attendee.ticketCategoryId
  const eligibleCategories = editContext.accommodation.activeCategories.filter(
    (category) =>
      !ticketCategoryId || category.categoryId === ticketCategoryId
  )
  const selectedCategory = eligibleCategories.find(
    (category) => category.categoryId === draft.categoryId
  )

  function updateOption(optionKey: string, quantity: number, nights: number) {
    const others = draft.optionSelections.filter(
      (optionSelection) => optionSelection.optionKey !== optionKey
    )
    const next: Draft["optionSelections"] = [...others]
    if (quantity > 0 && nights > 0) {
      next.push({ optionKey, quantity, nights })
    }
    onChange({ optionSelections: next })
  }

  return (
    <fieldset className="min-w-0 rounded-xl border border-border/50 bg-card p-4 shadow-sm sm:p-6">
      <legend className="px-1 text-sm font-semibold text-foreground">
        Attendee {index + 1} — {attendee.attendeeName}
      </legend>

      <div className="space-y-4">
        <div className="flex flex-wrap items-center gap-2">
          <span className="text-sm text-muted-foreground">
            Your selected ticket:
          </span>
          <Badge variant="secondary" className="font-medium">
            {attendee.ticketLabel}
          </Badge>
        </div>

        {eligibleCategories.length === 0 ? (
          <div
            role="alert"
            className="rounded-lg border border-destructive/30 bg-destructive/10 p-3 text-sm text-destructive"
          >
            No accommodation category is currently available for this ticket.
          </div>
        ) : (
          <>
            <div className="space-y-2">
              <span
                id={`edit-category-legend-${attendee.attendeeKey}`}
                className="block text-sm font-medium text-foreground"
              >
                Category
              </span>
              <div
                role="radiogroup"
                aria-labelledby={`edit-category-legend-${attendee.attendeeKey}`}
                className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3"
              >
                {eligibleCategories.map((category) => {
                  const selected = draft.categoryId === category.categoryId
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
                        name={`edit-category-${attendee.attendeeKey}`}
                        value={category.categoryId}
                        checked={selected}
                        onChange={() => {
                          const rateOccupancies = new Set(
                            category.rates.map((rate) => rate.occupancy)
                          )
                          const patch: Partial<Draft> = {
                            categoryId: category.categoryId,
                          }
                          if (
                            draft.occupancy &&
                            !rateOccupancies.has(
                              draft.occupancy as "single" | "shared" | "family"
                            )
                          ) {
                            patch.occupancy = ""
                          }
                          onChange(patch)
                        }}
                        className="mt-0.5 size-4 shrink-0 accent-primary"
                      />
                      <span className="min-w-0">
                        <span className="block text-sm font-medium text-foreground">
                          {category.label}
                        </span>
                        {category.rates.length > 0 ? (
                          <span className="block text-xs text-muted-foreground">
                            {category.rates
                              .map(
                                (rate) =>
                                  `${formatPrice(
                                    rate.pricePerPersonMinor,
                                    editContext.event.currency
                                  )} / person / night`
                              )
                              .join(" · ")}
                          </span>
                        ) : null}
                      </span>
                    </label>
                  )
                })}
              </div>
            </div>

            {selectedCategory ? (
              <div className="space-y-2">
                <span
                  id={`edit-occupancy-legend-${attendee.attendeeKey}`}
                  className="block text-sm font-medium text-foreground"
                >
                  Room type
                </span>
                <div
                  role="radiogroup"
                  aria-labelledby={`edit-occupancy-legend-${attendee.attendeeKey}`}
                  className="flex flex-wrap gap-3"
                >
                  {selectedCategory.rates.map((rate) => {
                    const selected = draft.occupancy === rate.occupancy
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
                          name={`edit-occupancy-${attendee.attendeeKey}`}
                          value={rate.occupancy}
                          checked={selected}
                          onChange={() => onChange({ occupancy: rate.occupancy })}
                          className="size-4 accent-primary"
                        />
                        <span className="text-sm capitalize text-foreground">
                          {rate.occupancy}
                        </span>
                        <span className="font-mono text-xs tabular-nums text-muted-foreground">
                          {formatPrice(
                            rate.pricePerPersonMinor,
                            editContext.event.currency
                          )}{" "}
                          / night
                        </span>
                      </label>
                    )
                  })}
                </div>
              </div>
            ) : null}

            {editContext.accommodation.options.length > 0 ? (
              <div className="space-y-2">
                <span className="block text-sm font-medium text-foreground">
                  Add-ons
                </span>
                <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
                  {editContext.accommodation.options.map((option) => {
                    const selectedOption = draft.optionSelections.find(
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
                                editContext.event.currency
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
                                  editContext.accommodation.config?.nightCount ?? 1
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
}

function newIdempotencyKey(): string {
  if (typeof crypto !== "undefined" && "randomUUID" in crypto) {
    return crypto.randomUUID()
  }
  return `edit-${Date.now()}-${Math.random().toString(36).slice(2)}`
}

type SubmitEditOutcome =
  | { ok: true; result: TrackPaymentEditResult }
  | { ok: false; code: string }

export async function submitTrackPaymentEdit(input: {
  bookingRef: string
  bookerEmail: string
  editToken: string
  idempotencyKey: string
  selections: TrackPaymentEditSelection[]
}): Promise<SubmitEditOutcome> {
  try {
    const response = await fetch(
      `/api/track-payment/${encodeURIComponent(input.bookingRef)}`,
      {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "x-idempotency-key": input.idempotencyKey,
        },
        body: JSON.stringify(buildTrackPaymentEditBody(input)),
      }
    )
    const body = (await response.json()) as Record<string, unknown>
    if (!response.ok) {
      const error = body?.error as Record<string, unknown> | undefined
      const code =
        typeof error?.code === "string" ? error.code : "EDIT_FAILED"
      return { ok: false, code }
    }
    const data = body?.data as Record<string, unknown> | undefined
    if (!data || typeof data.status !== "string") {
      return { ok: false, code: "EDIT_FAILED" }
    }
    return {
      ok: true,
      result: data as unknown as TrackPaymentEditResult,
    }
  } catch (error) {
    void error
    return { ok: false, code: "EDIT_FAILED" }
  }
}

export function TrackPaymentEditResultPanel({
  result,
  currency,
}: {
  result: TrackPaymentEditResult
  currency: string
}) {
  return (
    <div className="space-y-2 rounded-xl border border-border/50 bg-background/50 p-4 text-sm">
      <div className="flex items-center justify-between gap-2">
        <span className="text-muted-foreground">Amount due</span>
        <span className="font-mono font-semibold tabular-nums text-foreground">
          {formatMoney(result.amountDueMinor, currency)}
        </span>
      </div>
      <div className="flex items-center justify-between gap-2">
        <span className="text-muted-foreground">Paid</span>
        <span className="font-mono tabular-nums text-foreground">
          {formatMoney(result.totalPaidMinor, currency)}
        </span>
      </div>
      <div className="flex items-center justify-between gap-2">
        <span className="text-muted-foreground">Remaining</span>
        <span className="font-mono tabular-nums text-foreground">
          {formatMoney(result.remainingMinor, currency)}
        </span>
      </div>
      {result.overpaymentDeltaMinor > 0 ? (
        <div
          role="status"
          className="mt-1 rounded-lg border border-amber-500/30 bg-amber-500/10 p-3 text-amber-800 dark:text-amber-200"
        >
          <p className="font-medium">
            Your payments exceed the new amount due by{" "}
            {formatMoney(result.overpaymentDeltaMinor, currency)}.
          </p>
          <p className="mt-1 text-xs text-amber-700/80 dark:text-amber-200/80">
            The excess will be treated as a donation. If you prefer, request a
            refund from the organizers.
          </p>
        </div>
      ) : (
        <p className="text-xs text-muted-foreground">
          Your balance reflects the latest server calculation.
        </p>
      )}
    </div>
  )
}
