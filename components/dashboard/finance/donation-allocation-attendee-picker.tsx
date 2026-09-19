"use client"

import { useCallback, useEffect, useRef, useState } from "react"
import { useConvex } from "convex/react"

import { api } from "@/convex/_generated/api"
import type { Id } from "@/convex/_generated/dataModel"
import { DashboardQueryState } from "@/components/dashboard/dashboard-query-state"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"

/**
 * The retained allocation picker path now searches source orders. The component
 * keeps the historical filename because the finance money-audit suite pins it,
 * but its public rows contain only order-facing identity data.
 */

export type PickerRow = {
  orderId: Id<"orders">
  bookingRef: string | null
  providerOrderId: string | null
  bookerName: string | null
  bookerEmail: string | null
}

export type DonationAllocationAttendeePickerProps = {
  eventId: Id<"events">
  selectedOrder: PickerRow | null
  onSelect: (row: PickerRow) => void
  onDeselect: () => void
  disabled?: boolean
}

type SearchPage = {
  rows: PickerRow[]
  page: { hasNextPage: boolean; nextCursor: string | null }
}

type LoadMode = "replace" | "append"

const PAGE_SIZE = 50
const SEARCH_DEBOUNCE_MS = 250

function orderTitle(row: PickerRow) {
  return row.bookerName?.trim() || row.bookingRef || "Unnamed booker"
}

function orderDetails(row: PickerRow) {
  return [
    row.bookingRef,
    row.providerOrderId,
    row.bookerEmail,
  ]
    .filter((value): value is string => Boolean(value?.trim()))
    .join(" · ")
}

export function DonationAllocationAttendeePicker({
  eventId,
  selectedOrder,
  onSelect,
  onDeselect,
  disabled = false,
}: DonationAllocationAttendeePickerProps) {
  const convex = useConvex()

  const [search, setSearch] = useState("")
  const [debouncedSearch, setDebouncedSearch] = useState("")
  const [rows, setRows] = useState<PickerRow[]>([])
  const [nextCursor, setNextCursor] = useState<string | null>(null)
  const [hasNextPage, setHasNextPage] = useState(false)
  const [isLoading, setIsLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [attemptedCursor, setAttemptedCursor] = useState<string | null>(null)
  const requestIdRef = useRef(0)

  useEffect(() => {
    const handle = setTimeout(
      () => setDebouncedSearch(search.trim()),
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
        const page: SearchPage = await convex.query(
          api.orders.searchOrdersForDonationAllocation,
          {
            eventId,
            search: debouncedSearch,
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
        setError("The order list could not be loaded.")
      } finally {
        if (requestIdRef.current === requestId) setIsLoading(false)
      }
    },
    [convex, debouncedSearch, eventId]
  )

  useEffect(() => {
    void loadPage(null, "replace")
  }, [loadPage])

  const showLoadingState = isLoading && rows.length === 0
  const showEmptyState = !isLoading && !error && rows.length === 0
  const emptyTitle = debouncedSearch
    ? hasNextPage
      ? "No matches yet"
      : "No orders match this search"
    : "No eligible orders to select"
  const emptyMessage = debouncedSearch
    ? hasNextPage
      ? "Load more to keep searching this event."
      : "Try a different booking reference, provider ID, order ID, name, or email."
    : "This event has no visible internal orders yet."

  return (
    <div className="space-y-3">
      <Input
        type="search"
        aria-label="Search orders"
        placeholder="Search by booking reference, provider ID, order ID, name, or email"
        value={search}
        disabled={disabled}
        onChange={(event) => setSearch(event.target.value)}
      />

      {selectedOrder ? (
        <div className="flex items-start justify-between gap-3 rounded-xl border border-primary/30 bg-primary/5 p-3">
          <div className="min-w-0">
            <p className="text-xs font-semibold tracking-wide text-muted-foreground uppercase">
              Selected order
            </p>
            <p className="truncate text-sm font-medium" title={orderTitle(selectedOrder)}>
              {orderTitle(selectedOrder)}
            </p>
            <p className="truncate text-xs text-muted-foreground">
              {orderDetails(selectedOrder) || String(selectedOrder.orderId)}
            </p>
          </div>
          <Button
            type="button"
            variant="ghost"
            size="xs"
            disabled={disabled}
            onClick={onDeselect}
          >
            Remove
          </Button>
        </div>
      ) : null}

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
            const selected =
              selectedOrder !== null &&
              String(selectedOrder.orderId) === String(row.orderId)
            const title = orderTitle(row)
            return (
              <label
                key={row.orderId}
                className="flex min-h-11 cursor-pointer items-center gap-3 p-3 transition-colors hover:bg-muted/40"
              >
                <input
                  type="radio"
                  name="donation-allocation-order"
                  aria-label={`${selected ? "Deselect" : "Select"} ${title}`}
                  checked={selected}
                  disabled={disabled}
                  onChange={() => (selected ? onDeselect() : onSelect(row))}
                />
                <span className="min-w-0">
                  <span className="block truncate text-sm font-medium" title={title}>
                    {title}
                  </span>
                  <span className="block truncate text-xs text-muted-foreground">
                    {orderDetails(row) || String(row.orderId)}
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
          Load more orders
        </Button>
      ) : null}
    </div>
  )
}
