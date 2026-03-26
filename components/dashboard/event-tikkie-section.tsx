"use client"

import { useCallback, useEffect, useState } from "react"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table"

type Event = {
  providerEventId: string
  name: string | null
}

type TikkiePayment = {
  _id: string
  paymentToken: string
  payerName: string
  amountMinor: number
  paidAt: number
  matchStatus: "unmatched" | "auto_matched" | "manual"
  orderId?: string
}

type TikkieLink = {
  _id: string
  paymentRequestUrl: string
  paymentRequestToken: string
  status?: string
  amountMinor: number
  description: string
}

type EventData = {
  link: TikkieLink | null
  payments: TikkiePayment[]
  stats: {
    totalPayments: number
    matchedPayments: number
    unmatchedPayments: number
    totalAmountMinor: number
  }
}

type Order = {
  id: string
  providerOrderId: string
  buyerName: string
  totalAmountMinor: number
}

function formatMoney(minor: number) {
  return new Intl.NumberFormat("en-US", {
    style: "currency",
    currency: "EUR",
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  }).format(minor / 100)
}

function formatDate(epochMs: number) {
  return new Date(epochMs).toLocaleDateString("en-US", {
    year: "numeric",
    month: "short",
    day: "numeric",
  })
}

function MatchBadge({ status }: { status: string }) {
  if (status === "unmatched") {
    return (
      <Badge variant="outline" className="border-amber-400 text-amber-600">
        Unmatched
      </Badge>
    )
  }
  return <Badge className="bg-emerald-500 text-white">Matched</Badge>
}

type EventTikkieSectionProps = {
  events: Event[]
}

export function EventTikkieSection({ events }: EventTikkieSectionProps) {
  const [selectedEventId, setSelectedEventId] = useState<string>(
    events[0]?.providerEventId ?? ""
  )
  const [eventData, setEventData] = useState<EventData | null>(null)
  const [isLoading, setIsLoading] = useState(false)
  const [isCollapsed, setIsCollapsed] = useState(false)
  const [actionError, setActionError] = useState<string | null>(null)
  const [isCreateModalOpen, setIsCreateModalOpen] = useState(false)
  const [createAmountEuro, setCreateAmountEuro] = useState("")
  const [createAmountError, setCreateAmountError] = useState<string | null>(
    null
  )
  const [isCreatingLink, setIsCreatingLink] = useState(false)

  // Assign modal state
  const [assigningPaymentId, setAssigningPaymentId] = useState<string | null>(
    null
  )
  const [assignSearch, setAssignSearch] = useState("")
  const [assignOrders, setAssignOrders] = useState<Order[]>([])
  const [selectedOrder, setSelectedOrder] = useState<Order | null>(null)
  const [isAssigning, setIsAssigning] = useState(false)
  const [isSearching, setIsSearching] = useState(false)

  const fetchData = useCallback(async (eventId: string) => {
    if (!eventId) return
    setIsLoading(true)
    setActionError(null)
    try {
      const res = await fetch(
        `/api/dashboard/tikkie-event-links?eventId=${encodeURIComponent(eventId)}`
      )
      if (!res.ok) {
        const body = await res.json().catch(() => null)
        throw new Error(
          body?.error?.message ?? "Failed to load event Tikkie data"
        )
      }
      const data = (await res.json()) as EventData
      setEventData(data)
    } catch (err) {
      setActionError(err instanceof Error ? err.message : "Failed to load")
    } finally {
      setIsLoading(false)
    }
  }, [])

  useEffect(() => {
    void fetchData(selectedEventId)
  }, [selectedEventId, fetchData])

  // Debounced order search for assign modal
  useEffect(() => {
    if (!assigningPaymentId) {
      setAssignSearch("")
      setAssignOrders([])
      setSelectedOrder(null)
      return
    }
    setAssignSearch("")
    setAssignOrders([])
    setSelectedOrder(null)
  }, [assigningPaymentId])

  useEffect(() => {
    if (!assignSearch.trim()) {
      setAssignOrders([])
      return
    }
    const timer = setTimeout(async () => {
      setIsSearching(true)
      try {
        const params = new URLSearchParams()
        params.set("q", assignSearch.trim())
        params.set("limit", "10")
        const res = await fetch(`/api/orders/search?${params.toString()}`)
        if (res.ok) {
          const data = await res.json()
          setAssignOrders(data.orders ?? [])
        }
      } catch {
        // silently fail
      } finally {
        setIsSearching(false)
      }
    }, 300)
    return () => clearTimeout(timer)
  }, [assignSearch])

  function closeCreateModal() {
    setIsCreateModalOpen(false)
    setCreateAmountEuro("")
    setCreateAmountError(null)
  }

  function parseEuroAmountToMinor(
    value: string
  ): { amountMinor: number } | { error: string } {
    const normalized = value.trim().replace(",", ".")

    if (!normalized) {
      return { error: "Enter an amount in euros." as const }
    }

    if (!/^\d+(\.\d{1,2})?$/.test(normalized)) {
      return {
        error:
          "Amount must be a non-negative number with up to 2 decimals." as const,
      }
    }

    const euros = Number(normalized)
    if (!Number.isFinite(euros) || euros < 0) {
      return {
        error:
          "Amount must be a non-negative number with up to 2 decimals." as const,
      }
    }

    return { amountMinor: Math.round(euros * 100) }
  }

  async function handleCreateLink(amountMinor: number) {
    if (!selectedEventId) return
    setActionError(null)
    setIsCreatingLink(true)
    try {
      const res = await fetch("/api/dashboard/tikkie-event-links", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          eventId: selectedEventId,
          providerEventId: selectedEventId,
          amountMinor,
        }),
      })
      if (!res.ok) {
        const body = await res.json().catch(() => null)
        throw new Error(body?.error?.message ?? "Failed to create Tikkie link")
      }
      await fetchData(selectedEventId)
      closeCreateModal()
    } catch (err) {
      setActionError(
        err instanceof Error ? err.message : "Failed to create link"
      )
    } finally {
      setIsCreatingLink(false)
    }
  }

  async function handleCreateModalSubmit() {
    const parsedAmount = parseEuroAmountToMinor(createAmountEuro)
    if ("error" in parsedAmount) {
      setCreateAmountError(parsedAmount.error)
      return
    }

    setCreateAmountError(null)
    await handleCreateLink(parsedAmount.amountMinor)
  }

  async function handleAssign(paymentId: string) {
    if (!selectedOrder) return
    setIsAssigning(true)
    setActionError(null)
    try {
      const res = await fetch("/api/dashboard/tikkie-event-links", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ paymentId, orderId: selectedOrder.id }),
      })
      if (!res.ok) {
        const body = await res.json().catch(() => null)
        throw new Error(body?.error?.message ?? "Failed to assign payment")
      }
      setAssigningPaymentId(null)
      await fetchData(selectedEventId)
    } catch (err) {
      setActionError(err instanceof Error ? err.message : "Failed to assign")
    } finally {
      setIsAssigning(false)
    }
  }

  async function handleAutoMatch() {
    setActionError(null)
    try {
      const res = await fetch("/api/dashboard/tikkie-event-links/auto-match", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ eventId: selectedEventId }),
      })
      if (!res.ok) {
        const body = await res.json().catch(() => null)
        throw new Error(body?.error?.message ?? "Failed to auto-match")
      }
      await fetchData(selectedEventId)
    } catch (err) {
      setActionError(
        err instanceof Error ? err.message : "Failed to auto-match"
      )
    }
  }

  const hasLink = !!eventData?.link

  return (
    <section className="rounded-xl border border-border bg-card p-6 shadow-sm">
      {/* Header */}
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="flex items-center gap-3">
          <button
            onClick={() => setIsCollapsed((c) => !c)}
            className="text-muted-foreground transition hover:text-foreground"
            aria-label={isCollapsed ? "Expand" : "Collapse"}
          >
            {isCollapsed ? "▶" : "▼"}
          </button>
          <div>
            <p className="text-xs font-semibold tracking-[0.22em] text-muted-foreground uppercase">
              Event Tikkie payments
            </p>
            <h3 className="text-lg font-semibold text-foreground">
              Track payments per event
            </h3>
          </div>
        </div>

        <div className="flex items-center gap-3">
          {events.length > 0 && (
            <select
              value={selectedEventId}
              onChange={(e) => setSelectedEventId(e.target.value)}
              className="rounded-md border border-input bg-background px-3 py-1.5 text-sm"
            >
              {events.map((ev) => (
                <option key={ev.providerEventId} value={ev.providerEventId}>
                  {ev.name ?? ev.providerEventId}
                </option>
              ))}
            </select>
          )}
          <Button
            size="sm"
            onClick={() => {
              setCreateAmountError(null)
              setCreateAmountEuro("")
              setIsCreateModalOpen(true)
            }}
            disabled={!selectedEventId}
          >
            Create Tikkie link
          </Button>
        </div>
      </div>

      {/* Collapsible body */}
      {!isCollapsed && (
        <div className="mt-5 space-y-4">
          {isLoading && (
            <div className="space-y-2">
              <div className="h-8 w-48 animate-pulse rounded bg-muted" />
              <div className="h-12 w-full animate-pulse rounded bg-muted" />
            </div>
          )}

          {actionError && (
            <div className="rounded-lg border border-destructive/20 bg-destructive/10 px-4 py-3 text-sm text-destructive">
              {actionError}
            </div>
          )}

          {!isLoading && !hasLink && (
            <p className="text-sm text-muted-foreground">
              No Tikkie link for this event yet. Click &quot;Create Tikkie
              link&quot; above.
            </p>
          )}

          {!isLoading && hasLink && eventData && (
            <>
              {/* Summary bar */}
              <div className="flex flex-wrap items-center gap-4 rounded-lg border border-border bg-muted/40 px-4 py-3 text-sm">
                <span>
                  Total payments:{" "}
                  <strong>{eventData.stats.totalPayments}</strong>
                </span>
                <span className="text-emerald-600">
                  Matched: <strong>{eventData.stats.matchedPayments}</strong>
                </span>
                <span className="text-amber-600">
                  Unmatched:{" "}
                  <strong>{eventData.stats.unmatchedPayments}</strong>
                </span>
                <span>
                  Total:{" "}
                  <strong>
                    {formatMoney(eventData.stats.totalAmountMinor)}
                  </strong>
                </span>
                <Button
                  size="sm"
                  variant="outline"
                  onClick={handleAutoMatch}
                  className="ml-auto"
                >
                  Auto-match
                </Button>
              </div>

              {/* Payment list */}
              {eventData.payments.length === 0 ? (
                <p className="text-sm text-muted-foreground">
                  No payments received yet on this link.
                </p>
              ) : (
                <div className="overflow-x-auto rounded-lg border border-border">
                  <Table>
                    <TableHeader>
                      <TableRow>
                        <TableHead>Payer</TableHead>
                        <TableHead>Amount</TableHead>
                        <TableHead>Date</TableHead>
                        <TableHead>Status</TableHead>
                        <TableHead className="text-right">Action</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {eventData.payments.map((p) => (
                        <TableRow key={p._id}>
                          <TableCell className="font-medium">
                            {p.payerName}
                          </TableCell>
                          <TableCell>{formatMoney(p.amountMinor)}</TableCell>
                          <TableCell>{formatDate(p.paidAt)}</TableCell>
                          <TableCell>
                            <MatchBadge status={p.matchStatus} />
                          </TableCell>
                          <TableCell className="text-right">
                            {p.matchStatus === "unmatched" && (
                              <Button
                                size="sm"
                                variant="outline"
                                onClick={() => setAssigningPaymentId(p._id)}
                              >
                                Assign
                              </Button>
                            )}
                          </TableCell>
                        </TableRow>
                      ))}
                    </TableBody>
                  </Table>
                </div>
              )}
            </>
          )}
        </div>
      )}

      {/* Assign modal */}
      {isCreateModalOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center">
          <div
            className="absolute inset-0 bg-black/50"
            onClick={closeCreateModal}
          />
          <div className="relative z-10 w-full max-w-md rounded-lg bg-background p-6 shadow-lg">
            <h2 className="text-lg font-semibold">Create Tikkie link</h2>
            <p className="mt-2 text-sm text-muted-foreground">
              Enter amount in euros. Use <strong>0</strong> for an open amount
              link.
            </p>

            <div className="mt-4">
              <label
                htmlFor="create-tikkie-amount"
                className="mb-2 block text-sm font-medium"
              >
                Amount (EUR)
              </label>
              <Input
                id="create-tikkie-amount"
                type="text"
                inputMode="decimal"
                placeholder="e.g. 25.00 or 0"
                value={createAmountEuro}
                onChange={(e) => setCreateAmountEuro(e.target.value)}
                disabled={isCreatingLink}
              />
              {createAmountError && (
                <p className="mt-2 text-sm text-destructive">
                  {createAmountError}
                </p>
              )}
            </div>

            <div className="mt-6 flex justify-end gap-2">
              <Button
                variant="outline"
                onClick={closeCreateModal}
                disabled={isCreatingLink}
              >
                Cancel
              </Button>
              <Button
                onClick={handleCreateModalSubmit}
                disabled={isCreatingLink}
              >
                {isCreatingLink ? "Creating..." : "Create link"}
              </Button>
            </div>
          </div>
        </div>
      )}

      {assigningPaymentId && (
        <div className="fixed inset-0 z-50 flex items-center justify-center">
          <div
            className="absolute inset-0 bg-black/50"
            onClick={() => setAssigningPaymentId(null)}
          />
          <div className="relative z-10 w-full max-w-lg rounded-lg bg-background p-6 shadow-lg">
            <h2 className="mb-4 text-lg font-semibold">
              Assign Payment to Order
            </h2>

            <div className="mb-4">
              <label className="mb-2 block text-sm font-medium">
                Search for Order
              </label>
              <Input
                type="text"
                placeholder="Search by buyer name or order ID..."
                value={assignSearch}
                onChange={(e) => setAssignSearch(e.target.value)}
              />
            </div>

            <div className="mb-4 max-h-48 overflow-y-auto rounded-md border">
              {isSearching ? (
                <div className="p-4 text-center text-sm text-muted-foreground">
                  Searching...
                </div>
              ) : assignOrders.length === 0 && assignSearch ? (
                <div className="p-4 text-center text-sm text-muted-foreground">
                  No orders found
                </div>
              ) : assignOrders.length === 0 ? (
                <div className="p-4 text-center text-sm text-muted-foreground">
                  Type to search for orders
                </div>
              ) : (
                assignOrders.map((order) => (
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
                          {order.providerOrderId}
                        </div>
                        <div className="text-sm">{order.buyerName}</div>
                      </div>
                      <div className="text-sm font-medium">
                        {formatMoney(order.totalAmountMinor)}
                      </div>
                    </div>
                  </div>
                ))
              )}
            </div>

            <div className="flex justify-end gap-2">
              <Button
                variant="outline"
                onClick={() => setAssigningPaymentId(null)}
                disabled={isAssigning}
              >
                Cancel
              </Button>
              <Button
                onClick={() => handleAssign(assigningPaymentId)}
                disabled={!selectedOrder || isAssigning}
              >
                {isAssigning ? "Assigning..." : "Assign Payment"}
              </Button>
            </div>
          </div>
        </div>
      )}
    </section>
  )
}
