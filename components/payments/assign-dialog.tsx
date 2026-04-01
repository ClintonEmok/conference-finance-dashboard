"use client"

import { useState, useEffect } from "react"

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
import { maskPaymentPayer } from "@/lib/utils/privacy"
import { useSearchOrders } from "@/lib/convex/hooks/orders"
import { useAssignPaymentToOrder } from "@/lib/convex/hooks/payments"
import { formatMoney } from "@/lib/format"
import type { Id } from "@/convex/_generated/dataModel"

type PaymentSource = "tikkie" | "bank_transfer" | "cash"

type Payment = {
  id: string
  source: PaymentSource
  payerName: string
  payerAccountNumber: string | null
  amountMinor: number
  paidAt: string
}

type Order = {
  id: string
  buyerName: string | null
  totalAmountMinor: number | null
}

type AssignDialogProps = {
  payment: Payment
  open: boolean
  onOpenChange: (open: boolean) => void
  onAssigned: () => void
}

function formatDate(isoString: string) {
  return new Date(isoString).toLocaleDateString("en-US", {
    year: "numeric",
    month: "short",
    day: "numeric",
  })
}

function getBuyerLabel(buyerName: string | null) {
  const value = buyerName?.trim()
  return value && value.length > 0 ? value : "Unknown buyer"
}

export function AssignDialog({
  payment,
  open,
  onOpenChange,
  onAssigned,
}: AssignDialogProps) {
  const [searchQuery, setSearchQuery] = useState("")
  const [selectedOrder, setSelectedOrder] = useState<Order | null>(null)
  const [isLoading, setIsLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)

  // Use Convex hooks
  const ordersData = useSearchOrders(searchQuery, 11)
  const assignPayment = useAssignPaymentToOrder()

  const orders: Order[] = ordersData || []
  const isSearching = ordersData === undefined && searchQuery.trim().length > 0

  // Reset state when dialog opens
  useEffect(() => {
    if (open) {
      setSearchQuery("")
      setSelectedOrder(null)
      setError(null)
    }
  }, [open])

  async function handleAssign() {
    if (!selectedOrder) {
      setError("Please select an order")
      return
    }

    setIsLoading(true)
    setError(null)

    try {
      await assignPayment({
        paymentId: payment.id as Id<"payments">,
        orderId: selectedOrder.id as Id<"orders">,
        status: "manual_assignment",
        matchedBy: "dashboard",
      })

      onAssigned()
      onOpenChange(false)
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to assign payment")
    } finally {
      setIsLoading(false)
    }
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-lg">
        <DialogHeader>
          <DialogTitle>Assign Payment to Order</DialogTitle>
          <DialogDescription>
            Search for and select an order to assign this payment to.
          </DialogDescription>
        </DialogHeader>

        {/* Payment details */}
        <div className="rounded-md border bg-muted/50 p-4">
          <h3 className="mb-2 text-sm font-medium">Payment Details</h3>
          <div className="grid gap-1 text-sm">
            <div className="flex justify-between">
              <span className="text-muted-foreground">Payer:</span>
              <span>{maskPaymentPayer(payment.payerName)}</span>
            </div>
            <div className="flex justify-between">
              <span className="text-muted-foreground">Amount:</span>
              <span className="font-medium">
                {formatMoney(payment.amountMinor)}
              </span>
            </div>
            <div className="flex justify-between">
              <span className="text-muted-foreground">Date:</span>
              <span>{formatDate(payment.paidAt)}</span>
            </div>
            <div className="flex justify-between">
              <span className="text-muted-foreground">Source:</span>
              <span className="capitalize">
                {payment.source.replace("_", " ")}
              </span>
            </div>
          </div>
        </div>

        {/* Order search */}
        <div>
          <label className="mb-2 block text-sm font-medium">
            Search for Order
          </label>
          <Input
            type="text"
            placeholder="Search by buyer name or order ID..."
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            className="mb-2"
          />

          {/* Search results */}
          <div className="max-h-48 overflow-y-auto rounded-md border">
            {isSearching ? (
              <div className="p-4 text-center text-sm text-muted-foreground">
                Searching...
              </div>
            ) : orders.length === 0 && searchQuery ? (
              <div className="p-4 text-center text-sm text-muted-foreground">
                No orders found
              </div>
            ) : orders.length === 0 ? (
              <div className="p-4 text-center text-sm text-muted-foreground">
                Type to search for orders
              </div>
            ) : (
              orders.map((order) => (
                <div
                  key={order.id}
                  className={`cursor-pointer border-b p-3 last:border-b-0 ${
                    selectedOrder?.id === order.id
                      ? "bg-primary/10"
                      : "hover:bg-muted/50"
                  }`}
                  onClick={() => setSelectedOrder(order)}
                >
                  <div className="flex items-center justify-between">
                    <div>
                      <div className="font-mono text-xs">
                        {order.id} - {getBuyerLabel(order.buyerName)}
                      </div>
                      <div className="text-xs text-muted-foreground">
                        {getBuyerLabel(order.buyerName)}
                      </div>
                    </div>
                    <div className="text-right">
                      <div className="text-sm font-medium">
                        {typeof order.totalAmountMinor === "number"
                          ? formatMoney(order.totalAmountMinor)
                          : "N/A"}
                      </div>
                    </div>
                  </div>
                </div>
              ))
            )}
          </div>
        </div>

        {/* Selected order */}
        {selectedOrder && (
          <div className="rounded-md border border-primary bg-primary/5 p-4">
            <h3 className="mb-2 text-sm font-medium">Selected Order</h3>
            <div className="grid gap-1 text-sm">
              <div className="flex justify-between">
                <span className="text-muted-foreground">Order ID:</span>
                <span className="font-mono">{selectedOrder.id}</span>
              </div>
              <div className="flex justify-between">
                <span className="text-muted-foreground">Buyer:</span>
                <span>{getBuyerLabel(selectedOrder.buyerName)}</span>
              </div>
              <div className="flex justify-between">
                <span className="text-muted-foreground">Total:</span>
                <span className="font-medium">
                  {typeof selectedOrder.totalAmountMinor === "number"
                    ? formatMoney(selectedOrder.totalAmountMinor)
                    : "N/A"}
                </span>
              </div>
            </div>
          </div>
        )}

        {/* Error */}
        {error && (
          <div className="rounded-md bg-destructive/10 p-3 text-sm text-destructive">
            {error}
          </div>
        )}

        <DialogFooter>
          <Button
            variant="outline"
            onClick={() => onOpenChange(false)}
            disabled={isLoading}
          >
            Cancel
          </Button>
          <Button onClick={handleAssign} disabled={!selectedOrder || isLoading}>
            {isLoading ? "Assigning..." : "Assign Payment"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
