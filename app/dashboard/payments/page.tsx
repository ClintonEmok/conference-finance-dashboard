"use client"

import { useCallback, useEffect, useState } from "react"
import {
  Wallet,
  Plus,
  RefreshCw,
  AlertCircle,
  HelpCircle,
  CheckCircle2,
  CircleAlert,
} from "lucide-react"

import { PaymentList } from "@/components/payments/payment-list"
import { AssignDialog } from "@/components/payments/assign-dialog"
import { ManualPaymentEntryForm } from "@/components/payments/manual-entry-form"

import { Button } from "@/components/ui/button"
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card"

type PaymentSource = "tikkie" | "bank_transfer" | "cash"
type PaymentMatchStatus =
  | "unassigned"
  | "ambiguous"
  | "manual_assignment"
  | "auto_matched"

type PaymentSummary = {
  summary: {
    unassigned: number
    partial: number
    paid: number
    overpaid: number
    totalOrders: number
  }
}

type Payment = {
  id: string
  source: PaymentSource
  payerName: string
  payerAccountNumber: string | null
  amountMinor: number
  paidAt: string
  status: PaymentMatchStatus
}

type TikkieSyncFeedback = {
  status: "success" | "partial" | "failed"
  linksScanned: number
  paymentsFetched: number
  newPayments: number
  existingPayments: number
  updatedPayments: number
  skippedInvalid: number
  matched: number
  ambiguous: number
  errors: string[]
}

export default function PaymentsPage() {
  const [summary, setSummary] = useState<PaymentSummary | null>(null)
  const [isLoading, setIsLoading] = useState(true)
  const [showEntryForm, setShowEntryForm] = useState(false)
  const [assignDialogOpen, setAssignDialogOpen] = useState(false)
  const [selectedPayment, setSelectedPayment] = useState<Payment | null>(null)
  const [isSyncing, setIsSyncing] = useState(false)
  const [refreshKey, setRefreshKey] = useState(0)
  const [syncFeedback, setSyncFeedback] = useState<TikkieSyncFeedback | null>(null)
  const [toastMessage, setToastMessage] = useState<{
    tone: "success" | "warning" | "danger"
    text: string
  } | null>(null)

  const loadSummary = useCallback(async () => {
    setIsLoading(true)
    try {
      const response = await fetch("/api/reconciliation")
      if (response.ok) {
        const data = await response.json()
        setSummary(data)
      }
    } catch (error) {
      console.error("Failed to load payment summary:", error)
    } finally {
      setIsLoading(false)
    }
  }, [])

  useEffect(() => {
    loadSummary()
  }, [loadSummary, refreshKey])

  useEffect(() => {
    if (!toastMessage) return
    const timeout = window.setTimeout(() => setToastMessage(null), 4000)
    return () => window.clearTimeout(timeout)
  }, [toastMessage])

  async function handleSyncTikkie() {
    setIsSyncing(true)
    try {
      const response = await fetch("/api/payments/tikkie/sync", { method: "POST" })
      const body = await response.json().catch(() => null)

      if (!response.ok) {
        const message = body?.error?.message ?? `Tikkie sync failed (${response.status}).`
        setToastMessage({ tone: "danger", text: message })
        return
      }

      const feedback: TikkieSyncFeedback = {
        status: body?.status === "partial" ? "partial" : "success",
        linksScanned: body?.linksScanned ?? 0,
        paymentsFetched: body?.paymentsFetched ?? 0,
        newPayments: body?.newPayments ?? 0,
        existingPayments: body?.existingPayments ?? 0,
        updatedPayments: body?.updatedPayments ?? 0,
        skippedInvalid: body?.skippedInvalid ?? 0,
        matched: body?.matched ?? 0,
        ambiguous: body?.ambiguous ?? 0,
        errors: Array.isArray(body?.errors) ? body.errors : [],
      }

      setSyncFeedback(feedback)
      setRefreshKey((prev) => prev + 1)
      setToastMessage({
        tone: feedback.status === "partial" ? "warning" : "success",
        text: feedback.status === "partial" ? "Sync completed with warnings." : `Sync complete. ${feedback.newPayments} new payments.`,
      })
    } catch (error) {
      setToastMessage({ tone: "danger", text: "Network error while syncing Tikkie." })
    } finally {
      setIsSyncing(false)
    }
  }

  return (
    <div className="space-y-8 animate-in fade-in duration-500">
      <header className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between px-1">
        <div>
          <h1 className="text-3xl font-bold tracking-tight text-foreground">Payments</h1>
          <p className="text-muted-foreground mt-1">Manage Tikkie links, bank transfers, and manual assignments.</p>
        </div>
        <div className="flex items-center gap-3">
          <Button
            variant="outline"
            onClick={() => setShowEntryForm(!showEntryForm)}
            className="rounded-2xl h-11 px-5 shadow-sm active:scale-95 transition-all"
          >
            <Plus className="mr-2 size-4" />
            Add Payment
          </Button>
          <Button
            onClick={handleSyncTikkie}
            disabled={isSyncing}
            className="rounded-2xl h-11 px-6 bg-[linear-gradient(135deg,#7154ff,#5238aa)] text-white shadow-lg shadow-primary/20 transition-all hover:opacity-90 active:scale-95"
          >
            <RefreshCw className={`mr-2 size-4 ${isSyncing ? "animate-spin" : ""}`} />
            {isSyncing ? "Syncing..." : "Sync Tikkie"}
          </Button>
        </div>
      </header>

      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        {[
          { label: "Unpaid", value: summary?.summary.unassigned ?? 0, icon: AlertCircle, color: "text-yellow-500", bg: "bg-yellow-500/10", detail: "Missing link" },
          { label: "Partial", value: summary?.summary.partial ?? 0, icon: HelpCircle, color: "text-orange-500", bg: "bg-orange-500/10", detail: "Incomplete" },
          { label: "Fully Paid", value: summary?.summary.paid ?? 0, icon: CheckCircle2, color: "text-emerald-500", bg: "bg-emerald-500/10", detail: "Settled" },
          { label: "Overpaid", value: summary?.summary.overpaid ?? 0, icon: CircleAlert, color: "text-purple-500", bg: "bg-purple-500/10", detail: "Excess" },
        ].map((stat) => (
          <article key={stat.label} className="group rounded-xl border border-border/50 bg-card/40 backdrop-blur-xl p-6 transition-all hover:border-primary/20">
            <div className="flex items-start justify-between">
              <div>
                <p className="text-[10px] font-bold uppercase tracking-wider text-muted-foreground/60">{stat.label}</p>
                <p className="mt-2 text-3xl font-bold text-foreground">{isLoading ? "--" : stat.value}</p>
                <p className="mt-1 text-[10px] font-medium text-muted-foreground/50">{stat.detail}</p>
              </div>
              <div className={`flex size-10 items-center justify-center rounded-lg ${stat.bg} ${stat.color}`}>
                <stat.icon className="size-5" />
              </div>
            </div>
          </article>
        ))}
      </div>

      {syncFeedback && (
        <article className={`rounded-xl border p-6 animate-in slide-in-from-top-4 ${syncFeedback.status === "failed" ? "border-destructive/30 bg-destructive/5 text-destructive" :
            syncFeedback.status === "partial" ? "border-yellow-300/30 bg-yellow-50/5 text-yellow-600" :
              "border-emerald-300/30 bg-emerald-50/5 text-emerald-600"
          }`}>
          <div className="flex items-center gap-3 mb-2">
            <RefreshCw className="size-4" />
            <p className="font-bold text-sm">Sync Feedback</p>
          </div>
          <p className="text-xs leading-relaxed opacity-80">
            Links: {syncFeedback.linksScanned} • Fetched: {syncFeedback.paymentsFetched} • New: {syncFeedback.newPayments} •
            Existing: {syncFeedback.existingPayments} • Updated: {syncFeedback.updatedPayments} • Matched: {syncFeedback.matched}
          </p>
        </article>
      )}

      {showEntryForm && (
        <article className="rounded-xl border border-border/50 bg-card/40 backdrop-blur-xl overflow-hidden animate-in zoom-in-95 duration-300">
          <div className="p-8 border-b border-border/30">
            <h2 className="text-xl font-bold">Record Manual Payment</h2>
            <p className="text-sm text-muted-foreground">Enter bank transfer or cash payment details</p>
          </div>
          <div className="p-8">
            <ManualPaymentEntryForm onSuccess={() => { setShowEntryForm(false); setRefreshKey(prev => prev + 1); }} />
          </div>
        </article>
      )}

      <article className="rounded-xl border border-border/50 bg-card/40 backdrop-blur-xl overflow-hidden">
        <div className="p-8 border-b border-border/30 flex items-center justify-between">
          <div>
            <h2 className="text-xl font-bold">Payment History</h2>
            <p className="text-sm text-muted-foreground">Detailed list of all transactions and assignments</p>
          </div>
          <Wallet className="size-6 text-primary/40" />
        </div>
        <div className="p-6">
          <PaymentList onAssign={(p) => { setSelectedPayment(p); setAssignDialogOpen(true); }} refreshKey={refreshKey} />
        </div>
      </article>

      {selectedPayment && (
        <AssignDialog
          payment={selectedPayment}
          open={assignDialogOpen}
          onOpenChange={setAssignDialogOpen}
          onAssigned={() => setRefreshKey(prev => prev + 1)}
        />
      )}

      {toastMessage && (
        <div className={`fixed right-6 bottom-6 z-50 rounded-2xl border px-6 py-3 text-sm font-bold shadow-2xl animate-in slide-in-from-right-10 ${toastMessage.tone === "danger" ? "border-destructive/30 bg-destructive text-white" :
            toastMessage.tone === "warning" ? "border-yellow-400 bg-yellow-400 text-yellow-950" :
              "border-primary bg-primary text-white"
          }`}>
          {toastMessage.text}
        </div>
      )}
    </div>
  )
}
