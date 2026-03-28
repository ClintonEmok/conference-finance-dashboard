"use client"

import { useEffect, useState } from "react"

import { AssignDialog } from "@/components/payments/assign-dialog"

import { Button } from "@/components/ui/button"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { Input } from "@/components/ui/input"
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table"

type PaymentSource = "tikkie" | "bank_transfer" | "cash"
type PaymentMatchStatus =
  | "unassigned"
  | "ambiguous"
  | "manual_assignment"
  | "auto_matched"

type Payment = {
  id: string
  source: PaymentSource
  sourceId: string | null
  payerName: string
  payerAccountNumber: string | null
  amountMinor: number
  paidAt: string
  orderId: string | null
  status: PaymentMatchStatus
  matchedAt: string | null
  matchedBy: string | null
  reference: string | null
  notes: string | null
  createdAt: string
}

function toDateInputValue(date: Date) {
  return date.toISOString().slice(0, 10)
}

import { formatMoney } from "@/lib/format"

function formatDate(isoString: string) {
  return new Date(isoString).toLocaleDateString("en-US", {
    year: "numeric",
    month: "short",
    day: "numeric",
  })
}

function SourceIcon({ source }: { source: PaymentSource }) {
  switch (source) {
    case "tikkie":
      return (
        <span className="text-xs font-medium text-purple-600 dark:text-purple-400">
          Tikkie
        </span>
      )
    case "bank_transfer":
      return (
        <span className="text-xs font-medium text-blue-600 dark:text-blue-400">
          Bank
        </span>
      )
    case "cash":
      return (
        <span className="text-xs font-medium text-green-600 dark:text-green-400">
          Cash
        </span>
      )
  }
}

export default function ReconciliationPaymentsPage() {
  const [sourceFilter, setSourceFilter] = useState<string>("all")
  const [fromInput, setFromInput] = useState(() => {
    const today = new Date()
    const from = new Date(today.getTime() - 29 * 24 * 60 * 60 * 1000)
    return toDateInputValue(from)
  })
  const [toInput, setToInput] = useState(() => toDateInputValue(new Date()))

  const [appliedSource, setAppliedSource] = useState("all")
  const [appliedFrom, setAppliedFrom] = useState(fromInput)
  const [appliedTo, setAppliedTo] = useState(toInput)

  const [payments, setPayments] = useState<Payment[]>([])
  const [total, setTotal] = useState(0)
  const [page, setPage] = useState(1)
  const [isLoading, setIsLoading] = useState(true)

  const [assignDialogOpen, setAssignDialogOpen] = useState(false)
  const [selectedPayment, setSelectedPayment] = useState<Payment | null>(null)

  const limit = 20

  useEffect(() => {
    async function loadPayments() {
      setIsLoading(true)
      try {
        const params = new URLSearchParams()
        params.set("page", page.toString())
        params.set("limit", limit.toString())
        params.set("status", "unassigned")

        if (appliedSource && appliedSource !== "all") {
          params.set("source", appliedSource)
        }

        if (appliedFrom) {
          params.set("from", appliedFrom)
        }

        if (appliedTo) {
          params.set("to", appliedTo)
        }

        const response = await fetch(`/api/payments?${params.toString()}`)
        if (response.ok) {
          const data = await response.json()
          setPayments(data.payments || [])
          setTotal(data.total)
        }
      } catch (error) {
        console.error("Failed to load payments:", error)
      } finally {
        setIsLoading(false)
      }
    }

    loadPayments()
  }, [page, appliedSource, appliedFrom, appliedTo])

  function handleApplyFilters() {
    setAppliedSource(sourceFilter)
    setAppliedFrom(fromInput)
    setAppliedTo(toInput)
    setPage(1)
  }

  function handleAssign(payment: Payment) {
    setSelectedPayment(payment)
    setAssignDialogOpen(true)
  }

  function handleAssigned() {
    // Refresh the list - the useEffect will automatically reload due to dependency changes
    setPage(1)
    // Force a reload by toggling a state
    setAppliedSource(sourceFilter)
    setAppliedFrom(fromInput)
    setAppliedTo(toInput)
  }

  const totalPages = Math.ceil(total / limit)

  return (
    <section className="space-y-6">
      <div>
        <h1 className="text-2xl font-semibold">Unassigned Payments</h1>
        <p className="mt-1 text-sm text-muted-foreground">
          Assign unassigned payments from Tikkie, bank transfer, or cash to
          specific orders to complete reconciliation.
        </p>
      </div>

      {/* Filters */}
      <Card className="border border-border">
        <CardHeader>
          <CardTitle className="text-lg">Filters</CardTitle>
        </CardHeader>
        <CardContent>
          <div className="flex flex-wrap gap-4">
            <select
              value={sourceFilter}
              onChange={(e) => setSourceFilter(e.target.value)}
              className="h-10 w-[180px] rounded-md border border-input bg-background px-3 text-sm"
            >
              <option value="all">All sources</option>
              <option value="tikkie">Tikkie</option>
              <option value="bank_transfer">Bank Transfer</option>
              <option value="cash">Cash</option>
            </select>

            <div className="flex items-center gap-2">
              <label className="text-sm text-muted-foreground">From:</label>
              <Input
                type="date"
                value={fromInput}
                onChange={(e) => setFromInput(e.target.value)}
                className="w-[160px]"
              />
            </div>

            <div className="flex items-center gap-2">
              <label className="text-sm text-muted-foreground">To:</label>
              <Input
                type="date"
                value={toInput}
                onChange={(e) => setToInput(e.target.value)}
                className="w-[160px]"
              />
            </div>

            <Button onClick={handleApplyFilters}>Apply Filters</Button>
          </div>
        </CardContent>
      </Card>

      {/* Payments Table */}
      <Card className="border border-border">
        <CardHeader>
          <CardTitle className="text-lg">
            Payments ({total} unassigned)
          </CardTitle>
        </CardHeader>
        <CardContent>
          <div className="rounded-md border">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Date</TableHead>
                  <TableHead>Source</TableHead>
                  <TableHead>Payer</TableHead>
                  <TableHead className="text-right">Amount</TableHead>
                  <TableHead className="text-right">Actions</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {isLoading ? (
                  <TableRow>
                    <TableCell colSpan={5} className="h-24 text-center">
                      Loading...
                    </TableCell>
                  </TableRow>
                ) : payments.length === 0 ? (
                  <TableRow>
                    <TableCell colSpan={5} className="h-24 text-center">
                      No unassigned payments found
                    </TableCell>
                  </TableRow>
                ) : (
                  payments.map((payment) => (
                    <TableRow key={payment.id}>
                      <TableCell className="text-sm">
                        {formatDate(payment.paidAt)}
                      </TableCell>
                      <TableCell>
                        <SourceIcon source={payment.source} />
                      </TableCell>
                      <TableCell className="text-sm">
                        {payment.payerName}
                      </TableCell>
                      <TableCell className="text-right text-sm font-medium">
                        {formatMoney(payment.amountMinor)}
                      </TableCell>
                      <TableCell className="text-right">
                        <Button
                          variant="outline"
                          size="sm"
                          onClick={() => handleAssign(payment)}
                        >
                          Assign
                        </Button>
                      </TableCell>
                    </TableRow>
                  ))
                )}
              </TableBody>
            </Table>
          </div>

          {totalPages > 1 && (
            <div className="flex items-center justify-end space-x-2 pt-4">
              <Button
                variant="outline"
                size="sm"
                onClick={() => setPage((p) => Math.max(1, p - 1))}
                disabled={page === 1}
              >
                Previous
              </Button>
              <span className="text-sm text-muted-foreground">
                Page {page} of {totalPages}
              </span>
              <Button
                variant="outline"
                size="sm"
                onClick={() => setPage((p) => Math.min(totalPages, p + 1))}
                disabled={page === totalPages}
              >
                Next
              </Button>
            </div>
          )}
        </CardContent>
      </Card>

      {/* Assign Dialog */}
      {selectedPayment && (
        <AssignDialog
          payment={selectedPayment}
          open={assignDialogOpen}
          onOpenChange={setAssignDialogOpen}
          onAssigned={handleAssigned}
        />
      )}
    </section>
  )
}
