"use client"

import Link from "next/link"
import { useSearchParams } from "next/navigation"
import { useEffect, useMemo, useState, useCallback } from "react"
import {
  BedDouble,
  ChevronRight,
  CreditCard,
  FileText,
  Flag,
  Mail,
  MapPin,
  ReceiptText,
  Tag,
  UserRound,
  Utensils,
  Users,
  Calendar,
  Clock,
  ArrowLeft,
  ExternalLink,
  ShieldCheck,
  Zap,
  CheckCircle2,
  XCircle,
  Layers,
} from "lucide-react"

import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { Skeleton } from "@/components/ui/skeleton"
import { cn } from "@/lib/utils"

type AttendeeDetailPayload = {
  attendee: {
    id: string
    name: string | null
    email: string | null
    ticketTypeLabel: string | null
    ticketStatus: string | null
    checkedInAt: string | null
    providerIssuedTicketId: string | null
    providerOrderId: string
    providerEventId: string
  }
  event: {
    id: string
    name: string | null
  }
  order: {
    id: string
    providerOrderId: string
    providerEventId: string
    buyerName: string | null
    buyerEmail: string | null
    normalizedStatus: "paid" | "refunded" | "cancelled" | "pending"
    orderedAt: string | null
    totalAmountMinor: number
  }
  finance: {
    outstandingAmountMinor: number
    paidAmountMinor: number
    overpaidAmountMinor: number
    installmentProgress: {
      totalLinks: number
      paidLinks: number
      openLinks: number
      expiredLinks: number
    }
  }
  paymentHistory: Array<{
    id: string
    type: "payment-link" | "status-transition" | "assigned-payment"
    title: string
    status: string
    amountMinor: number | null
    happenedAt: string
    note: string | null
    url: string | null
  }>
  roomStatus:
    | {
        status: "assigned"
        roomLabel: string
        hotelName: string
        roomTypeLabel: string
      }
    | {
        status: "unassigned"
        roomLabel: null
        hotelName: null
        roomTypeLabel: null
      }
  signals: {
    genderType: "MALE" | "FEMALE" | "MIXED" | "UNKNOWN" | null
    location: string | null
    remarks: string | null
    dietary: string | null
    roommatePreference: string | null
    allocationPriority: "CRITICAL" | "HIGH" | "NORMAL" | "LOW"
    priorityReason: string | null
    ageGroup: string | null
    ticketCategory: string | null
  }
}

type GenderType = "MALE" | "FEMALE" | "MIXED" | "UNKNOWN"

import { formatMoney } from "@/lib/format"

function formatStatus(status: string | null) {
  if (!status) return "-"
  return status.replace(/[-_]/g, " ")
}

export default function AttendeeDetailPage({
  params,
}: {
  params: Promise<{ attendeeId: string }>
}) {
  const searchParams = useSearchParams()
  const [attendeeId, setAttendeeId] = useState<string | null>(null)
  const [payload, setPayload] = useState<AttendeeDetailPayload | null>(null)
  const [errorMessage, setErrorMessage] = useState<string | null>(null)
  const [isLoading, setIsLoading] = useState(true)
  const [selectedGender, setSelectedGender] = useState<"" | GenderType>("")
  const [isSavingGender, setIsSavingGender] = useState(false)

  const attendeeSearch = searchParams.get("search")
  const eventId = searchParams.get("eventId")

  const loadAttendeeDetail = useCallback(
    async (targetId: string, silent = false) => {
      if (!silent) setIsLoading(true)
      try {
        const res = await fetch(`/api/dashboard/attendees/${targetId}`)
        if (!res.ok) throw new Error("Failed to load")
        const data = await res.json()
        setPayload(data)
        setSelectedGender(data.signals.genderType ?? "")
      } catch {
        setErrorMessage("Failed to load attendee information.")
      } finally {
        setIsLoading(false)
      }
    },
    []
  )

  useEffect(() => {
    params.then((p) => {
      setAttendeeId(p.attendeeId)
      loadAttendeeDetail(p.attendeeId)
    })
  }, [params, loadAttendeeDetail])

  const handleSaveGender = async () => {
    if (!attendeeId) return
    setIsSavingGender(true)
    try {
      const res = await fetch(`/api/dashboard/attendees/${attendeeId}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ genderType: selectedGender || null }),
      })
      if (!res.ok) throw new Error()
      loadAttendeeDetail(attendeeId, true)
    } finally {
      setIsSavingGender(false)
    }
  }

  if (isLoading) {
    return (
      <div className="animate-pulse space-y-8 p-1">
        <Skeleton className="h-32 w-full rounded-3xl" />
        <div className="grid gap-6 lg:grid-cols-3">
          <Skeleton className="h-96 rounded-3xl lg:col-span-2" />
          <Skeleton className="h-96 rounded-3xl" />
        </div>
      </div>
    )
  }

  if (!payload)
    return (
      <div className="p-8 text-center text-muted-foreground">
        {errorMessage || "Attendee not found."}
      </div>
    )

  const initials = payload.attendee.name
    ?.split(" ")
    .map((n) => n[0])
    .join("")
    .toUpperCase()
    .slice(0, 2)
  const paymentProgress =
    Math.round(
      (payload.finance.paidAmountMinor / payload.order.totalAmountMinor) * 100
    ) || 0

  return (
    <div className="animate-in space-y-8 pb-12 duration-700 fade-in slide-in-from-bottom-4">
      {/* Premium Header */}
      <header className="relative overflow-hidden rounded-xl border border-border/50 bg-card/40 p-8 shadow-2xl backdrop-blur-xl">
        <div className="absolute -top-20 -right-20 size-64 rounded-full bg-primary/5 blur-3xl" />
        <div className="flex flex-col gap-8 lg:flex-row lg:items-center">
          <div className="relative">
            <div className="flex size-32 items-center justify-center rounded-xl border border-primary/20 bg-gradient-to-br from-primary/20 to-primary/5 text-4xl font-bold text-primary shadow-inner">
              {initials}
            </div>
            <div
              className={cn(
                "absolute -right-1 -bottom-1 flex size-8 items-center justify-center rounded-full border-4 border-card",
                payload.attendee.ticketStatus === "checked_in"
                  ? "bg-emerald-500"
                  : "bg-orange-500"
              )}
            >
              {payload.attendee.ticketStatus === "checked_in" ? (
                <ShieldCheck className="size-4 text-white" />
              ) : (
                <Clock className="size-4 text-white" />
              )}
            </div>
          </div>

          <div className="flex-1 space-y-4">
            <div className="flex flex-wrap items-center gap-2">
              <Link
                href="/dashboard/attendees"
                className="group flex items-center text-[10px] font-bold tracking-widest text-muted-foreground uppercase transition-colors hover:text-primary"
              >
                <ArrowLeft className="mr-2 size-3 transition-transform group-hover:-translate-x-1" />{" "}
                Directory
              </Link>
              <ChevronRight className="size-3 text-muted-foreground/30" />
              <span className="text-[10px] font-bold tracking-widest text-primary/70 uppercase">
                Attendee Detail
              </span>
            </div>

            <div>
              <h1 className="text-4xl font-extrabold tracking-tight text-foreground lg:text-5xl">
                {payload.attendee.name}
              </h1>
              <div className="mt-3 flex flex-wrap items-center gap-3">
                <Badge
                  variant="outline"
                  className="h-7 rounded-xl border-primary/20 bg-primary/5 px-3 text-[9px] font-bold tracking-wider text-primary uppercase"
                >
                  {payload.attendee.ticketTypeLabel}
                </Badge>
                <div className="flex items-center gap-2 text-sm font-medium text-muted-foreground">
                  <Mail className="size-4 text-primary/50" />
                  {payload.attendee.email}
                </div>
              </div>
            </div>
          </div>

          <div className="flex flex-wrap gap-3">
            <Button
              asChild
              variant="outline"
              className="h-12 rounded-2xl px-6 shadow-sm transition-all hover:bg-primary/5 active:scale-95"
            >
              <Link
                href={`/dashboard/orders/${payload.order.providerOrderId}?eventId=${payload.order.providerEventId}`}
              >
                <CreditCard className="mr-2 size-4 text-primary" /> Order Detail
              </Link>
            </Button>
            <Button
              asChild
              className="h-12 rounded-2xl bg-primary px-8 text-white shadow-lg shadow-primary/20 transition-all active:scale-95"
            >
              <Link
                href={`/dashboard/accommodation?attendeeId=${payload.attendee.id}&search=${encodeURIComponent(payload.attendee.name || "")}`}
              >
                <BedDouble className="mr-2 size-4" /> Room Placement
              </Link>
            </Button>
          </div>
        </div>
      </header>

      <div className="grid gap-8 lg:grid-cols-3">
        {/* Left Column: Finance & History */}
        <div className="space-y-8 lg:col-span-2">
          {/* Finance Insights */}
          <article className="rounded-xl border border-border/50 bg-card/40 p-8 shadow-sm backdrop-blur-xl">
            <div className="mb-8 flex items-center justify-between">
              <div>
                <h3 className="text-xl font-bold text-foreground">
                  Order Ledger
                </h3>
              </div>
              <div className="flex size-10 items-center justify-center rounded-2xl bg-primary/10 text-primary">
                <Zap className="size-5" />
              </div>
            </div>

            <div className="mb-8 grid gap-6 sm:grid-cols-3">
              <div className="rounded-lg border border-border/30 bg-background/40 p-5">
                <p className="text-[10px] font-bold tracking-widest text-muted-foreground uppercase">
                  Total Due
                </p>
                <p className="mt-1 text-2xl font-bold text-foreground">
                  {formatMoney(payload.order.totalAmountMinor)}
                </p>
              </div>
              <div className="rounded-lg border border-emerald-500/10 bg-emerald-500/5 p-5">
                <p className="text-[10px] font-bold tracking-widest text-emerald-600/70 uppercase">
                  Amount Paid
                </p>
                <p className="mt-1 text-2xl font-bold text-emerald-600">
                  {formatMoney(payload.finance.paidAmountMinor)}
                </p>
              </div>
              <div className="rounded-lg border border-orange-500/10 bg-orange-500/5 p-5">
                <p className="text-[10px] font-bold tracking-widest text-orange-600/70 uppercase">
                  Outstanding
                </p>
                <p className="mt-1 text-2xl font-bold text-orange-600">
                  {formatMoney(payload.finance.outstandingAmountMinor)}
                </p>
              </div>
            </div>

            <div className="space-y-4">
              <div className="flex items-center justify-between">
                <span className="text-sm font-bold text-foreground">
                  Settlement Progress
                </span>
                <span className="text-sm font-black text-primary">
                  {paymentProgress}%
                </span>
              </div>
              <div className="h-3 overflow-hidden rounded-full bg-muted/50">
                <div
                  className="h-full bg-gradient-to-r from-primary to-emerald-500 transition-all duration-1000"
                  style={{ width: `${paymentProgress}%` }}
                />
              </div>
            </div>
          </article>

          {/* Activity Ledger */}
          <article className="overflow-hidden rounded-xl border border-border/50 bg-card/40 shadow-sm backdrop-blur-xl">
            <div className="p-8 pb-4">
              <h3 className="text-xl font-bold text-foreground">
                Activity Ledger
              </h3>
              <p className="mt-0.5 text-xs font-medium text-muted-foreground">
                Timeline of payments and status updates
              </p>
            </div>
            <div className="overflow-x-auto">
              <table className="w-full text-left">
                <thead className="border-y border-border/20 bg-muted/30">
                  <tr>
                    <th className="px-8 py-3 text-[10px] font-bold tracking-widest text-muted-foreground/70 uppercase">
                      Event
                    </th>
                    <th className="px-8 py-3 text-[10px] font-bold tracking-widest text-muted-foreground/70 uppercase">
                      Date
                    </th>
                    <th className="px-8 py-3 text-right text-[10px] font-bold tracking-widest text-muted-foreground/70 uppercase">
                      Amount
                    </th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-border/10">
                  {payload.paymentHistory.map((item) => (
                    <tr
                      key={item.id}
                      className="transition-colors hover:bg-muted/20"
                    >
                      <td className="px-8 py-5">
                        <p className="text-sm font-bold text-foreground">
                          {item.title}
                        </p>
                        <div className="mt-1 flex items-center gap-2">
                          <Badge
                            variant="outline"
                            className="h-5 rounded-lg border-primary/20 px-1.5 text-[9px] font-bold text-primary/70"
                          >
                            {item.type.replace("-", " ")}
                          </Badge>
                          {item.url && (
                            <a
                              href={item.url}
                              target="_blank"
                              className="flex items-center gap-1 text-[10px] font-bold tracking-tighter text-primary uppercase hover:underline"
                            >
                              <ExternalLink className="size-2.5" /> View Tikkie
                            </a>
                          )}
                        </div>
                      </td>
                      <td className="px-8 py-5 text-xs font-medium text-muted-foreground">
                        {new Date(item.happenedAt).toLocaleDateString("en-GB", {
                          day: "2-digit",
                          month: "short",
                          year: "numeric",
                        })}
                      </td>
                      <td className="px-8 py-5 text-right font-black text-foreground tabular-nums">
                        {item.amountMinor ? formatMoney(item.amountMinor) : "-"}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </article>
        </div>

        {/* Right Column: Context & Stats */}
        <div className="space-y-8">
          {/* Accommodation Pulse */}
          <article className="flex min-h-[220px] flex-col justify-between rounded-xl bg-indigo-600 p-8 text-white shadow-xl shadow-indigo-200 dark:shadow-indigo-950">
            <div className="flex items-start justify-between">
              <div className="flex size-12 items-center justify-center rounded-lg bg-white/10 backdrop-blur-md">
                <BedDouble className="size-6" />
              </div>
              <Badge className="border-none bg-white/20 text-[9px] font-black tracking-widest text-white/90 uppercase hover:bg-white/20">
                {payload.roomStatus.status}
              </Badge>
            </div>
            <div>
              <p className="text-[10px] font-bold tracking-[0.2em] text-indigo-200/60 uppercase">
                Live Accommodation
              </p>
              <h3 className="mt-1 truncate text-2xl font-bold text-white">
                {payload.roomStatus.status === "assigned"
                  ? payload.roomStatus.hotelName
                  : "Unassigned"}
              </h3>
              {payload.roomStatus.status === "assigned" && (
                <div className="mt-3 flex items-center gap-4 text-xs font-bold text-indigo-100/80">
                  <span className="flex items-center gap-1.5">
                    <Layers className="size-3.5 opacity-60" />{" "}
                    {payload.roomStatus.roomLabel}
                  </span>
                  <span className="flex items-center gap-1.5">
                    <Users className="size-3.5 opacity-60" />{" "}
                    {payload.roomStatus.roomTypeLabel}
                  </span>
                </div>
              )}
            </div>
          </article>

          {/* Personal Profile */}
          <article className="rounded-xl border border-border/50 bg-card/40 p-8 shadow-sm backdrop-blur-xl">
            <h3 className="mb-6 flex items-center gap-2 text-sm font-black tracking-widest text-foreground uppercase">
              <UserRound className="size-4 text-primary" /> Profile Attributes
            </h3>

            <div className="space-y-6">
              <div className="space-y-2">
                <label className="ml-1 text-[10px] font-bold tracking-widest text-muted-foreground uppercase">
                  Gender Signal
                </label>
                <div className="flex gap-2">
                  <select
                    value={selectedGender}
                    onChange={(e) => setSelectedGender(e.target.value as any)}
                    className="h-10 flex-1 rounded-xl border border-border/40 bg-background/50 px-3 text-xs font-bold transition-all"
                  >
                    <option value="">Not set</option>
                    <option value="MALE">Male</option>
                    <option value="FEMALE">Female</option>
                    <option value="MIXED">Mixed</option>
                    <option value="UNKNOWN">Unknown</option>
                  </select>
                  <Button
                    size="sm"
                    onClick={handleSaveGender}
                    disabled={
                      isSavingGender ||
                      payload.signals.genderType === selectedGender
                    }
                    className="h-10 rounded-xl px-4 transition-all active:scale-95"
                  >
                    Save
                  </Button>
                </div>
              </div>

              <div className="grid gap-4">
                {[
                  {
                    label: "Ticket Category",
                    value: payload.signals.ticketCategory,
                    icon: Tag,
                  },
                  {
                    label: "Age Group",
                    value: payload.signals.ageGroup,
                    icon: Calendar,
                  },
                  {
                    label: "Location",
                    value: payload.signals.location,
                    icon: MapPin,
                  },
                  {
                    label: "Dietary",
                    value: payload.signals.dietary,
                    icon: Utensils,
                  },
                  {
                    label: "Roommate",
                    value: payload.signals.roommatePreference,
                    icon: Users,
                  },
                  {
                    label: "Priority",
                    value: payload.signals.allocationPriority,
                    icon: Flag,
                    highlight:
                      payload.signals.allocationPriority === "CRITICAL",
                  },
                ]
                  .filter((i) => i.value)
                  .map((item) => (
                    <div
                      key={item.label}
                      className={cn(
                        "flex items-center gap-3 rounded-2xl border p-3 transition-all",
                        item.highlight
                          ? "border-rose-500/20 bg-rose-500/5"
                          : "border-border/20 bg-background/20 hover:border-border/40"
                      )}
                    >
                      <div
                        className={cn(
                          "flex size-8 items-center justify-center rounded-lg",
                          item.highlight
                            ? "bg-rose-500/10 text-rose-600"
                            : "bg-primary/5 text-primary/60"
                        )}
                      >
                        <item.icon className="size-4" />
                      </div>
                      <div className="min-w-0">
                        <p className="text-[9px] leading-none font-bold tracking-tight text-muted-foreground/60 uppercase">
                          {item.label}
                        </p>
                        <p
                          className={cn(
                            "mt-1 truncate text-xs font-bold",
                            item.highlight ? "text-rose-600" : "text-foreground"
                          )}
                        >
                          {item.value}
                        </p>
                      </div>
                    </div>
                  ))}
              </div>
            </div>
          </article>

          {/* Remarks / Notes */}
          {payload.signals.remarks && (
            <article className="rounded-xl border border-border/50 bg-card/40 p-8 shadow-sm backdrop-blur-xl">
              <h3 className="mb-4 flex items-center gap-2 text-sm font-black tracking-widest text-foreground uppercase">
                <FileText className="size-4 text-primary" /> Remarks
              </h3>
              <div className="rounded-lg border border-primary/10 bg-primary/5 p-4 text-sm leading-relaxed text-foreground/80 italic shadow-inner">
                &ldquo;{payload.signals.remarks}&rdquo;
              </div>
            </article>
          )}
        </div>
      </div>
    </div>
  )
}
