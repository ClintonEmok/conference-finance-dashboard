"use client"

import { useEffect, useMemo, useRef, useState } from "react"
import { useQuery } from "convex/react"
import {
  AlertCircle,
  BedDouble,
  CheckCircle2,
  Info,
  Loader2,
  Minus,
  MoveRight,
  Plus,
} from "lucide-react"

import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select"
import { Skeleton } from "@/components/ui/skeleton"
import { api } from "@/lib/convex/api"
import { useTicketTypesForEvent } from "@/lib/convex/hooks/events"
import { formatPrice } from "@/lib/utils"

export type AttendeeOrderEditorGender = "MALE" | "FEMALE" | "MIXED" | "UNKNOWN"

export type AttendeeOrderEditorAttendee = {
  id: string
  name: string
  ticketTypeId: string | null
  ticketTypeLabel: string | null
  genderType: AttendeeOrderEditorGender | null
  location: string | null
  orderId: string
  bookingRef: string | null
  eventId: string
}

export type AttendeeOrderEditorOptionSelection = {
  optionKey: string
  quantity: number
  nights: number
}

export type EditorGeneralDraft = {
  genderType: "" | AttendeeOrderEditorGender
  ticketTypeId: string
  location: string
}

export type EditorAccommodationDraft = {
  occupancy: "single" | "shared" | ""
  optionSelections: AttendeeOrderEditorOptionSelection[]
  nightBeforeLevel: "standard" | "superior" | undefined
  nightBeforeOccupancy: "single" | "shared" | undefined
}

export type EditorEditContextSelection = {
  attendeeKey: string
  attendeeName: string
  ticketLabel: string
  ticketOccupancy?: "single" | "shared" | "family"
  occupancy?: "single" | "shared" | "family"
  optionSelections: AttendeeOrderEditorOptionSelection[]
  nightBeforeLevel?: "standard" | "superior"
  nightBeforeOccupancy?: "single" | "shared"
  confirmed: boolean
}

export type EditorEditContext = {
  bookingRef: string
  event: { slug: string; title: string; startsAt: number; currency: string }
  locked: boolean
  hasSelections: boolean
  selections: EditorEditContextSelection[]
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
    options: Array<{ optionKey: string; label: string; priceMinor: number }>
    nightBefore: {
      standard: { single: number; shared: number }
      superior: { single: number; shared: number }
    } | null
  }
}

type AttendeeGeneralChanges = {
  genderType?: AttendeeOrderEditorGender | null
  ticketTypeId?: string
  location?: string | null
}

type AttendeeAccommodationChanges = {
  occupancy?: "single" | "shared"
  optionSelections?: AttendeeOrderEditorOptionSelection[]
  nightBeforeLevel?: "standard" | "superior"
  nightBeforeOccupancy?: "single" | "shared"
}

export type EditorSaveRequest = {
  method: "PATCH"
  url: string
  body: Record<string, unknown>
}

type Confirmation =
  | {
      kind: "ticket-change"
      nextTicketTypeId: string
      nextTicketLabel: string
    }
  | { kind: "clear-option"; optionKey: string; label: string; remaining: number }
  | { kind: "move" }

type SaveStatus =
  | { kind: "idle" }
  | { kind: "saving" }
  | { kind: "success"; message: string }
  | { kind: "error"; message: string }

function sortOptionSelections(
  selections: AttendeeOrderEditorOptionSelection[]
): AttendeeOrderEditorOptionSelection[] {
  return [...selections].sort((left, right) =>
    left.optionKey.localeCompare(right.optionKey)
  )
}

function emptyAccommodationDraft(): EditorAccommodationDraft {
  return {
    occupancy: "",
    optionSelections: [],
    nightBeforeLevel: undefined,
    nightBeforeOccupancy: undefined,
  }
}

function generalDraftFromAttendee(
  attendee: AttendeeOrderEditorAttendee
): EditorGeneralDraft {
  return {
    genderType: attendee.genderType ?? "",
    ticketTypeId: attendee.ticketTypeId ?? "",
    location: attendee.location ?? "",
  }
}

function normalizeDashboardOccupancy(
  value: "single" | "shared" | "family" | undefined
): "single" | "shared" | "" {
  if (value === "single" || value === "shared") return value
  return ""
}

function accommodationDraftFromSelection(
  selection: EditorEditContextSelection | null
): EditorAccommodationDraft {
  if (!selection) return emptyAccommodationDraft()
  const ticketOccupancy =
    selection.ticketOccupancy === "single" || selection.ticketOccupancy === "shared"
      ? selection.ticketOccupancy
      : undefined
  return {
    occupancy: ticketOccupancy ?? normalizeDashboardOccupancy(selection.occupancy),
    nightBeforeLevel: selection.nightBeforeLevel,
    nightBeforeOccupancy:
      selection.nightBeforeOccupancy ??
      ticketOccupancy ??
      undefined,
    optionSelections: sortOptionSelections(selection.optionSelections),
  }
}

/**
 * Match the edit-context selection row for one dashboard attendee. The public
 * projection keys rows by the attendee key (or falls back to the internal
 * attendee id); a single-selection order is matched directly, and a name
 * match covers multi-attendee orders whose signup keys differ from ids.
 */
export function matchEditorSelection(
  selections: EditorEditContextSelection[],
  attendee: { id: string; name: string }
): EditorEditContextSelection | null {
  if (selections.length === 0) return null
  const byKey = selections.find(
    (selection) => selection.attendeeKey === attendee.id
  )
  if (byKey) return byKey
  if (selections.length === 1) return selections[0]
  const byName = selections.find(
    (selection) => selection.attendeeName === attendee.name
  )
  return byName ?? null
}

/**
 * Build the general attendee PATCH body. Only `genderType`, `ticketTypeId`,
 * and `location` are ever included; money, category, room, and snapshot
 * fields have no representation here and are rejected by the route.
 */
export function buildAttendeeGeneralPatchBody(input: {
  genderType?: "" | AttendeeOrderEditorGender | null
  ticketTypeId?: string
  location?: string | null
}): AttendeeGeneralChanges {
  const body: AttendeeGeneralChanges = {}
  if (input.genderType !== undefined) {
    body.genderType = input.genderType || null
  }
  if (input.ticketTypeId !== undefined) {
    body.ticketTypeId = input.ticketTypeId
  }
  if (input.location !== undefined) {
    body.location =
      input.location === null ? null : input.location.trim() || null
  }
  return body
}

/**
 * Build the attendee accommodation PATCH body. Only the event scope plus the
 * simplified-contract choices (`occupancy`, `optionSelections`,
 * `nightBeforeLevel`, `nightBeforeOccupancy`) are included; the server
 * resolves categories, rates, nights, and amounts.
 */
export function buildAttendeeAccommodationPatchBody(input: {
  eventId: string
  occupancy?: "single" | "shared"
  optionSelections?: AttendeeOrderEditorOptionSelection[]
  nightBeforeLevel?: "standard" | "superior"
  nightBeforeOccupancy?: "single" | "shared"
}): Record<string, unknown> {
  const body: Record<string, unknown> = { eventId: input.eventId }
  if (input.occupancy !== undefined) body.occupancy = input.occupancy
  if (input.optionSelections !== undefined) {
    body.optionSelections = input.optionSelections.map((selection) => ({
      optionKey: selection.optionKey,
      quantity: selection.quantity,
      nights: selection.nights,
    }))
  }
  if (input.nightBeforeLevel !== undefined) {
    body.nightBeforeLevel = input.nightBeforeLevel
  }
  if (input.nightBeforeOccupancy !== undefined) {
    body.nightBeforeOccupancy = input.nightBeforeOccupancy
  }
  return body
}

/**
 * Build the attendee move POST body. The route accepts exactly
 * `targetOrderId` and rejects any other field.
 */
export function buildAttendeeMoveBody(targetOrderId: string): {
  targetOrderId: string
} {
  return { targetOrderId }
}

export function collectDirtyGeneralFields(input: {
  initial: {
    genderType: AttendeeOrderEditorGender | null
    ticketTypeId: string | null
    location: string | null
  }
  draft: EditorGeneralDraft
}): AttendeeGeneralChanges | null {
  const changes: AttendeeGeneralChanges = {}
  if (input.draft.genderType !== (input.initial.genderType ?? "")) {
    changes.genderType = input.draft.genderType || null
  }
  if (
    input.draft.ticketTypeId &&
    input.draft.ticketTypeId !== (input.initial.ticketTypeId ?? "")
  ) {
    changes.ticketTypeId = input.draft.ticketTypeId
  }
  if (input.draft.location.trim() !== (input.initial.location ?? "").trim()) {
    changes.location = input.draft.location.trim() || null
  }
  return Object.keys(changes).length > 0 ? changes : null
}

export function collectDirtyAccommodationFields(input: {
  initial: EditorAccommodationDraft
  draft: EditorAccommodationDraft
}): AttendeeAccommodationChanges | null {
  const changes: AttendeeAccommodationChanges = {}
  if (input.draft.occupancy !== input.initial.occupancy && input.draft.occupancy) {
    changes.occupancy = input.draft.occupancy
  }
  if (
    JSON.stringify(sortOptionSelections(input.draft.optionSelections)) !==
    JSON.stringify(sortOptionSelections(input.initial.optionSelections))
  ) {
    changes.optionSelections = sortOptionSelections(input.draft.optionSelections)
  }
  if (input.draft.nightBeforeLevel !== input.initial.nightBeforeLevel) {
    changes.nightBeforeLevel = input.draft.nightBeforeLevel
  }
  if (
    input.draft.nightBeforeOccupancy !== input.initial.nightBeforeOccupancy
  ) {
    changes.nightBeforeOccupancy = input.draft.nightBeforeOccupancy
  }
  return Object.keys(changes).length > 0 ? changes : null
}

/**
 * Build the ordered PATCH request set for one Save. Dirty general fields go
 * to the attendee route and dirty accommodation fields go to the
 * accommodation route; the caller runs them with `Promise.all`. Each body is
 * server-authoritative and never carries client-derived amounts.
 */
export function buildEditorSaveRequests(input: {
  attendeeId: string
  eventId: string
  generalChanges: AttendeeGeneralChanges | null
  accommodationChanges: AttendeeAccommodationChanges | null
}): EditorSaveRequest[] {
  const requests: EditorSaveRequest[] = []
  if (input.generalChanges) {
    requests.push({
      method: "PATCH",
      url: `/api/dashboard/attendees/${encodeURIComponent(input.attendeeId)}`,
      body: buildAttendeeGeneralPatchBody(input.generalChanges) as Record<
        string,
        unknown
      >,
    })
  }
  if (input.accommodationChanges) {
    requests.push({
      method: "PATCH",
      url: `/api/dashboard/attendees/${encodeURIComponent(
        input.attendeeId
      )}/accommodation`,
      body: buildAttendeeAccommodationPatchBody({
        eventId: input.eventId,
        ...input.accommodationChanges,
      }),
    })
  }
  return requests
}

type AttendeeOrderEditorProps = {
  attendee: AttendeeOrderEditorAttendee
  onSaved?: () => void
}

type EditorTicketType = {
  _id: string
  label: string
  priceMinor: number
}

export function AttendeeOrderEditor({
  attendee,
  onSaved,
}: AttendeeOrderEditorProps) {
  const { ticketTypes: rawTicketTypes, isLoading: isTicketTypesLoading } =
    useTicketTypesForEvent(attendee.eventId)
  const ticketTypes = rawTicketTypes as unknown as EditorTicketType[]
  const editContextRaw = useQuery(
    api.publicTracking.getTrackPaymentEditContext,
    attendee.bookingRef ? { bookingRef: attendee.bookingRef } : "skip"
  )
  const editContext = (editContextRaw ?? null) as EditorEditContext | null

  const [generalDraft, setGeneralDraft] = useState<EditorGeneralDraft>(() =>
    generalDraftFromAttendee(attendee)
  )
  const [hydratedGeneralKey, setHydratedGeneralKey] = useState<string | null>(
    null
  )
  const [accommodationDraft, setAccommodationDraft] =
    useState<EditorAccommodationDraft>(emptyAccommodationDraft)
  const [hydratedAccommodationKey, setHydratedAccommodationKey] = useState<
    string | null
  >(null)
  const [saveStatus, setSaveStatus] = useState<SaveStatus>({ kind: "idle" })
  const [confirmation, setConfirmation] = useState<Confirmation | null>(null)
  const [isMoving, setIsMoving] = useState(false)
  const [moveStatus, setMoveStatus] = useState<SaveStatus>({ kind: "idle" })
  const [moveSearch, setMoveSearch] = useState("")
  const [debouncedMoveSearch, setDebouncedMoveSearch] = useState("")
  const [targetOrderId, setTargetOrderId] = useState<string | null>(null)
  const saveGuard = useRef<{
    ticketConfirmed: boolean
    clearedConfirmed: Set<string>
  }>({ ticketConfirmed: false, clearedConfirmed: new Set() })
  const pendingSaveRef = useRef<{
    general: AttendeeGeneralChanges | null
    accommodation: AttendeeAccommodationChanges | null
  } | null>(null)
  const clearedToConfirmRef = useRef<string[]>([])

  useEffect(() => {
    const timer = setTimeout(
      () => setDebouncedMoveSearch(moveSearch),
      300
    )
    return () => clearTimeout(timer)
  }, [moveSearch])

  const moveSearchResults = useQuery(
    api.orders.searchOrdersForMerge,
    debouncedMoveSearch.trim() && attendee.eventId
      ? {
          search: debouncedMoveSearch.trim(),
          eventId: attendee.eventId,
        }
      : "skip"
  )

  const currentSelection = useMemo(
    () =>
      editContext
        ? matchEditorSelection(editContext.selections, attendee)
        : null,
    [editContext, attendee]
  )

  const initialAccommodation = useMemo(
    () => accommodationDraftFromSelection(currentSelection),
    [currentSelection]
  )

  const generalIdentity = useMemo(
    () =>
      JSON.stringify([
        attendee.id,
        attendee.genderType,
        attendee.ticketTypeId,
        attendee.location,
      ]),
    [attendee.id, attendee.genderType, attendee.ticketTypeId, attendee.location]
  )

  const currentAccommodationKey = useMemo(() => {
    if (!editContext) return ""
    const selection = matchEditorSelection(editContext.selections, attendee)
    if (!selection) return ""
    return JSON.stringify([
      attendee.id,
      selection.ticketOccupancy ?? "",
      selection.occupancy ?? "",
      selection.nightBeforeLevel ?? "",
      selection.nightBeforeOccupancy ?? "",
      sortOptionSelections(selection.optionSelections),
    ])
  }, [attendee.id, editContext])

  useEffect(() => {
    if (hydratedGeneralKey === generalIdentity) return
    setGeneralDraft(generalDraftFromAttendee(attendee))
    setHydratedGeneralKey(generalIdentity)
    saveGuard.current.ticketConfirmed = false
  }, [generalIdentity, hydratedGeneralKey, attendee])

  useEffect(() => {
    if (!editContext || hydratedAccommodationKey === currentAccommodationKey) {
      return
    }
    const selection = matchEditorSelection(editContext.selections, attendee)
    setAccommodationDraft(accommodationDraftFromSelection(selection))
    setHydratedAccommodationKey(currentAccommodationKey)
  }, [
    editContext,
    currentAccommodationKey,
    hydratedAccommodationKey,
    attendee,
  ])

  const generalChanges = useMemo(
    () =>
      collectDirtyGeneralFields({
        initial: {
          genderType: attendee.genderType,
          ticketTypeId: attendee.ticketTypeId,
          location: attendee.location,
        },
        draft: generalDraft,
      }),
    [attendee.genderType, attendee.location, attendee.ticketTypeId, generalDraft]
  )

  const accommodationChanges = useMemo(
    () =>
      collectDirtyAccommodationFields({
        initial: initialAccommodation,
        draft: accommodationDraft,
      }),
    [initialAccommodation, accommodationDraft]
  )

  const isSaving = saveStatus.kind === "saving" || isMoving
  const currency = editContext?.event.currency ?? "EUR"
  const currentTicketType = ticketTypes.find(
    (ticketType) => String(ticketType._id) === attendee.ticketTypeId
  )
  const nextTicketType = ticketTypes.find(
    (ticketType) => String(ticketType._id) === generalDraft.ticketTypeId
  )
  const ticketOccupancy =
    currentSelection?.ticketOccupancy === "single" ||
    currentSelection?.ticketOccupancy === "shared"
      ? currentSelection.ticketOccupancy
      : undefined
  const isAccommodationLoading =
    Boolean(attendee.bookingRef) && editContextRaw === undefined

  const selectedOptions = useMemo(
    () =>
      accommodationDraft.optionSelections.filter(
        (selection) => selection.quantity > 0 && selection.nights > 0
      ),
    [accommodationDraft.optionSelections]
  )

  function updateOption(
    optionKey: string,
    quantity: number,
    nights: number
  ) {
    setAccommodationDraft((current) => {
      const others = current.optionSelections.filter(
        (selection) => selection.optionKey !== optionKey
      )
      const next = [...others]
      if (quantity > 0 && nights > 0) {
        next.push({ optionKey, quantity, nights })
      }
      saveGuard.current.clearedConfirmed.delete(optionKey)
      return { ...current, optionSelections: next }
    })
  }

  async function runSave(changes: {
    general: AttendeeGeneralChanges | null
    accommodation: AttendeeAccommodationChanges | null
  }) {
    if (isSaving) return
    setSaveStatus({ kind: "saving" })
    try {
      const requests = buildEditorSaveRequests({
        attendeeId: attendee.id,
        eventId: attendee.eventId,
        generalChanges: changes.general,
        accommodationChanges: changes.accommodation,
      })
      const responses = await Promise.all(
        requests.map(async (request) => {
          const response = await fetch(request.url, {
            method: request.method,
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify(request.body),
          })
          if (!response.ok) {
            const body = (await response.json().catch(() => null)) as {
              error?: { message?: string }
            } | null
            throw new Error(
              body?.error?.message ?? "Failed to save attendee changes."
            )
          }
          return response
        })
      )
      void responses
      setSaveStatus({
        kind: "success",
        message: "Saved. The latest amounts are now loading.",
      })
      onSaved?.()
    } catch (error) {
      setSaveStatus({
        kind: "error",
        message:
          error instanceof Error
            ? error.message
            : "Failed to save attendee changes.",
      })
    }
  }

  function requestSave() {
    if (isSaving) return
    const changes = {
      general: generalChanges,
      accommodation: accommodationChanges,
    }
    if (!changes.general && !changes.accommodation) return

    const isMoneyChangingTicket = Boolean(
      changes.general?.ticketTypeId &&
        currentTicketType &&
        nextTicketType &&
        String(currentTicketType._id) !== String(nextTicketType._id) &&
        currentTicketType.priceMinor !== nextTicketType.priceMinor &&
        !saveGuard.current.ticketConfirmed
    )
    if (isMoneyChangingTicket && nextTicketType) {
      pendingSaveRef.current = changes
      setConfirmation({
        kind: "ticket-change",
        nextTicketTypeId: String(nextTicketType._id),
        nextTicketLabel: nextTicketType.label,
      })
      return
    }

    const initiallySelectedKeys = initialAccommodation.optionSelections
      .filter((selection) => selection.quantity > 0 && selection.nights > 0)
      .map((selection) => selection.optionKey)
    const nextOptionKeys = new Set(
      (changes.accommodation?.optionSelections ?? []).map(
        (selection) => selection.optionKey
      )
    )
    const clearedKeys = initiallySelectedKeys.filter(
      (optionKey) =>
        !nextOptionKeys.has(optionKey) &&
        !saveGuard.current.clearedConfirmed.has(optionKey)
    )
    if (clearedKeys.length > 0) {
      pendingSaveRef.current = changes
      clearedToConfirmRef.current = clearedKeys
      const option = editContext?.accommodation.options.find(
        (option) => option.optionKey === clearedKeys[0]
      )
      setConfirmation({
        kind: "clear-option",
        optionKey: clearedKeys[0],
        label: option?.label ?? clearedKeys[0],
        remaining: clearedKeys.length - 1,
      })
      return
    }

    void runSave(changes)
  }

  function confirmTicketChange() {
    if (confirmation?.kind !== "ticket-change") return
    saveGuard.current.ticketConfirmed = true
    setConfirmation(null)
    const changes = pendingSaveRef.current
    pendingSaveRef.current = null
    if (!changes) return
    void runSave(changes)
  }

  function confirmClearOption() {
    if (confirmation?.kind !== "clear-option") return
    const confirmedKey = clearedToConfirmRef.current[0]
    if (confirmedKey) {
      saveGuard.current.clearedConfirmed.add(confirmedKey)
    }
    clearedToConfirmRef.current = clearedToConfirmRef.current.slice(1)
    setConfirmation(null)
    const changes = pendingSaveRef.current
    if (!changes) return
    const remaining = clearedToConfirmRef.current
    if (remaining.length > 0) {
      const option = editContext?.accommodation.options.find(
        (option) => option.optionKey === remaining[0]
      )
      setConfirmation({
        kind: "clear-option",
        optionKey: remaining[0],
        label: option?.label ?? remaining[0],
        remaining: remaining.length - 1,
      })
      return
    }
    pendingSaveRef.current = null
    void runSave(changes)
  }

  async function handleMove() {
    if (isMoving || !targetOrderId) return
    setIsMoving(true)
    setMoveStatus({ kind: "saving" })
    try {
      const response = await fetch(
        `/api/dashboard/attendees/${encodeURIComponent(attendee.id)}/move`,
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(buildAttendeeMoveBody(targetOrderId)),
        }
      )
      if (!response.ok) {
        const body = (await response.json().catch(() => null)) as {
          error?: { message?: string }
        } | null
        throw new Error(body?.error?.message ?? "Failed to move attendee.")
      }
      setMoveStatus({
        kind: "success",
        message: "Attendee moved to the target order.",
      })
      setConfirmation(null)
      onSaved?.()
    } catch (error) {
      setMoveStatus({
        kind: "error",
        message:
          error instanceof Error ? error.message : "Failed to move attendee.",
      })
    } finally {
      setIsMoving(false)
    }
  }

  const accommodationSection = (() => {
    if (!attendee.bookingRef) {
      return (
        <div className="flex items-start gap-3 rounded-xl border border-border/50 bg-muted/20 p-4 text-sm text-muted-foreground">
          <Info className="mt-0.5 size-4 shrink-0" />
          <p>
            Accommodation editing is unavailable until this order has a booking
            reference.
          </p>
        </div>
      )
    }

    if (isAccommodationLoading) {
      return (
        <div className="space-y-3">
          <Skeleton className="h-9 w-full rounded-xl" />
          <Skeleton className="h-20 w-full rounded-xl" />
          <Skeleton className="h-12 w-full rounded-xl" />
        </div>
      )
    }

    if (!editContext || !editContext.accommodation.eligible) {
      return (
        <div className="flex items-start gap-3 rounded-xl border border-border/50 bg-muted/20 p-4 text-sm text-muted-foreground">
          <Info className="mt-0.5 size-4 shrink-0" />
          <p>
            Accommodation preferences are not available for this event yet.
          </p>
        </div>
      )
    }

    const lockedNote = editContext.locked ? (
      <div className="flex items-start gap-3 rounded-xl border border-amber-500/30 bg-amber-500/10 p-4 text-sm text-amber-800 dark:text-amber-200">
        <Info className="mt-0.5 size-4 shrink-0" />
        <p>
          The organizer has confirmed this configuration. As an admin you can
          still update it — saving will re-open the selection for live
          repricing.
        </p>
      </div>
    ) : null

    const hasSelection = currentSelection !== null
    const baseNights = editContext.accommodation.config?.nightCount ?? 1

    return (
      <div className="space-y-4">
        {lockedNote}
        {!hasSelection && (
          <div className="flex items-start gap-3 rounded-xl border border-border/50 bg-muted/20 p-4 text-sm text-muted-foreground">
            <Info className="mt-0.5 size-4 shrink-0" />
            <p>
              No accommodation preferences are recorded for this attendee yet.
            </p>
          </div>
        )}

        {ticketOccupancy ? (
          <div className="flex items-center gap-2 rounded-xl border border-primary/15 bg-primary/5 p-3 text-sm">
            <BedDouble className="size-4 shrink-0 text-primary" />
            <span className="text-muted-foreground">
              Occupancy is set by this ticket:{" "}
              <span className="font-bold text-foreground capitalize">
                {ticketOccupancy}
              </span>
            </span>
          </div>
        ) : (
          <div className="space-y-2">
            <Label>Occupancy</Label>
            <Select
              value={accommodationDraft.occupancy || ""}
              onValueChange={(value) =>
                setAccommodationDraft((current) => ({
                  ...current,
                  occupancy: value as "single" | "shared",
                }))
              }
            >
              <SelectTrigger className="h-9 rounded-lg bg-background/50 text-xs">
                <SelectValue placeholder="Select occupancy" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="single">Single</SelectItem>
                <SelectItem value="shared">Shared</SelectItem>
              </SelectContent>
            </Select>
          </div>
        )}

        {editContext.accommodation.options.length > 0 && (
          <div className="space-y-2">
            <p className="text-[10px] font-black tracking-widest text-muted-foreground uppercase">
              Options
            </p>
            <div className="grid gap-3 sm:grid-cols-2">
              {editContext.accommodation.options.map((option) => {
                const selected = selectedOptions.find(
                  (selection) => selection.optionKey === option.optionKey
                )
                const quantity = selected?.quantity ?? 0
                const nights = selected?.nights ?? 0
                const isSelected = Boolean(selected)
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
                                currency
                              )} / person / night for the included stay`
                            : `${formatPrice(
                                option.priceMinor,
                                currency
                              )} / unit / night`}
                        </span>
                      </span>
                      <Button
                        type="button"
                        variant="outline"
                        size="sm"
                        aria-pressed={isSelected}
                        disabled={isSaving}
                        onClick={() => {
                          if (isSelected) {
                            updateOption(option.optionKey, 0, 0)
                          } else if (isIncludedStayUpgrade) {
                            updateOption(option.optionKey, 1, baseNights)
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
                              disabled={isSaving}
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
                              disabled={isSaving}
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
                              disabled={isSaving}
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
                              disabled={isSaving}
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
        )}

        {editContext.accommodation.nightBefore ? (
          <div className="space-y-2">
            <span
              id="attendee-editor-night-before-legend"
              className="block text-sm font-medium text-foreground"
            >
              Night before the event
            </span>
            <div
              role="radiogroup"
              aria-labelledby="attendee-editor-night-before-legend"
              className="flex flex-wrap gap-3"
            >
              <label
                className={`flex cursor-pointer items-center gap-2 rounded-lg border px-3 py-2 transition-colors ${
                  accommodationDraft.nightBeforeLevel === undefined
                    ? "border-primary bg-primary/5"
                    : "border-border/60 hover:border-primary/40"
                }`}
              >
                <input
                  type="radio"
                  name="attendee-editor-night-before"
                  value="none"
                  checked={accommodationDraft.nightBeforeLevel === undefined}
                  disabled={isSaving}
                  onChange={() =>
                    setAccommodationDraft((current) => ({
                      ...current,
                      nightBeforeLevel: undefined,
                      nightBeforeOccupancy: undefined,
                    }))
                  }
                  className="size-4 accent-primary"
                />
                <span className="text-sm text-foreground">No night before</span>
              </label>
              {(
                [
                  ["standard", "single"],
                  ["standard", "shared"],
                  ["superior", "single"],
                  ["superior", "shared"],
                ] as const
              ).map(([level, optionOccupancy]) => {
                const selected =
                  accommodationDraft.nightBeforeLevel === level &&
                  accommodationDraft.nightBeforeOccupancy === optionOccupancy
                const nightBefore = editContext.accommodation.nightBefore
                if (!nightBefore) return null
                const rateMinor = nightBefore[level][optionOccupancy]
                return (
                  <label
                    key={`${level}-${optionOccupancy}`}
                    className={`flex cursor-pointer items-center gap-2 rounded-lg border px-3 py-2 transition-colors ${
                      selected
                        ? "border-primary bg-primary/5"
                        : "border-border/60 hover:border-primary/40"
                    }`}
                  >
                    <input
                      type="radio"
                      name="attendee-editor-night-before"
                      value={`${level}-${optionOccupancy}`}
                      checked={selected}
                      disabled={isSaving}
                      onChange={() =>
                        setAccommodationDraft((current) => ({
                          ...current,
                          nightBeforeLevel: level,
                          nightBeforeOccupancy: optionOccupancy,
                        }))
                      }
                      className="size-4 accent-primary"
                    />
                    <span className="text-sm capitalize text-foreground">
                      {level} ·{" "}
                      {optionOccupancy === "single" ? "Single" : "Shared"}
                    </span>
                    <span className="font-mono text-xs tabular-nums text-muted-foreground">
                      {formatPrice(rateMinor, currency)} / night
                    </span>
                  </label>
                )
              })}
            </div>
          </div>
        ) : null}
      </div>
    )
  })()

  const canSave = Boolean(generalChanges || accommodationChanges)

  return (
    <div className="min-w-0 space-y-5">
      <div className="flex items-center justify-between gap-3">
        <div className="min-w-0 space-y-1">
          <h3 className="truncate text-lg font-bold text-foreground">
            {attendee.name}
          </h3>
          <div className="flex flex-wrap items-center gap-2">
            <Badge variant="secondary" className="font-medium">
              {attendee.ticketTypeLabel ?? "No ticket"}
            </Badge>
            <span className="font-mono text-[10px] text-muted-foreground/60">
              {attendee.id}
            </span>
          </div>
        </div>
      </div>

      <div className="grid gap-4 sm:grid-cols-2">
        <div className="space-y-2">
          <Label htmlFor="attendee-editor-ticket">Ticket type</Label>
          {isTicketTypesLoading ? (
            <Skeleton className="h-9 w-full rounded-lg" />
          ) : (
            <Select
              value={generalDraft.ticketTypeId}
              onValueChange={(value) => {
                saveGuard.current.ticketConfirmed = false
                setGeneralDraft((current) => ({
                  ...current,
                  ticketTypeId: value,
                }))
              }}
            >
              <SelectTrigger
                id="attendee-editor-ticket"
                className="h-9 rounded-lg bg-background/50 text-xs"
              >
                <SelectValue placeholder="Select ticket type" />
              </SelectTrigger>
              <SelectContent>
                {ticketTypes.map((ticketType) => (
                  <SelectItem
                    key={ticketType._id}
                    value={ticketType._id as string}
                  >
                    {ticketType.label} ·{" "}
                    {formatPrice(ticketType.priceMinor, currency)}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          )}
        </div>

        <div className="space-y-2">
          <Label htmlFor="attendee-editor-gender">Gender</Label>
          <Select
            value={generalDraft.genderType || "__none__"}
            onValueChange={(value) =>
              setGeneralDraft((current) => ({
                ...current,
                genderType: (value === "__none__"
                  ? ""
                  : value) as "" | AttendeeOrderEditorGender,
              }))
            }
          >
            <SelectTrigger
              id="attendee-editor-gender"
              className="h-9 rounded-lg bg-background/50 text-xs"
            >
              <SelectValue placeholder="Not set" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="__none__">Not set</SelectItem>
              <SelectItem value="MALE">Male</SelectItem>
              <SelectItem value="FEMALE">Female</SelectItem>
              <SelectItem value="MIXED">Mixed</SelectItem>
              <SelectItem value="UNKNOWN">Unknown</SelectItem>
            </SelectContent>
          </Select>
        </div>
      </div>

      <div className="space-y-2">
        <Label htmlFor="attendee-editor-location">Location</Label>
        <Input
          id="attendee-editor-location"
          value={generalDraft.location}
          disabled={isSaving}
          placeholder="City or region"
          onChange={(event) =>
            setGeneralDraft((current) => ({
              ...current,
              location: event.target.value,
            }))
          }
          className="h-9 rounded-lg bg-background/50 text-xs"
        />
      </div>

      <section className="space-y-3 rounded-xl border border-border/50 bg-card/40 p-4">
        <div className="flex items-center gap-2">
          <BedDouble className="size-4 text-primary" />
          <p className="text-[10px] font-black tracking-widest text-muted-foreground uppercase">
            Accommodation preferences
          </p>
        </div>
        {accommodationSection}
      </section>

      <section className="space-y-3 rounded-xl border border-border/50 bg-card/40 p-4">
        <div className="flex items-center gap-2">
          <MoveRight className="size-4 text-primary" />
          <p className="text-[10px] font-black tracking-widest text-muted-foreground uppercase">
            Move to another order
          </p>
        </div>
        <div className="space-y-3">
          <Input
            placeholder="Search by name, email, or booking ref…"
            value={moveSearch}
            disabled={isSaving}
            onChange={(event) => {
              setMoveSearch(event.target.value)
              setTargetOrderId(null)
            }}
            className="h-9 rounded-lg bg-background/50 text-xs"
          />
          {debouncedMoveSearch && (
            <div className="max-h-52 overflow-y-auto rounded-xl border border-white/20">
              {(moveSearchResults ?? []).length === 0 ? (
                <p className="p-4 text-center text-xs text-muted-foreground">
                  No orders found.
                </p>
              ) : (
                (moveSearchResults ?? []).map((result) => (
                  <button
                    key={result.orderId}
                    type="button"
                    disabled={isSaving}
                    onClick={() => setTargetOrderId(result.orderId)}
                    className={`flex w-full items-center justify-between px-4 py-3 text-left transition-colors hover:bg-white/10 disabled:opacity-60 ${
                      targetOrderId === result.orderId
                        ? "bg-primary/10 ring-1 ring-primary/20"
                        : ""
                    } ${
                      result.orderId === (attendee.orderId as string)
                        ? "cursor-not-allowed opacity-40"
                        : ""
                    }`}
                  >
                    <div className="min-w-0 flex-1">
                      <p className="truncate text-sm font-bold">
                        {result.bookerName ??
                          result.bookerEmail ??
                          "—"}
                      </p>
                      <p className="truncate font-mono text-[10px] text-muted-foreground/60">
                        {result.orderId}
                        {result.bookingRef
                          ? ` · ${result.bookingRef}`
                          : ""}
                      </p>
                    </div>
                  </button>
                ))
              )}
            </div>
          )}
          {targetOrderId && (
            <div className="flex items-center justify-between gap-3 rounded-xl border border-primary/15 bg-primary/5 p-3">
              <p className="min-w-0 text-xs text-muted-foreground">
                Move this attendee to{" "}
                <span className="font-mono font-bold text-foreground">
                  {targetOrderId}
                </span>
              </p>
              <Button
                type="button"
                size="sm"
                disabled={isMoving}
                onClick={() => setConfirmation({ kind: "move" })}
                className="h-8 rounded-lg px-3 text-[10px] font-bold tracking-wider uppercase"
              >
                {isMoving ? "Moving…" : "Move attendee"}
              </Button>
            </div>
          )}
          <div aria-live="polite" className="min-w-0 text-sm">
            {moveStatus.kind === "saving" ? (
              <span className="flex items-center gap-2 text-muted-foreground">
                <Loader2 className="size-4 animate-spin" />
                Moving attendee…
              </span>
            ) : moveStatus.kind === "success" ? (
              <span className="flex items-center gap-2 font-medium text-emerald-600 dark:text-emerald-400">
                <CheckCircle2 className="size-4" />
                {moveStatus.message}
              </span>
            ) : moveStatus.kind === "error" ? (
              <span
                role="alert"
                className="flex items-center gap-2 font-medium text-destructive"
              >
                <AlertCircle className="size-4" />
                {moveStatus.message}
              </span>
            ) : null}
          </div>
        </div>
      </section>

      <div className="space-y-3">
        <div aria-live="polite" className="min-w-0 text-sm">
          {saveStatus.kind === "saving" ? (
            <span className="flex items-center gap-2 text-muted-foreground">
              <Loader2 className="size-4 animate-spin" />
              Saving changes…
            </span>
          ) : saveStatus.kind === "success" ? (
            <span className="flex items-center gap-2 font-medium text-emerald-600 dark:text-emerald-400">
              <CheckCircle2 className="size-4" />
              {saveStatus.message}
            </span>
          ) : saveStatus.kind === "error" ? (
            <span
              role="alert"
              className="flex items-center gap-2 font-medium text-destructive"
            >
              <AlertCircle className="size-4" />
              {saveStatus.message}
            </span>
          ) : null}
        </div>

        <Button
          type="button"
          disabled={isSaving || !canSave}
          onClick={requestSave}
          className="w-full"
        >
          {saveStatus.kind === "saving" ? "Saving…" : "Save attendee changes"}
        </Button>
      </div>

      <Dialog
        open={confirmation?.kind === "ticket-change"}
        onOpenChange={(open) => {
          if (!open) setConfirmation(null)
        }}
      >
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>Change ticket type</DialogTitle>
            <DialogDescription>
              Changing the ticket to {confirmation?.kind === "ticket-change"
                ? confirmation.nextTicketLabel
                : ""}{" "}
              may change the amount due for this order. The new total is
              calculated by the server when you save.
            </DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <Button
              type="button"
              variant="ghost"
              onClick={() => setConfirmation(null)}
              className="h-9 rounded-lg px-4 text-[11px] font-bold tracking-wider uppercase"
            >
              Cancel
            </Button>
            <Button
              type="button"
              onClick={confirmTicketChange}
              className="h-9 rounded-lg px-4 text-[11px] font-bold tracking-wider uppercase"
            >
              Change ticket
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog
        open={confirmation?.kind === "clear-option"}
        onOpenChange={(open) => {
          if (!open) setConfirmation(null)
        }}
      >
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>Remove {confirmation?.kind === "clear-option" ? confirmation.label : "option"}</DialogTitle>
            <DialogDescription>
              Removing this option may change the amount due for this order.
              {confirmation?.kind === "clear-option" && confirmation.remaining > 0
                ? ` ${confirmation.remaining} more option${
                    confirmation.remaining === 1 ? "" : "s"
                  } will be confirmed next.`
                : ""}
            </DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <Button
              type="button"
              variant="ghost"
              onClick={() => setConfirmation(null)}
              className="h-9 rounded-lg px-4 text-[11px] font-bold tracking-wider uppercase"
            >
              Keep option
            </Button>
            <Button
              type="button"
              variant="destructive"
              onClick={confirmClearOption}
              className="h-9 rounded-lg px-4 text-[11px] font-bold tracking-wider uppercase"
            >
              Remove
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog
        open={confirmation?.kind === "move"}
        onOpenChange={(open) => {
          if (!open) setConfirmation(null)
        }}
      >
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>Move attendee</DialogTitle>
            <DialogDescription>
              Move {attendee.name} to the selected order? The attendee&apos;s
              ticket, preferences, and payments will move with them.
            </DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <Button
              type="button"
              variant="ghost"
              onClick={() => setConfirmation(null)}
              className="h-9 rounded-lg px-4 text-[11px] font-bold tracking-wider uppercase"
            >
              Cancel
            </Button>
            <Button
              type="button"
              disabled={isMoving}
              onClick={() => void handleMove()}
              className="h-9 rounded-lg px-4 text-[11px] font-bold tracking-wider uppercase"
            >
              {isMoving ? "Moving…" : "Move attendee"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  )
}
