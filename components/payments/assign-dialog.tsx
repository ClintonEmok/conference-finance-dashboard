"use client"

import { useEffect, useState } from "react"

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
  providerOrderId: string
  buyerName: string | null
  totalAmountMinor: number
}

type AssignDialogProps = {
  payment: Payment
  open: boolean
  onOpenChange: (open: boolean) => void
  onAssigned: () => void
}

import { formatMoney } from "@/lib/format"

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
  const [orders, setOrders] = useState<Order[]>([])
  const [selectedOrder, setSelectedOrder] = useState<Order | null>(null)
  const [isLoading, setIsLoading] = useState(false)
  const [isSearching, setIsSearching] = useState(false)
  const [error, setError] = useState<string | null>(null)

  // Reset state when dialog opens
  useEffect(() => {
    if (open) {
      setSearchQuery("")
      setOrders([])
      setSelectedOrder(null)
      setError(null)
    }
  }, [open])

  // Search orders when query changes
  useEffect(() => {
    async function searchOrders() {
      if (!searchQuery.trim()) {
        setOrders([])
        return
      }

      setIsSearching(true)
      try {
        const params = new URLSearchParams()
        params.set("q", searchQuery.trim())
        params.set("limit", "10")

        const response = await fetch(`/api/orders/search?${params.toString()}`)
        if (response.ok) {
          const data = await response.json()
          setOrders(data.orders || [])
        }
      } catch (err) {
        console.error("Failed to search orders:", err)
      } finally {
        setIsSearching(false)
      }
    }

    const debounce = setTimeout(searchOrders, 300)
    return () => clearTimeout(debounce)
  }, [searchQuery])

  async function handleAssign() {
    if (!selectedOrder) {
      setError("Please select an order")
      return
    }

    setIsLoading(true)
    setError(null)

    try {
      const response = await fetch(`/api/payments/${payment.id}/assign`, {
        method: "PATCH",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          orderId: selectedOrder.providerOrderId,
        }),
      })

      if (!response.ok) {
        const data = await response.json()
        throw new Error(data.error?.message || "Failed to assign payment")
      }

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
                        {order.providerOrderId} -{" "}
                        {getBuyerLabel(order.buyerName)}
                      </div>
                      <div className="text-xs text-muted-foreground">
                        {getBuyerLabel(order.buyerName)}
                      </div>
                    </div>
                    <div className="text-right">
                      <div className="text-sm font-medium">
                        {formatMoney(order.totalAmountMinor)}
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
                <span className="font-mono">
                  {selectedOrder.providerOrderId}
                </span>
              </div>
              <div className="flex justify-between">
                <span className="text-muted-foreground">Buyer:</span>
                <span>{getBuyerLabel(selectedOrder.buyerName)}</span>
              </div>
              <div className="flex justify-between">
                <span className="text-muted-foreground">Total:</span>
                <span className="font-medium">
                  {formatMoney(selectedOrder.totalAmountMinor)}
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
