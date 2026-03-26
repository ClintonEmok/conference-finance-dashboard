"use client"

import { useEffect, useState } from "react"
import type { FormEvent } from "react"
import {
  Banknote,
  Calendar,
  DollarSign,
  FileText,
  Search,
  User,
  X,
} from "lucide-react"

import { Button } from "@/components/ui/button"
import { Card, CardContent } from "@/components/ui/card"

type Order = {
  id: string
  providerOrderId: string
  buyerName: string | null
  totalAmountMinor: number | null
}

type ManualEntryFormProps = {
  onSuccess?: () => void
}

type FormValues = {
  orderId: string
  amountMinor: number
  paidAt: string
  payerName: string
  payerAccountNumber: string
  reference: string
  notes: string
}

type FormErrors = Partial<Record<keyof FormValues, string>>

function formatMoney(minor: number) {
  return new Intl.NumberFormat("en-US", {
    style: "currency",
    currency: "EUR",
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  }).format(minor / 100)
}

function validate(values: FormValues, activeTab: "bank" | "cash") {
  const errors: FormErrors = {}

  if (!values.orderId) {
    errors.orderId = "Please select an order."
  }

  if (!Number.isInteger(values.amountMinor) || values.amountMinor <= 0) {
    errors.amountMinor = "Amount must be a positive euro amount."
  }

  if (!values.paidAt) {
    errors.paidAt = "Payment date is required."
  }

  if (!values.payerName.trim()) {
    errors.payerName = "Payer name is required."
  }

  if (activeTab === "bank" && !values.payerAccountNumber.trim()) {
    errors.payerAccountNumber = "Account number is required for bank transfers."
  }

  return errors
}

export function ManualPaymentEntryForm({ onSuccess }: ManualEntryFormProps) {
  const MIN_SEARCH_CHARS = 3
  const [activeTab, setActiveTab] = useState<"bank" | "cash">("bank")
  const [orderSearch, setOrderSearch] = useState("")
  const [orders, setOrders] = useState<Order[]>([])
  const [selectedOrder, setSelectedOrder] = useState<Order | null>(null)
  const [isSearching, setIsSearching] = useState(false)
  const [searchError, setSearchError] = useState<string | null>(null)
  const [showDropdown, setShowDropdown] = useState(false)
  const [submitting, setSubmitting] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const [values, setValues] = useState<FormValues>({
    orderId: "",
    amountMinor: 0,
    paidAt: new Date().toISOString().split("T")[0],
    payerName: "",
    payerAccountNumber: "",
    reference: "",
    notes: "",
  })

  const [errors, setErrors] = useState<FormErrors>({})

  useEffect(() => {
    const trimmedSearch = orderSearch.trim()

    if (!trimmedSearch) {
      setOrders([])
      setSearchError(null)
      setIsSearching(false)
      setShowDropdown(false)
      return
    }

    if (trimmedSearch.length < MIN_SEARCH_CHARS) {
      setOrders([])
      setSearchError(null)
      setIsSearching(false)
      setShowDropdown(true)
      return
    }

    const controller = new AbortController()
    const timer = setTimeout(async () => {
      setIsSearching(true)
      setSearchError(null)
      setShowDropdown(true)

      try {
        const params = new URLSearchParams({ search: trimmedSearch })
        const response = await fetch(`/api/orders/search?${params}`, {
          signal: controller.signal,
        })

        if (!response.ok) {
          throw new Error("Failed to search orders")
        }

        const data = await response.json()
        setOrders(Array.isArray(data.orders) ? data.orders : [])
      } catch {
        if (controller.signal.aborted) {
          return
        }

        setOrders([])
        setSearchError("Unable to search orders right now. Try again.")
      } finally {
        if (!controller.signal.aborted) {
          setIsSearching(false)
        }
      }
    }, 300)

    return () => {
      controller.abort()
      clearTimeout(timer)
    }
  }, [orderSearch, MIN_SEARCH_CHARS])

  function handleSelectOrder(order: Order) {
    setSelectedOrder(order)
    setValues((current) => ({ ...current, orderId: order.providerOrderId }))
    setOrderSearch(order.buyerName || order.providerOrderId)
    setShowDropdown(false)
  }

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    setError(null)

    const nextErrors = validate(values, activeTab)
    setErrors(nextErrors)

    if (Object.keys(nextErrors).length > 0) {
      return
    }

    setSubmitting(true)

    try {
      const endpoint =
        activeTab === "bank"
          ? "/api/payments/bank-transfer"
          : "/api/payments/cash"
      const body = {
        orderId: selectedOrder?.providerOrderId ?? values.orderId,
        amountMinor: values.amountMinor,
        paidAt: values.paidAt,
        payerName: values.payerName.trim(),
        ...(activeTab === "bank" && {
          payerAccountNumber: values.payerAccountNumber.trim() || undefined,
          reference: values.reference.trim() || undefined,
        }),
        ...(activeTab === "cash" && {
          notes: values.notes.trim() || undefined,
        }),
      }

      const response = await fetch(endpoint, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      })

      if (!response.ok) {
        const data = await response.json()
        throw new Error(data.error?.message || "Failed to create payment")
      }

      // Reset form
      setValues({
        orderId: "",
        amountMinor: 0,
        paidAt: new Date().toISOString().split("T")[0],
        payerName: "",
        payerAccountNumber: "",
        reference: "",
        notes: "",
      })
      setSelectedOrder(null)
      setOrderSearch("")
      setErrors({})

      onSuccess?.()
    } catch (err) {
      setError(err instanceof Error ? err.message : "An error occurred")
    } finally {
      setSubmitting(false)
    }
  }

  return (
    <Card className="w-full max-w-2xl overflow-hidden border-slate-200 bg-white dark:border-slate-800 dark:bg-slate-950">
      <div className="border-b border-slate-200 bg-slate-50 px-5 py-4 dark:border-slate-800 dark:bg-slate-900">
        <div className="flex items-center gap-3">
          <div className="flex h-9 w-9 items-center justify-center rounded-lg bg-emerald-100 dark:bg-emerald-900/30">
            <DollarSign className="size-5 text-emerald-600 dark:text-emerald-400" />
          </div>
          <div>
            <h2 className="text-lg font-semibold text-slate-950 dark:text-slate-50">
              Manual Payment Entry
            </h2>
            <p className="text-sm text-slate-600 dark:text-slate-400">
              Record bank transfer or cash payments
            </p>
          </div>
        </div>
      </div>

      <CardContent className="p-5">
        <div className="mb-4 flex gap-1 rounded-lg bg-slate-100 p-1 dark:bg-slate-900">
          <button
            type="button"
            onClick={() => setActiveTab("bank")}
            className={`flex-1 rounded-md px-3 py-2 text-sm font-medium transition ${
              activeTab === "bank"
                ? "bg-white text-slate-950 shadow-sm dark:bg-slate-800 dark:text-slate-50"
                : "text-slate-600 hover:text-slate-950 dark:text-slate-400 dark:hover:text-slate-50"
            }`}
          >
            <Banknote className="mr-2 inline-block size-4" />
            Bank Transfer
          </button>
          <button
            type="button"
            onClick={() => setActiveTab("cash")}
            className={`flex-1 rounded-md px-3 py-2 text-sm font-medium transition ${
              activeTab === "cash"
                ? "bg-white text-slate-950 shadow-sm dark:bg-slate-800 dark:text-slate-50"
                : "text-slate-600 hover:text-slate-950 dark:text-slate-400 dark:hover:text-slate-50"
            }`}
          >
            <DollarSign className="mr-2 inline-block size-4" />
            Cash
          </button>
        </div>

        <form className="space-y-4" onSubmit={handleSubmit}>
          {/* Order Selection */}
          <div className="relative space-y-2">
            <label className="text-sm font-medium text-slate-700 dark:text-slate-300">
              <Search className="mr-1 inline-block size-4" />
              Select Order
            </label>
            <input
              type="text"
              value={orderSearch}
              onChange={(e) => {
                const nextSearch = e.target.value
                setOrderSearch(nextSearch)
                setSelectedOrder(null)
                setValues((current) => ({ ...current, orderId: "" }))
                setShowDropdown(Boolean(nextSearch.trim()))
              }}
              onFocus={() => setShowDropdown(Boolean(orderSearch.trim()))}
              placeholder="Search by buyer name or order ID..."
              className="h-11 w-full rounded-xl border border-slate-200 bg-white px-3 pl-10 text-sm shadow-sm ring-0 transition outline-none focus:border-emerald-500 dark:border-slate-800 dark:bg-slate-950"
            />
            <Search className="absolute top-[34px] left-3 size-4 text-slate-400" />
            {showDropdown && orderSearch.trim() && (
              <div className="absolute z-10 mt-1 max-h-60 w-full overflow-auto rounded-lg border border-slate-200 bg-white shadow-lg dark:border-slate-800 dark:bg-slate-900">
                {orderSearch.trim().length < MIN_SEARCH_CHARS ? (
                  <p className="px-3 py-2 text-sm text-slate-500 dark:text-slate-400">
                    Type at least {MIN_SEARCH_CHARS} characters to search.
                  </p>
                ) : null}

                {orderSearch.trim().length >= MIN_SEARCH_CHARS &&
                isSearching ? (
                  <p className="px-3 py-2 text-sm text-slate-500 dark:text-slate-400">
                    Searching orders...
                  </p>
                ) : null}

                {orderSearch.trim().length >= MIN_SEARCH_CHARS &&
                !isSearching &&
                searchError ? (
                  <p className="px-3 py-2 text-sm text-rose-600 dark:text-rose-400">
                    {searchError}
                  </p>
                ) : null}

                {orderSearch.trim().length >= MIN_SEARCH_CHARS &&
                !isSearching &&
                !searchError &&
                orders.length === 0 ? (
                  <p className="px-3 py-2 text-sm text-slate-500 dark:text-slate-400">
                    No matching orders found.
                  </p>
                ) : null}

                {orderSearch.trim().length >= MIN_SEARCH_CHARS &&
                !isSearching &&
                !searchError
                  ? orders.map((order) => (
                      <button
                        key={order.id}
                        type="button"
                        onClick={() => handleSelectOrder(order)}
                        className="w-full px-3 py-2 text-left text-sm hover:bg-slate-100 dark:hover:bg-slate-800"
                      >
                        <div className="font-medium text-slate-900 dark:text-slate-100">
                          {order.buyerName || "Unknown"}
                        </div>
                        <div className="text-xs text-slate-500">
                          {order.providerOrderId} ·{" "}
                          {order.totalAmountMinor
                            ? formatMoney(order.totalAmountMinor)
                            : "N/A"}
                        </div>
                      </button>
                    ))
                  : null}
              </div>
            )}
            {selectedOrder && (
              <div className="mt-2 rounded-lg border border-emerald-200 bg-emerald-50 px-3 py-2 dark:border-emerald-900/50 dark:bg-emerald-950/20">
                <p className="text-sm text-emerald-800 dark:text-emerald-200">
                  Selected:{" "}
                  {selectedOrder.buyerName || selectedOrder.providerOrderId}
                </p>
              </div>
            )}
            {errors.orderId && (
              <p className="text-xs text-rose-600 dark:text-rose-400">
                {errors.orderId}
              </p>
            )}
          </div>

          {/* Amount and Date */}
          <div className="grid gap-4 md:grid-cols-2">
            <label className="space-y-2">
              <span className="text-sm font-medium text-slate-700 dark:text-slate-300">
                <DollarSign className="mr-1 inline-block size-4" />
                Amount (EUR)
              </span>
              <input
                type="number"
                min={0.01}
                step={0.01}
                value={
                  values.amountMinor
                    ? (values.amountMinor / 100).toFixed(2)
                    : ""
                }
                onChange={(e) =>
                  setValues((current) => ({
                    ...current,
                    amountMinor: Math.round(
                      Number.parseFloat(e.target.value || "0") * 100
                    ),
                  }))
                }
                className="h-11 w-full rounded-xl border border-slate-200 bg-white px-3 text-sm shadow-sm ring-0 transition outline-none focus:border-emerald-500 dark:border-slate-800 dark:bg-slate-950"
              />
              {errors.amountMinor && (
                <p className="text-xs text-rose-600 dark:text-rose-400">
                  {errors.amountMinor}
                </p>
              )}
            </label>

            <label className="space-y-2">
              <span className="text-sm font-medium text-slate-700 dark:text-slate-300">
                <Calendar className="mr-1 inline-block size-4" />
                Payment Date
              </span>
              <input
                type="date"
                value={values.paidAt}
                onChange={(e) =>
                  setValues((current) => ({
                    ...current,
                    paidAt: e.target.value,
                  }))
                }
                className="h-11 w-full rounded-xl border border-slate-200 bg-white px-3 text-sm shadow-sm ring-0 transition outline-none focus:border-emerald-500 dark:border-slate-800 dark:bg-slate-950"
              />
              {errors.paidAt && (
                <p className="text-xs text-rose-600 dark:text-rose-400">
                  {errors.paidAt}
                </p>
              )}
            </label>
          </div>

          {/* Payer Name */}
          <label className="space-y-2">
            <span className="text-sm font-medium text-slate-700 dark:text-slate-300">
              <User className="mr-1 inline-block size-4" />
              Payer Name
            </span>
            <input
              type="text"
              value={values.payerName}
              onChange={(e) =>
                setValues((current) => ({
                  ...current,
                  payerName: e.target.value,
                }))
              }
              placeholder="Who made the payment?"
              className="h-11 w-full rounded-xl border border-slate-200 bg-white px-3 text-sm shadow-sm ring-0 transition outline-none focus:border-emerald-500 dark:border-slate-800 dark:bg-slate-950"
            />
            {errors.payerName && (
              <p className="text-xs text-rose-600 dark:text-rose-400">
                {errors.payerName}
              </p>
            )}
          </label>

          {/* Bank Transfer Specific Fields */}
          {activeTab === "bank" && (
            <>
              <label className="space-y-2">
                <span className="text-sm font-medium text-slate-700 dark:text-slate-300">
                  <Banknote className="mr-1 inline-block size-4" />
                  Account Number (IBAN)
                </span>
                <input
                  type="text"
                  value={values.payerAccountNumber}
                  onChange={(e) =>
                    setValues((current) => ({
                      ...current,
                      payerAccountNumber: e.target.value,
                    }))
                  }
                  placeholder="e.g., NL91ABNA0417164300"
                  className="h-11 w-full rounded-xl border border-slate-200 bg-white px-3 text-sm shadow-sm ring-0 transition outline-none focus:border-emerald-500 dark:border-slate-800 dark:bg-slate-950"
                />
                {errors.payerAccountNumber && (
                  <p className="text-xs text-rose-600 dark:text-rose-400">
                    {errors.payerAccountNumber}
                  </p>
                )}
              </label>

              <label className="space-y-2">
                <span className="text-sm font-medium text-slate-700 dark:text-slate-300">
                  <FileText className="mr-1 inline-block size-4" />
                  Reference (optional)
                </span>
                <input
                  type="text"
                  value={values.reference}
                  onChange={(e) =>
                    setValues((current) => ({
                      ...current,
                      reference: e.target.value,
                    }))
                  }
                  placeholder="Bank transfer reference"
                  className="h-11 w-full rounded-xl border border-slate-200 bg-white px-3 text-sm shadow-sm ring-0 transition outline-none focus:border-emerald-500 dark:border-slate-800 dark:bg-slate-950"
                />
              </label>
            </>
          )}

          {/* Cash Specific Fields */}
          {activeTab === "cash" && (
            <label className="space-y-2">
              <span className="text-sm font-medium text-slate-700 dark:text-slate-300">
                <FileText className="mr-1 inline-block size-4" />
                Notes (optional)
              </span>
              <textarea
                value={values.notes}
                onChange={(e) =>
                  setValues((current) => ({
                    ...current,
                    notes: e.target.value,
                  }))
                }
                placeholder="Any additional notes about this cash payment"
                rows={2}
                className="w-full rounded-xl border border-slate-200 bg-white px-3 py-2 text-sm shadow-sm ring-0 transition outline-none focus:border-emerald-500 dark:border-slate-800 dark:bg-slate-950"
              />
            </label>
          )}

          {/* Error Display */}
          {error && (
            <div className="rounded-xl border border-rose-200 bg-rose-50 px-3 py-2 text-sm text-rose-700 dark:border-rose-900/70 dark:bg-rose-950/30 dark:text-rose-200">
              {error}
            </div>
          )}

          {/* Submit Button */}
          <div className="flex justify-end gap-2 border-t border-slate-200 pt-4 dark:border-slate-800">
            <Button type="submit" size="lg" disabled={submitting}>
              {submitting
                ? "Recording..."
                : `Record ${activeTab === "bank" ? "Bank Transfer" : "Cash"} Payment`}
            </Button>
          </div>
        </form>
      </CardContent>
    </Card>
  )
}
