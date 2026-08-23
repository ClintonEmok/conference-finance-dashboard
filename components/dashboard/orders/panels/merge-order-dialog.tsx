"use client"

import { useEffect, useState } from "react"
import { useQuery } from "convex/react"
import { AlertCircle, Loader2 } from "lucide-react"

import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert"
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
import { api } from "@/lib/convex/api"
import { formatMoney } from "@/lib/format"
import { cn } from "@/lib/utils"
import type { Id } from "@/convex/_generated/dataModel"

type MergeOrderDialogProps = {
  open: boolean
  onOpenChange: (open: boolean) => void
  orderId: string
  slug: string
  eventId: string
}

function formatDateTime(value: string | null) {
  if (!value) return "-"
  const parsed = new Date(value)
  if (Number.isNaN(parsed.getTime())) return value
  return parsed.toLocaleString("en-GB", {
    day: "2-digit",
    month: "short",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  })
}

export function MergeOrderDialog({
  open,
  onOpenChange,
  orderId,
  slug,
  eventId,
}: MergeOrderDialogProps) {
  const [mergeSearch, setMergeSearch] = useState("")
  const [debouncedMergeSearch, setDebouncedMergeSearch] = useState("")
  const [selectedMergeTargetId, setSelectedMergeTargetId] = useState<
    string | null
  >(null)
  const [isMerging, setIsMerging] = useState(false)
  const [mergeError, setMergeError] = useState<string | null>(null)

  useEffect(() => {
    const timer = setTimeout(() => setDebouncedMergeSearch(mergeSearch), 300)
    return () => clearTimeout(timer)
  }, [mergeSearch])

  const mergeSearchResults = useQuery(
    api.orders.searchOrdersForMerge,
    debouncedMergeSearch && eventId
      ? { search: debouncedMergeSearch, eventId: eventId as Id<"events"> }
      : "skip"
  )

  async function mergeInto(targetOrderId: string) {
    if (!orderId) return

    setIsMerging(true)
    setMergeError(null)

    try {
      const response = await fetch(
        `/api/dashboard/orders/${encodeURIComponent(orderId)}/merge`,
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            sourceOrderIds: [orderId],
            targetOrderId,
          }),
        }
      )

      if (!response.ok) {
        const body = (await response.json().catch(() => null)) as {
          error?: { message?: string }
        } | null
        throw new Error(body?.error?.message ?? "Failed to merge orders")
      }

      window.location.assign(
        `/dashboard/events/${slug}/orders/${encodeURIComponent(targetOrderId)}`
      )
    } catch (error) {
      setMergeError(
        error instanceof Error ? error.message : "Failed to merge orders."
      )
    } finally {
      setIsMerging(false)
    }
  }

  return (
    <Dialog
      open={open}
      onOpenChange={(open) => {
        if (!open) {
          onOpenChange(false)
          setSelectedMergeTargetId(null)
        }
      }}
    >
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>Merge into another order</DialogTitle>
          <DialogDescription>
            Search for the target order to merge this order into. All
            attendees, ticket selections, accommodation rows, assignments,
            payments, payment links, and booking-reference aliases will be
            moved to the target order.
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-3">
          <Input
            placeholder="Search by name, email, or booking ref…"
            value={mergeSearch}
            onChange={(e) => {
              setMergeSearch(e.target.value)
              setSelectedMergeTargetId(null)
            }}
          />

          {mergeError && (
            <Alert variant="destructive" className="rounded-xl">
              <AlertCircle className="size-4" />
              <AlertTitle className="text-destructive">Merge failed</AlertTitle>
              <AlertDescription className="text-destructive/80">
                {mergeError}
              </AlertDescription>
            </Alert>
          )}

          {debouncedMergeSearch && (
            <div className="max-h-64 overflow-y-auto rounded-xl border border-white/20">
              {(mergeSearchResults ?? []).length === 0 ? (
                <p className="p-4 text-center text-xs text-muted-foreground">
                  No orders found.
                </p>
              ) : (
                (mergeSearchResults ?? []).map((result) => (
                  <button
                    key={result.orderId}
                    type="button"
                    onClick={() => setSelectedMergeTargetId(result.orderId)}
                    className={cn(
                      "flex w-full items-center justify-between px-4 py-3 text-left transition-colors hover:bg-white/10",
                      selectedMergeTargetId === result.orderId &&
                        "bg-primary/10 ring-1 ring-primary/20",
                      result.orderId === (orderId as Id<"orders">) &&
                        "cursor-not-allowed opacity-40"
                    )}
                    disabled={result.orderId === (orderId as Id<"orders">)}
                  >
                    <div className="min-w-0 flex-1">
                      <p className="truncate text-sm font-bold">
                        {result.bookerName ?? result.bookerEmail ?? "—"}
                      </p>
                      <p className="truncate font-mono text-[10px] text-muted-foreground/60">
                        {result.orderId}
                        {result.bookingRef ? ` · ${result.bookingRef}` : ""}
                      </p>
                    </div>
                    <div className="ml-3 shrink-0 text-right">
                      <p className="text-xs font-black tabular-nums">
                        {typeof result.totalAmountMinor === "number"
                          ? formatMoney(result.totalAmountMinor)
                          : "Unavailable"}
                      </p>
                      <p className="text-[9px] text-muted-foreground">
                        {formatDateTime(result.orderedAt)}
                      </p>
                    </div>
                  </button>
                ))
              )}
            </div>
          )}
        </div>

        <DialogFooter>
          <Button
            type="button"
            variant="ghost"
            onClick={() => {
              onOpenChange(false)
              setSelectedMergeTargetId(null)
            }}
            className="h-9 rounded-lg px-4 text-[11px] font-bold tracking-wider uppercase"
          >
            Cancel
          </Button>
          <Button
            type="button"
            disabled={!selectedMergeTargetId || isMerging}
            onClick={() => {
              if (selectedMergeTargetId) {
                void mergeInto(selectedMergeTargetId)
              }
            }}
            className="h-9 rounded-lg px-4 text-[11px] font-bold tracking-wider uppercase"
          >
            {isMerging ? (
              <>
                <Loader2 className="mr-2 size-3.5 animate-spin" />
                Merging…
              </>
            ) : (
              "Merge"
            )}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
