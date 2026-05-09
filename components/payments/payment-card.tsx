"use client"

import { Badge } from "@/components/ui/badge"
import { formatMoney } from "@/lib/format"
import type { Doc } from "@/convex/_generated/dataModel"

type PaymentCardProps = {
  payment: Doc<"payments">
  orderLink?: string
  actions?: React.ReactNode
}

function paymentStatusLabel(status: Doc<"payments">["status"]) {
  if (!status) return "Unknown"
  return status.replace(/_/g, " ")
}

function paymentStatusVariant(status: Doc<"payments">["status"]) {
  if (status === "ambiguous") return "destructive" as const
  if (status === "unassigned") return "outline" as const
  if (status === "donation") return "default" as const
  return "secondary" as const
}

function sourceLabel(source: Doc<"payments">["source"]) {
  if (source === "bank_transfer") return "Bank transfer"
  if (source === "cash") return "Cash"
  return "Tikkie"
}

function formatDateTime(value: number) {
  return new Date(value).toLocaleString("en-GB", {
    day: "2-digit",
    month: "short",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  })
}

export function PaymentCard({ payment, orderLink, actions }: PaymentCardProps) {
  return (
    <article className="rounded-2xl border border-border/50 bg-background/60 p-4">
      <div className="flex items-start justify-between gap-4">
        <div className="min-w-0 space-y-1">
          <p className="truncate text-sm font-bold text-foreground">{payment.payerName}</p>
          <p className="text-xs text-muted-foreground">
            {sourceLabel(payment.source)} · {formatDateTime(payment.paidAt)}
          </p>
          {orderLink && <p className="text-xs text-muted-foreground">Order {orderLink}</p>}
        </div>
        <div className="text-right">
          <p className="text-sm font-black tabular-nums text-foreground">{formatMoney(payment.amountMinor)}</p>
          <Badge
            variant={paymentStatusVariant(payment.status)}
            className="mt-1 h-4 px-1.5 text-[9px] font-black uppercase tracking-widest"
          >
            {paymentStatusLabel(payment.status)}
          </Badge>
        </div>
      </div>
      {actions && <div className="mt-3 flex flex-wrap items-center gap-2">{actions}</div>}
    </article>
  )
}