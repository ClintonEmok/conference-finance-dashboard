"use client"

import { useState } from "react"
import { Loader2, Lock } from "lucide-react"

import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card"
import type { Id } from "@/convex/_generated/dataModel"
import { useConfirmAccommodationOrderConfiguration } from "@/lib/convex/hooks/accommodation"

type PendingOrder = {
  orderId: Id<"orders">
  bookingRef: string | null
  bookerName: string | null
  selectionCount: number
}

export function UpgradesOptionsPendingOrders({
  pendingOrders,
  pendingOrderCount,
  hasAccommodationSelections,
}: {
  pendingOrders: PendingOrder[]
  pendingOrderCount: number
  hasAccommodationSelections: boolean
}) {
  return (
    <Card className="border-border/60 bg-card shadow-none">
      <CardHeader>
        <CardTitle>Pending buyer configurations</CardTitle>
        <CardDescription>
          Unconfirmed buyer accommodation selections use the current rates. Confirming
          locks their price snapshot so later rate edits never change it.
        </CardDescription>
      </CardHeader>
      <CardContent className="min-w-0 space-y-4">
        {!hasAccommodationSelections ? (
          <p className="rounded-lg border border-dashed p-4 text-sm text-muted-foreground">
            Pending buyer configurations will appear after signup selections are created.
          </p>
        ) : pendingOrderCount === 0 ? (
          <p className="rounded-lg border border-dashed p-4 text-sm text-muted-foreground">
            No pending buyer configurations.
          </p>
        ) : (
          <>
            <div className="flex min-w-0 flex-wrap items-center gap-2 rounded-lg border border-amber-500/30 bg-amber-500/5 p-4 text-sm text-amber-700 dark:text-amber-400">
              <span className="font-medium">
                {pendingOrderCount} pending order{pendingOrderCount === 1 ? "" : "s"} will
                re-price when their configuration remains unconfirmed.
              </span>
            </div>
            <ul className="min-w-0 space-y-3">
              {pendingOrders.map((order) => (
                <PendingOrderRow key={order.orderId} order={order} />
              ))}
            </ul>
          </>
        )}
      </CardContent>
    </Card>
  )
}

function PendingOrderRow({ order }: { order: PendingOrder }) {
  const confirm = useConfirmAccommodationOrderConfiguration()
  const [error, setError] = useState<string | null>(null)
  const [confirmed, setConfirmed] = useState(false)
  const [isPending, setIsPending] = useState(false)

  const handleConfirm = async () => {
    setError(null)
    setIsPending(true)
    try {
      await confirm({ orderId: order.orderId })
      setConfirmed(true)
    } catch (err) {
      setError(
        err instanceof Error ? err.message : "Failed to confirm this buyer configuration."
      )
    } finally {
      setIsPending(false)
    }
  }

  return (
    <li className="min-w-0 space-y-2 rounded-lg border border-border/60 p-4">
      <div className="flex min-w-0 flex-wrap items-center justify-between gap-3">
        <div className="min-w-0 space-y-1">
          <p className="flex min-w-0 flex-wrap items-center gap-2 text-sm font-semibold">
            <span className="font-mono">{order.bookingRef ?? "No booking reference"}</span>
            {confirmed && (
              <Badge variant="secondary" className="gap-1">
                <Lock className="size-3" aria-hidden="true" />
                Confirmed
              </Badge>
            )}
          </p>
          <p className="text-xs text-muted-foreground">
            {order.bookerName ?? "Unknown buyer"} ·{" "}
            {order.selectionCount} accommodation selection
            {order.selectionCount === 1 ? "" : "s"}
          </p>
        </div>
        <div className="flex min-w-0 flex-wrap items-center gap-2">
          <Button
            type="button"
            size="sm"
            variant={confirmed ? "outline" : "default"}
            disabled={isPending || confirmed}
            onClick={handleConfirm}
            aria-busy={isPending}
          >
            {isPending && <Loader2 className="size-4 animate-spin" aria-hidden="true" />}
            {confirmed ? "Locked" : "Confirm buyer configuration"}
          </Button>
        </div>
      </div>
      {confirmed ? (
        <p aria-live="polite" className="text-sm text-emerald-600 dark:text-emerald-400">
          Confirmed — buyer changes are locked for this order.
        </p>
      ) : null}
      {error ? (
        <p role="alert" aria-live="assertive" className="text-sm text-destructive">
          {error}
        </p>
      ) : null}
    </li>
  )
}
