"use client"

import { useCallback, useEffect, useRef, useState } from "react"
import { useConvex } from "convex/react"

import { api } from "@/convex/_generated/api"
import type { Id } from "@/convex/_generated/dataModel"
import { Button } from "@/components/ui/button"
import { DashboardQueryState } from "@/components/dashboard/dashboard-query-state"
import { Input } from "@/components/ui/input"

/**
 * The allocation editor's attendee picker (Phase 58, plan 58-08).
 *
 * THE ONE STRUCTURAL RULE: this component renders NO money — no amount, no
 * balance, no capacity, no formatted figure. Rows carry only the attendee name,
 * the order reference and the ticket-type label, so a per-attendee figure
 * cannot be misread as writable capacity before the server quotes one (the
 * LOCKED effective-capacity rule, UI-SPEC 4.4). The guard in
 * `tests/dashboard/donation-allocation-dialog.test.ts` scans this file and
 * fails on any money read; keep it that way.
 *
 * Selection lives by `attendeeId` in the PARENT (`selectedIds`), so it survives
 * searches by construction: the picker only renders and reports toggles, and no
 * piece of selection state is ever page-indexed.
 *
 * The read is IMPERATIVE (`useConvex().query`) so a superseded page can be
 * dropped and a stale cursor never overwrites a newer search.
 */

export type PickerRow = {
  attendeeId: Id<"orderAttendees">
  name: string
  orderRef: string | null
  ticketTypeLabel: string | null
}

export type DonationAllocationAttendeePickerProps = {
  eventId: Id<"events">
  selectedIds: ReadonlySet<string>
  onSelect: (row: PickerRow) => void
  onDeselect: (attendeeId: Id<"orderAttendees">) => void
  disabled?: boolean
}

/** The fields this picker reads from each ledger row — and nothing else. */
type LedgerRow = {
  _id: Id<"orderAttendees">
  name: string
  bookingRef: string | null
  ticketTypeLabel: string | null
}

type LedgerPage = {
  rows: LedgerRow[]
  page: { hasNextPage: boolean; nextCursor: string | null }
}

type LoadMode = "replace" | "append"

const PAGE_SIZE = 50
const SEARCH_DEBOUNCE_MS = 250

export function DonationAllocationAttendeePicker({
  eventId,
  selectedIds,
  onSelect,
  onDeselect,
  disabled = false,
}: DonationAllocationAttendeePickerProps) {
  const convex = useConvex()

  const [search, setSearch] = useState("")
  const [debouncedSearch, setDebouncedSearch] = useState("")
  const [rows, setRows] = useState<LedgerRow[]>([])
  const [nextCursor, setNextCursor] = useState<string | null>(null)
  const [hasNextPage, setHasNextPage] = useState(false)
  const [isLoading, setIsLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [attemptedCursor, setAttemptedCursor] = useState<string | null>(null)

  // Supersede guard: only the newest request may write state, so a page that
  // resolves after a newer search can never overwrite it.
  const requestIdRef = useRef(0)

  // Debounce the typed search (>= 250 ms) so the server sees one query per
  // settled term, not one per keystroke.
  useEffect(() => {
    const handle = setTimeout(
      () => setDebouncedSearch(search),
      SEARCH_DEBOUNCE_MS
    )
    return () => clearTimeout(handle)
  }, [search])

  const loadPage = useCallback(
    async (cursor: string | null, mode: LoadMode) => {
      const requestId = requestIdRef.current + 1
      requestIdRef.current = requestId
      setAttemptedCursor(cursor)
      setIsLoading(true)
      setError(null)

      try {
        const page: LedgerPage = await convex.query(
          api.attendees.getAttendeeLedgerPage,
          {
            eventId,
            search: debouncedSearch || undefined,
            pageSize: PAGE_SIZE,
            cursor,
          }
        )
        if (requestIdRef.current !== requestId) return
        setRows((previous) =>
          mode === "append" ? [...previous, ...page.rows] : page.rows
        )
        setNextCursor(page.page.nextCursor)
        setHasNextPage(page.page.hasNextPage)
      } catch {
        if (requestIdRef.current !== requestId) return
        setError("The attendee list could not be loaded.")
      } finally {
        if (requestIdRef.current === requestId) setIsLoading(false)
      }
    },
    [convex, debouncedSearch, eventId]
  )

  // A new debounced search (or a new event) resets to the first page and
  // REPLACES the rows. `loadPage` is stable for one debounced term, so this
  // runs exactly once per term.
  useEffect(() => {
    void loadPage(null, "replace")
  }, [loadPage])

  const showLoadingState = isLoading && rows.length === 0
  const showEmptyState = !isLoading && !error && rows.length === 0
  // A page can come back empty while the server reports further pages
  // (`page.hasNextPage`): the source scan keeps a scan-cap resume resumable.
  // Saying "No attendees match this search" there would be a lie — the copy
  // must point at the still-reachable `Load more attendees` control instead.
  const emptyTitle = debouncedSearch
    ? hasNextPage
      ? "No matches yet"
      : "No attendees match this search"
    : "No attendees to select"
  const emptyMessage = debouncedSearch
    ? hasNextPage
      ? "Load more to keep searching this event."
      : "Try a different name or order reference."
    : "This event has no attendees yet."

  return (
    <div className="space-y-3">
      <Input
        type="search"
        aria-label="Search attendees"
        placeholder="Search by name or order reference"
        value={search}
        disabled={disabled}
        onChange={(event) => setSearch(event.target.value)}
      />

      <p className="text-xs text-muted-foreground">
        {selectedIds.size} selected
      </p>

      {error ? (
        <div
          role="alert"
          aria-live="assertive"
          className="space-y-2 rounded-xl border border-destructive/30 bg-destructive/10 p-3 text-sm font-medium text-destructive"
        >
          <p>{error}</p>
          <Button
            type="button"
            variant="outline"
            size="sm"
            disabled={disabled}
            onClick={() =>
              void loadPage(
                attemptedCursor,
                attemptedCursor === null ? "replace" : "append"
              )
            }
          >
            Try again
          </Button>
        </div>
      ) : showLoadingState ? (
        <DashboardQueryState state="loading" />
      ) : showEmptyState ? (
        <DashboardQueryState
          state="empty"
          title={emptyTitle}
          message={emptyMessage}
        />
      ) : (
        <div className="max-h-64 space-y-1 overflow-y-auto rounded-xl border border-border/60">
          {rows.map((row) => {
            const checked = selectedIds.has(String(row._id))
            return (
              <label
                key={row._id}
                className="flex min-h-11 cursor-pointer items-center gap-3 p-3 transition-colors hover:bg-muted/40"
              >
                <input
                  type="checkbox"
                  checked={checked}
                  disabled={disabled}
                  onChange={() =>
                    checked
                      ? onDeselect(row._id)
                      : onSelect({
                          attendeeId: row._id,
                          name: row.name,
                          orderRef: row.bookingRef ?? null,
                          ticketTypeLabel: row.ticketTypeLabel ?? null,
                        })
                  }
                />
                <span className="min-w-0">
                  <span
                    className="block truncate text-sm font-medium"
                    title={row.name}
                  >
                    {row.name}
                  </span>
                  <span className="block truncate text-xs text-muted-foreground">
                    {row.bookingRef ?? "No order reference"}
                    {row.ticketTypeLabel ? ` · ${row.ticketTypeLabel}` : ""}
                  </span>
                </span>
              </label>
            )
          })}
        </div>
      )}

      {hasNextPage ? (
        <Button
          type="button"
          variant="outline"
          size="sm"
          disabled={disabled || isLoading}
          onClick={() => void loadPage(nextCursor, "append")}
        >
          Load more attendees
        </Button>
      ) : null}
    </div>
  )
}
