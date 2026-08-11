"use client"

import { AlertCircle } from "lucide-react"

import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert"
import { Button } from "@/components/ui/button"
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select"

export type OrderEditDraft = {
  bookerName: string
  bookerEmail: string
  bookingRef: string
  normalizedStatus: "paid" | "refunded" | "cancelled" | "pending"
  totalAmountMinor: string
  orderedAt: string
}

type OrderDetailsOrder = {
  bookerName: string | null
  bookerEmail: string | null
  bookingRef: string | null
  normalizedStatus: "paid" | "refunded" | "cancelled" | "pending" | null
  orderedAt: string | null
}

type OrderDetailsPanelProps = {
  order: OrderDetailsOrder
  isEditingOrder: boolean
  onToggleEditing: () => void
  orderEditDraft: OrderEditDraft | null
  onDraftChange: (patch: Partial<OrderEditDraft>) => void
  isSavingOrder: boolean
  orderSaveError: string | null
  onSave: () => void
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

export function OrderDetailsPanel({
  order,
  isEditingOrder,
  onToggleEditing,
  orderEditDraft,
  onDraftChange,
  isSavingOrder,
  orderSaveError,
  onSave,
}: OrderDetailsPanelProps) {
  return (
    <Card className="border-white/40 bg-white/40 shadow-sm backdrop-blur dark:border-white/10 dark:bg-black/20">
      <CardHeader className="flex flex-row items-start justify-between gap-4">
        <div>
          <CardTitle className="text-lg font-bold">Order Details</CardTitle>
          <CardDescription>View order fields, then explicitly enter edit mode to update them.</CardDescription>
        </div>
        <Button
          type="button"
          variant={isEditingOrder ? "secondary" : "default"}
          className="h-9 rounded-lg px-4 text-[11px] font-bold tracking-wider uppercase"
          onClick={onToggleEditing}
        >
          {isEditingOrder ? "Close Edit" : "Edit Order"}
        </Button>
      </CardHeader>
      <CardContent>
        {orderSaveError && (
          <Alert variant="destructive" className="mb-4 rounded-xl">
            <AlertCircle className="size-4" />
            <AlertTitle className="text-destructive">Save failed</AlertTitle>
            <AlertDescription className="text-destructive/80">{orderSaveError}</AlertDescription>
          </Alert>
        )}

        {!isEditingOrder ? (
          <div className="grid gap-4 rounded-2xl border border-white/20 bg-background/20 p-4 text-sm lg:grid-cols-2">
            <div>
              <p className="text-[10px] font-black tracking-widest text-muted-foreground uppercase">Booker name</p>
              <p className="mt-1 font-medium">{order.bookerName ?? "-"}</p>
            </div>
            <div>
              <p className="text-[10px] font-black tracking-widest text-muted-foreground uppercase">Booker email</p>
              <p className="mt-1 font-medium">{order.bookerEmail ?? "-"}</p>
            </div>
            <div>
              <p className="text-[10px] font-black tracking-widest text-muted-foreground uppercase">Booking reference</p>
              <p className="mt-1 font-medium">{order.bookingRef ?? "-"}</p>
            </div>
            <div>
              <p className="text-[10px] font-black tracking-widest text-muted-foreground uppercase">Order status</p>
              <p className="mt-1 font-medium">{order.normalizedStatus ?? "pending"}</p>
            </div>
            <div>
              <p className="text-[10px] font-black tracking-widest text-muted-foreground uppercase">Ordered at</p>
              <p className="mt-1 font-medium">{formatDateTime(order.orderedAt)}</p>
            </div>
          </div>
        ) : (
          orderEditDraft && (
            <form
              className="grid gap-4 lg:grid-cols-2"
              onSubmit={(event) => {
                event.preventDefault()
                onSave()
              }}
            >
              <div className="space-y-2">
                <Label htmlFor="bookerName">Booker name</Label>
                <Input
                  id="bookerName"
                  value={orderEditDraft.bookerName}
                  onChange={(event) =>
                    onDraftChange({ bookerName: event.target.value })
                  }
                />
              </div>

              <div className="space-y-2">
                <Label htmlFor="bookerEmail">Booker email</Label>
                <Input
                  id="bookerEmail"
                  type="email"
                  value={orderEditDraft.bookerEmail}
                  onChange={(event) =>
                    onDraftChange({ bookerEmail: event.target.value })
                  }
                />
              </div>

              <div className="space-y-2">
                <Label htmlFor="bookingRef">Booking reference</Label>
                <Input
                  id="bookingRef"
                  value={orderEditDraft.bookingRef}
                  onChange={(event) =>
                    onDraftChange({ bookingRef: event.target.value })
                  }
                />
              </div>

              <div className="space-y-2">
                <Label htmlFor="normalizedStatus">Order status</Label>
                <Select
                  value={orderEditDraft.normalizedStatus}
                  onValueChange={(value) =>
                    onDraftChange({
                      normalizedStatus: value as OrderEditDraft["normalizedStatus"],
                    })
                  }
                >
                  <SelectTrigger id="normalizedStatus">
                    <SelectValue placeholder="Select status" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="paid">paid</SelectItem>
                    <SelectItem value="refunded">refunded</SelectItem>
                    <SelectItem value="cancelled">cancelled</SelectItem>
                    <SelectItem value="pending">pending</SelectItem>
                  </SelectContent>
                </Select>
              </div>

              <div className="space-y-2">
                <Label htmlFor="totalAmountMinor">Total amount (minor units)</Label>
                <Input
                  id="totalAmountMinor"
                  type="number"
                  min="0"
                  step="1"
                  value={orderEditDraft.totalAmountMinor}
                  onChange={(event) =>
                    onDraftChange({ totalAmountMinor: event.target.value })
                  }
                />
              </div>

              <div className="space-y-2">
                <Label htmlFor="orderedAt">Ordered at</Label>
                <Input
                  id="orderedAt"
                  type="datetime-local"
                  value={orderEditDraft.orderedAt}
                  onChange={(event) =>
                    onDraftChange({ orderedAt: event.target.value })
                  }
                />
              </div>

              <div className="lg:col-span-2 flex items-center justify-between gap-3 pt-2">
                <p className="text-xs text-muted-foreground">Blank fields clear nullable values.</p>
                <div className="flex items-center gap-2">
                  <Button
                    type="button"
                    variant="ghost"
                    onClick={onToggleEditing}
                    className="h-9 rounded-lg px-4 text-[11px] font-bold tracking-wider uppercase"
                  >
                    Cancel
                  </Button>
                  <Button
                    type="submit"
                    disabled={isSavingOrder}
                    className="h-9 rounded-lg px-4 text-[11px] font-bold tracking-wider uppercase"
                  >
                    {isSavingOrder ? "Saving..." : "Save order changes"}
                  </Button>
                </div>
              </div>
            </form>
          )
        )}
      </CardContent>
    </Card>
  )
}
