"use client"

import {
  AlertCircle,
  CreditCard,
  Link2Off,
  Loader2,
  Plus,
} from "lucide-react"

import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card"
import { formatMoney } from "@/lib/format"

export type PaymentStatus =
  | "auto_matched"
  | "manual_assignment"
  | "ambiguous"
  | "unassigned"
  | "donation"
  | null

export type OrderPaymentRow = {
  id: string
  source: "tikkie" | "bank_transfer" | "cash"
  payerName: string
  amountMinor: number
  paidAt: string
  status: PaymentStatus
  donationKind: "overpayment" | "standalone" | null
  orderId: string | null
  reference: string | null
  notes: string | null
}

type PaymentsPanelProps = {
  payments: OrderPaymentRow[]
  hasKnownDue: boolean
  isUnassigningId: string | null
  unassignError: string | null
  onOpenAssignSheet: () => void
  onUnassign: (paymentId: string) => void
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

function paymentSourceLabel(source: OrderPaymentRow["source"]) {
  if (source === "bank_transfer") return "Bank transfer"
  if (source === "cash") return "Cash"
  return "Tikkie"
}

function paymentStatusLabel(status: PaymentStatus) {
  if (!status) return "-"
  return status.replace(/_/g, " ")
}

function paymentStatusVariant(status: PaymentStatus) {
  if (status === "unassigned") return "outline" as const
  if (status === "ambiguous") return "destructive" as const
  return "secondary" as const
}

export function PaymentsPanel({
  payments,
  hasKnownDue,
  isUnassigningId,
  unassignError,
  onOpenAssignSheet,
  onUnassign,
}: PaymentsPanelProps) {
  return (
    <Card className="border-white/40 bg-white/40 shadow-sm backdrop-blur lg:col-span-2 dark:border-white/10 dark:bg-black/20">
      <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-4">
        <div className="space-y-1">
          <CardTitle className="text-lg font-bold">Assigned Payments</CardTitle>
          <CardDescription>Matched to this order ID</CardDescription>
        </div>
        <Button
          variant="outline"
          size="sm"
          onClick={onOpenAssignSheet}
          disabled={!hasKnownDue}
          aria-label={hasKnownDue ? "Assign a payment to this order" : "Assign payment unavailable until the amount due is known"}
          className="h-8 rounded-lg border-white/20 text-[11px] font-bold uppercase transition-all hover:bg-white/10"
        >
          <Plus className="mr-2 size-3" /> Assign
        </Button>
      </CardHeader>
      <CardContent>
        {unassignError && (
          <p role="alert" aria-live="assertive" className="mb-4 rounded-xl border border-destructive/20 bg-destructive/5 p-4 text-sm text-destructive">
            {unassignError}
          </p>
        )}

        {payments.length === 0 ? (
          <div className="rounded-2xl border border-dashed border-white/20 py-12 text-center">
            <CreditCard className="mx-auto mb-3 size-10 opacity-10" />
            <p className="text-sm font-bold tracking-widest uppercase opacity-40">No payments</p>
          </div>
        ) : (
          <div className="space-y-3">
            {payments.map((payment) => (
              <article
                key={payment.id}
                className="group relative rounded-2xl border border-white/60 bg-white/60 p-4 transition-all hover:bg-white/80 dark:border-white/5 dark:bg-white/5 dark:hover:bg-white/10"
              >
                <div className="flex items-start justify-between">
                  <div className="max-w-[60%] space-y-1">
                    <p className="truncate text-sm font-bold tracking-tight">
                      {payment.payerName}
                    </p>
                    <div className="flex items-center gap-2 text-[10px] font-medium text-muted-foreground/60">
                      <span className="truncate">{paymentSourceLabel(payment.source)}</span>
                      <span>•</span>
                      <span className="shrink-0">{formatDateTime(payment.paidAt)}</span>
                    </div>
                  </div>
                  <div className="space-y-1 text-right">
                    <p className="text-sm font-black text-foreground tabular-nums">
                      {formatMoney(payment.amountMinor)}
                    </p>
                    <Badge
                      variant={paymentStatusVariant(payment.status)}
                      className="h-4 px-1.5 text-[9px] font-black tracking-widest uppercase"
                    >
                      {paymentStatusLabel(payment.status)}
                    </Badge>
                  </div>
                </div>
                <div className="mt-3 grid gap-2 text-[10px] text-muted-foreground sm:grid-cols-3">
                  <div className="rounded-xl bg-black/5 px-2.5 py-2 dark:bg-white/5">
                    <p className="font-black tracking-[0.2em] uppercase opacity-60">Source</p>
                    <p className="mt-1 font-medium text-foreground">{paymentSourceLabel(payment.source)}</p>
                  </div>
                  <div className="rounded-xl bg-black/5 px-2.5 py-2 dark:bg-white/5">
                    <p className="font-black tracking-[0.2em] uppercase opacity-60">Paid at</p>
                    <p className="mt-1 font-medium text-foreground">{formatDateTime(payment.paidAt)}</p>
                  </div>
                  <div className="rounded-xl bg-black/5 px-2.5 py-2 dark:bg-white/5">
                    <p className="font-black tracking-[0.2em] uppercase opacity-60">Status</p>
                    <p className="mt-1 font-medium text-foreground">{paymentStatusLabel(payment.status)}</p>
                  </div>
                </div>
                <div className="absolute top-2 right-2">
                  <Button
                    variant="destructive"
                    size="icon"
                    className="size-7 rounded-full shadow-md"
                    aria-label={`Unlink payment from ${payment.payerName}`}
                    onClick={() => onUnassign(payment.id)}
                    disabled={isUnassigningId === payment.id}
                  >
                    {isUnassigningId === payment.id ? (
                      <Loader2 className="size-3.5 animate-spin" />
                    ) : (
                      <Link2Off className="size-3.5" />
                    )}
                  </Button>
                </div>
                {(payment.reference || payment.notes) && (
                  <p className="mt-3 border-t border-white/10 pt-2 text-[10px] text-muted-foreground/50 italic">
                    {[payment.reference, payment.notes]
                      .filter((value): value is string => Boolean(value && value.trim()))
                      .join(" — ")}
                  </p>
                )}
              </article>
            ))}
          </div>
        )}
      </CardContent>
    </Card>
  )
}
