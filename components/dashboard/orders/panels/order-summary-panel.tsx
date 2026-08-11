"use client"

import Link from "next/link"
import {
  AlertCircle,
  ArrowLeft,
  Clock,
  Receipt,
  ShieldCheck,
  Users,
  Zap,
} from "lucide-react"

import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
} from "@/components/ui/card"
import { formatMoney } from "@/lib/format"
import { cn } from "@/lib/utils"
import type { ReactNode } from "react"

export type OrderSummaryOrder = {
  id: string
  normalizedStatus: "paid" | "refunded" | "cancelled" | "pending" | null
  isArchived?: boolean
}

export type OrderSummaryMetrics = {
  amountDueMinor: number | null
  paidAmountMinor: number | null
  outstandingAmountMinor: number | null
  donationAmountMinor: number | null
  coverage: number | null
  hasKnownDue: boolean
  attendeeCount: number
  sharedOutstandingPerAttendeeMinor: number | null
}

type OrderSummaryPanelProps = {
  order: OrderSummaryOrder
  eventTitle: string
  slug: string
  metrics: OrderSummaryMetrics
  hasAssignedPayments: boolean
  canDeleteOrder: boolean
  isRemoving: boolean
  removeErrorMessage: string | null
  onRemoveOrder: () => void
  actions: ReactNode
}

function statusBadgeVariant(status: string | null) {
  if (status === "cancelled") return "destructive" as const
  if (status === "refunded") return "outline" as const
  return "secondary" as const
}

export function OrderSummaryPanel({
  order,
  eventTitle,
  slug,
  metrics,
  hasAssignedPayments,
  canDeleteOrder,
  isRemoving,
  removeErrorMessage,
  onRemoveOrder,
  actions,
}: OrderSummaryPanelProps) {
  return (
    <Card className="border-white/40 bg-white/40 shadow-sm backdrop-blur dark:border-white/10 dark:bg-black/20">
      <CardHeader className="pb-8">
        <div className="flex flex-col gap-6 lg:flex-row lg:items-center lg:justify-between">
          <div className="space-y-2">
            <div className="flex items-center gap-3">
              <span className="rounded-lg bg-primary/10 px-3 py-1 font-mono text-xl font-bold tracking-tight text-primary">
                {order.id}
              </span>
              <Badge
                variant={statusBadgeVariant(order.normalizedStatus ?? null)}
                className="rounded-full px-3 py-0.5 text-[10px] font-bold tracking-widest uppercase"
              >
                {order.normalizedStatus ?? "pending"}
              </Badge>
              <Badge variant="outline" className="font-mono text-[10px] uppercase">
                {slug}
              </Badge>
            </div>
            <CardDescription className="text-sm font-medium">
              {eventTitle} · /dashboard/events/{slug}/orders/{order.id}
            </CardDescription>
          </div>

          {order.normalizedStatus === "cancelled" || order.isArchived ? (
            <div className="flex items-center gap-4 rounded-xl border border-amber-500/20 bg-amber-500/5 p-4">
              <div className="space-y-1">
                <p className="text-xs font-bold tracking-widest text-amber-700 uppercase dark:text-amber-400">
                  {hasAssignedPayments ? "Removal blocked" : "Order archived"}
                </p>
                <p className="text-[10px] text-amber-600/70">
                  {hasAssignedPayments
                    ? "Attached payments will be unassigned automatically."
                    : "This order can be permanently deleted."}
                </p>
              </div>
              {canDeleteOrder && (
                <Button
                  variant="destructive"
                  size="sm"
                  onClick={onRemoveOrder}
                  disabled={isRemoving}
                  className="h-8 rounded-lg px-3 text-[10px] font-bold tracking-wider uppercase"
                >
                  {isRemoving ? "Deleting..." : "Delete Order"}
                </Button>
              )}
            </div>
          ) : null}
        </div>

        {actions}
      </CardHeader>

      <CardContent className="min-w-0">
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-5">
          {[
            {
              label: "Amount Due",
              value:
                metrics.hasKnownDue && metrics.amountDueMinor !== null
                  ? formatMoney(metrics.amountDueMinor)
                  : "Unavailable",
              icon: Receipt,
              color: "text-foreground",
            },
            {
              label: "Paid Amount",
              value:
                typeof metrics.paidAmountMinor === "number"
                  ? formatMoney(metrics.paidAmountMinor)
                  : "Unavailable",
              icon: ShieldCheck,
              color: "text-emerald-600 dark:text-emerald-400",
            },
            {
              label: "Outstanding",
              value:
                metrics.hasKnownDue && metrics.outstandingAmountMinor !== null
                  ? formatMoney(metrics.outstandingAmountMinor)
                  : "Unavailable",
              icon: Clock,
              color: "text-rose-600 dark:text-rose-400",
            },
            {
              label: "Donation",
              value:
                metrics.donationAmountMinor !== null
                  ? formatMoney(metrics.donationAmountMinor)
                  : "Unavailable",
              icon: AlertCircle,
              color: "text-amber-600 dark:text-amber-300",
            },
            {
              label: "Coverage",
              value: metrics.coverage === null ? "N/A" : `${metrics.coverage}%`,
              icon: Zap,
              color: "text-primary",
            },
          ].map((item, i) => (
            <article
              key={i}
              className="min-w-0 rounded-2xl border border-white/60 bg-white/50 p-4 transition-all hover:bg-white/80 dark:border-white/5 dark:bg-white/5 dark:hover:bg-white/10"
            >
              <p className="mb-3 px-1 text-[10px] font-black tracking-[0.2em] text-muted-foreground uppercase">
                {item.label}
              </p>
              <div className="flex items-center justify-between">
                <span className={cn("text-2xl font-black tracking-tight", item.color)}>
                  {item.value}
                </span>
                <item.icon aria-hidden="true" className={cn("size-5 opacity-20", item.color)} />
              </div>
            </article>
          ))}
        </div>

        <div className="mt-6 flex items-center gap-3 rounded-xl border border-primary/10 bg-primary/5 p-4">
          <Users className="size-4 text-primary" />
          <p className="text-xs font-medium text-muted-foreground">
            {metrics.attendeeCount > 1
              ? metrics.sharedOutstandingPerAttendeeMinor !== null
                ? `${metrics.attendeeCount} attendee${metrics.attendeeCount === 1 ? "" : "s"}. Outstanding averages ${formatMoney(metrics.sharedOutstandingPerAttendeeMinor)} per ticket.`
                : `${metrics.attendeeCount} attendee${metrics.attendeeCount === 1 ? "" : "s"}. Outstanding average is unavailable.`
              : "Direct progress mapping for a single attendee order."}
          </p>
        </div>

        {removeErrorMessage && (
          <p
            role="alert"
            aria-live="assertive"
            className="mt-4 flex items-center gap-3 rounded-xl border border-destructive/20 bg-destructive/5 p-4 text-sm text-destructive"
          >
            <AlertCircle className="size-4" />
            {removeErrorMessage}
          </p>
        )}

        <Button asChild variant="ghost" className="mt-6 w-fit px-0 text-muted-foreground hover:text-foreground">
          <Link href={`/dashboard/events/${slug}/orders`}>
            <ArrowLeft className="mr-2 size-4" /> Back to orders
          </Link>
        </Button>
      </CardContent>
    </Card>
  )
}
