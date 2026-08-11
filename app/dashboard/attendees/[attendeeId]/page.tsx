"use client"

import { use, useCallback, useEffect, useState } from "react"
import Link from "next/link"
import { usePathname } from "next/navigation"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { Skeleton } from "@/components/ui/skeleton"
import { cn } from "@/lib/utils"
import { formatMoney } from "@/lib/format"
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog"
import { AttendeeOrderEditor } from "@/components/dashboard/attendee-order-editor"
import {
  BedDouble,
  ChevronRight,
  CreditCard,
  FileText,
  Flag,
  Mail,
  MapPin,
  Pencil,
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

type AttendeeDetailPayload = {
  attendee: {
    id: string
    name: string | null
    email: string | null
    ticketTypeId: string | null
    ticketTypeLabel: string | null
    amountDueMinor: number
    ticketStatus: string | null
    checkedInAt: string | null
    providerIssuedTicketId: string | null
  }
  event: {
    id: string
    name: string | null
  }
  order: {
    id: string
    bookingRef: string | null
    buyerName: string | null
    buyerEmail: string | null
    normalizedStatus: "paid" | "refunded" | "cancelled" | "pending"
    orderedAt: string | null
    amountDueMinor: number
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
        expectedRoomTypeLabel: string | null
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

export default function AttendeeDetailPage({
  params,
}: {
  params: Promise<{ attendeeId: string }>
}) {
  const { attendeeId: rawAttendeeId } = use(params)
  const pathname = usePathname()
  const [payload, setPayload] = useState<AttendeeDetailPayload | null>(null)
  const [errorMessage, setErrorMessage] = useState<string | null>(null)
  const [isLoading, setIsLoading] = useState(true)
  const [isEditorOpen, setIsEditorOpen] = useState(false)
  
  const attendeeId = rawAttendeeId?.trim() ?? ""
  const eventSlug = pathname.match(/^\/dashboard\/events\/([^/]+)\/attendees\//)?.[1] ?? null
  const backHref = eventSlug ? `/dashboard/events/${eventSlug}/attendees` : "/dashboard/attendees"
  const orderLinkHref = payload
    ? eventSlug
      ? `/dashboard/events/${eventSlug}/orders/${payload.order.id}`
      : `/dashboard/manage-orders/${payload.order.id}`
    : "#"

  const loadAttendeeDetail = useCallback(
    async (targetId: string, silent = false) => {
      if (!silent) setIsLoading(true)
      try {
        const res = await fetch(`/api/dashboard/attendees/${targetId}`)
        if (!res.ok) throw new Error("Failed to load")
        const data = await res.json()
        setPayload(data)
      } catch {
        setErrorMessage("Failed to load attendee information.")
      } finally {
        setIsLoading(false)
      }
    },
    []
  )

  useEffect(() => {
    if (attendeeId) {
      loadAttendeeDetail(attendeeId)
    }
  }, [attendeeId, loadAttendeeDetail])

  if (isLoading) {
    return (
      <div className="space-y-8 animate-pulse">
        <Skeleton className="h-48 w-full rounded-2xl" />
        <div className="grid gap-8 lg:grid-cols-3">
          <Skeleton className="h-[600px] rounded-2xl lg:col-span-2" />
          <Skeleton className="h-[600px] rounded-2xl" />
        </div>
      </div>
    )
  }

  if (!payload) {
    return (
      <div className="rounded-2xl border border-destructive/20 bg-destructive/5 p-12 text-center">
        <XCircle className="mx-auto mb-4 size-16 text-destructive opacity-20" />
        <h3 className="text-xl font-bold text-destructive">Not Found</h3>
        <p className="text-sm text-destructive/70 max-w-md mx-auto mt-2">
          {errorMessage || "The attendee you're looking for doesn't exist or has been removed."}
        </p>
        <Button variant="outline" className="mt-8 rounded-xl border-destructive/20 text-destructive hover:bg-destructive/10" asChild>
          <Link href={backHref}>Back to Attendees</Link>
        </Button>
      </div>
    )
  }

  const initials = payload.attendee.name
    ?.split(" ")
    .map((n) => n[0])
    .join("")
    .toUpperCase()
    .slice(0, 2)
  const paid = payload.finance.paidAmountMinor
  const due = payload.attendee.amountDueMinor
  const paymentProgress = due === 0 ? 100 : Math.min(100, Math.round((paid / due) * 100))

  return (
    <div className="animate-in space-y-8 pb-12 duration-700 fade-in slide-in-from-bottom-4">
      {/* Hero Section */}
      <header className="relative overflow-hidden rounded-2xl border border-white/40 bg-white/40 p-8 shadow-sm backdrop-blur dark:border-white/10 dark:bg-black/20">
        <div className="absolute -top-20 -right-20 size-64 rounded-full bg-primary/5 blur-3xl" />
        <div className="flex flex-col gap-8 lg:flex-row lg:items-center">
          <div className="relative group">
            <div className="flex size-32 items-center justify-center rounded-2xl border border-white/60 bg-white/50 text-4xl font-black text-primary shadow-sm dark:border-white/10 dark:bg-white/5 transition-transform group-hover:scale-105 duration-500">
              {initials}
            </div>
            <div
              className={cn(
                "absolute -right-2 -bottom-2 flex size-10 items-center justify-center rounded-full border-4 border-white/80 dark:border-zinc-900 shadow-md",
                payload.attendee.ticketStatus === "checked_in" ? "bg-emerald-500" : "bg-orange-500"
              )}
            >
              {payload.attendee.ticketStatus === "checked_in" ? (
                <ShieldCheck className="size-5 text-white" />
              ) : (
                <Clock className="size-5 text-white animate-pulse" />
              )}
            </div>
          </div>

          <div className="flex-1 space-y-4">
            <div>
              <h1 className="text-4xl font-black tracking-tight text-foreground lg:text-5xl">
                {payload.attendee.name}
              </h1>
              <div className="mt-4 flex flex-wrap items-center gap-4">
                <Badge
                  variant="outline"
                  className="rounded-xl border-primary/20 bg-primary/5 px-3 py-1 text-[10px] font-black tracking-widest text-primary uppercase"
                >
                  {payload.attendee.ticketTypeLabel}
                </Badge>
                <div className="flex items-center gap-2 text-sm font-medium text-muted-foreground/80">
                  <Mail className="size-4 text-primary/40" />
                  {payload.attendee.email}
                </div>
              </div>
            </div>
          </div>

          <div className="flex flex-wrap gap-4">
            <Button
              asChild
              variant="outline"
              className="h-12 rounded-2xl border-white/40 bg-white/40 px-6 font-bold shadow-sm backdrop-blur transition-all hover:bg-white/60 active:scale-95 dark:border-white/10 dark:bg-white/5"
            >
              <Link href={orderLinkHref}>
                <CreditCard className="mr-3 size-4 text-primary" /> Order Detail
              </Link>
            </Button>
            <Button
              asChild
              className="h-12 rounded-2xl bg-primary px-8 font-black text-white shadow-lg shadow-primary/20 transition-all hover:shadow-primary/40 active:scale-95"
            >
              <Link
                href={`/dashboard/accommodation?attendeeId=${payload.attendee.id}&search=${encodeURIComponent(payload.attendee.name || "")}`}
              >
                <BedDouble className="mr-3 size-4" /> Room Placement
              </Link>
            </Button>
          </div>
        </div>
      </header>

      <div className="grid gap-8 lg:grid-cols-3">
        {/* Left Column: Ledger & Activity */}
        <div className="space-y-8 lg:col-span-2">
          {/* Order Ledger */}
          <article className="rounded-2xl border border-white/40 bg-white/40 p-8 shadow-sm backdrop-blur dark:border-white/10 dark:bg-black/20">
            <div className="mb-8 flex items-center justify-between">
              <div>
                <h3 className="text-xl font-black tracking-tight text-foreground">
                  Order Ledger
                </h3>
                <p className="text-xs font-medium text-muted-foreground/60">Financial settlement status</p>
              </div>
              <div className="flex size-12 items-center justify-center rounded-2xl bg-primary/10 text-primary">
                <Zap className="size-6" />
              </div>
            </div>

            <div className="mb-8 grid gap-4 grid-cols-1 sm:grid-cols-3">
              {[
                { label: "Total Due", value: formatMoney(payload.attendee.amountDueMinor), color: "text-foreground", bg: "bg-white/50 dark:bg-white/5" },
                { label: "Amount Paid", value: formatMoney(payload.finance.paidAmountMinor), color: "text-emerald-600 dark:text-emerald-400", bg: "bg-emerald-500/5" },
                { label: "Outstanding", value: formatMoney(payload.finance.outstandingAmountMinor), color: "text-rose-600 dark:text-rose-400", bg: "bg-rose-500/5" }
              ].map((stat, i) => (
                <div key={i} className={cn("rounded-2xl border border-white/60 p-5 shadow-sm dark:border-white/5", stat.bg)}>
                  <p className="text-[10px] font-black tracking-[0.2em] text-muted-foreground/60 uppercase mb-2 px-1">
                    {stat.label}
                  </p>
                  <p className={cn("text-2xl font-black tabular-nums tracking-tighter", stat.color)}>
                    {stat.value}
                  </p>
                </div>
              ))}
            </div>

            <div className="space-y-3">
              <div className="flex items-center justify-between px-1">
                <span className="text-[10px] font-black tracking-widest text-foreground uppercase">
                  Settlement Progress
                </span>
                <span className="text-xs font-black text-primary tabular-nums">
                  {paymentProgress}%
                </span>
              </div>
              <div className="h-4 overflow-hidden rounded-full bg-black/5 p-1 dark:bg-white/5">
                <div
                  className="h-full rounded-full bg-gradient-to-r from-primary via-primary to-emerald-500 transition-all duration-1000 shadow-[0_0_12px_rgba(var(--primary-rgb),0.3)]"
                  style={{ width: `${paymentProgress}%` }}
                />
              </div>
            </div>
          </article>

          {/* Activity Ledger */}
          <article className="overflow-hidden rounded-2xl border border-white/40 bg-white/40 shadow-sm backdrop-blur dark:border-white/10 dark:bg-black/20">
            <div className="p-8 pb-6 text-center sm:text-left">
              <h3 className="text-xl font-black tracking-tight text-foreground">
                Activity Ledger
              </h3>
              <p className="mt-1 text-xs font-medium text-muted-foreground/60 px-1">
                Historical timeline of transactions and status events.
              </p>
            </div>
            <div className="overflow-x-auto">
              <table className="w-full text-left">
                <thead className="border-y border-white/20 bg-white/10 dark:border-white/5">
                  <tr>
                    <th className="px-8 py-4 text-[10px] font-black tracking-widest text-muted-foreground uppercase">
                      Event Detail
                    </th>
                    <th className="px-8 py-4 text-[10px] font-black tracking-widest text-muted-foreground uppercase">
                      Timestamp
                    </th>
                    <th className="px-8 py-4 text-right text-[10px] font-black tracking-widest text-muted-foreground uppercase">
                      Amount
                    </th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-white/10 dark:divide-white/5">
                  {payload.paymentHistory.length === 0 ? (
                    <tr>
                      <td colSpan={3} className="px-8 py-12 text-center text-muted-foreground/40 text-xs font-bold uppercase tracking-widest">
                        No activity recorded
                      </td>
                    </tr>
                  ) : (
                    payload.paymentHistory.map((item) => (
                      <tr
                        key={item.id}
                        className="transition-colors hover:bg-white/40 dark:hover:bg-white/5 group"
                      >
                        <td className="px-8 py-5">
                          <p className="text-sm font-bold text-foreground group-hover:text-primary transition-colors">
                            {item.title}
                          </p>
                          <div className="mt-2 flex items-center gap-3">
                            <Badge
                              variant="secondary"
                              className="rounded-lg h-5 px-2 text-[9px] font-black text-muted-foreground uppercase tracking-widest"
                            >
                              {item.type.replace("-", " ")}
                            </Badge>
                            {item.url && (
                              <a
                                href={item.url}
                                target="_blank"
                                className="flex items-center gap-1.5 text-[9px] font-black tracking-widest text-primary uppercase hover:underline"
                              >
                                <ExternalLink className="size-3" /> Tikkie Link
                              </a>
                            )}
                          </div>
                        </td>
                        <td className="px-8 py-5 text-xs font-bold text-muted-foreground/70 tabular-nums">
                          {new Date(item.happenedAt).toLocaleDateString("en-GB", {
                            day: "2-digit",
                            month: "short",
                            year: "numeric",
                          })}
                        </td>
                        <td className="px-8 py-5 text-right font-black text-foreground tabular-nums tracking-tighter">
                          {item.amountMinor ? formatMoney(item.amountMinor) : "—"}
                        </td>
                      </tr>
                    ))
                  )}
                </tbody>
              </table>
            </div>
          </article>
        </div>

        {/* Right Column: Information & Signals */}
        <div className="space-y-8">
          {/* Live Accommodation */}
          <article className="relative min-h-[220px] flex flex-col justify-between rounded-2xl bg-indigo-600 p-8 text-white shadow-xl shadow-indigo-500/10 dark:shadow-indigo-900/40 group overflow-hidden">
             <div className="absolute top-0 right-0 p-8 opacity-10 group-hover:scale-110 transition-transform duration-700">
               <BedDouble className="size-40" />
             </div>
            <div className="flex items-start justify-between relative z-10">
              <div className="flex size-12 items-center justify-center rounded-xl bg-white/20 backdrop-blur-md shadow-inner">
                <BedDouble className="size-6" />
              </div>
              <Badge className="border-none bg-white/20 text-[9px] font-black tracking-widest text-white uppercase hover:bg-white/30 px-2 py-0.5">
                {payload.roomStatus.status}
              </Badge>
            </div>
            <div className="relative z-10">
              <p className="text-[10px] font-black tracking-[0.2em] text-indigo-200/60 uppercase mb-1 px-1">
                Accommodation Status
              </p>
              <h3 className="truncate text-3xl font-black text-white tracking-tight">
                {payload.roomStatus.status === "assigned"
                  ? payload.roomStatus.hotelName
                  : "Unassigned"}
              </h3>
              {payload.roomStatus.status === "assigned" && (
                <div className="mt-4 flex flex-wrap items-center gap-4 text-xs font-black text-indigo-100 uppercase tracking-widest">
                  <span className="flex items-center gap-2 bg-white/10 px-2.5 py-1 rounded-lg">
                    <Layers className="size-3.5" /> {payload.roomStatus.roomLabel}
                  </span>
                  <span className="flex items-center gap-2 bg-white/10 px-2.5 py-1 rounded-lg">
                    <Users className="size-3.5" /> {payload.roomStatus.roomTypeLabel}
                  </span>
                </div>
              )}
              {payload.roomStatus.status === "unassigned" &&
                payload.roomStatus.expectedRoomTypeLabel && (
                  <p className="mt-4 text-[10px] font-black text-indigo-200 bg-white/10 px-3 py-1.5 rounded-xl inline-block uppercase tracking-widest">
                    Preferred: {payload.roomStatus.expectedRoomTypeLabel}
                  </p>
                )}
            </div>
          </article>

          {/* Signals & Metadata */}
          <article className="rounded-2xl border border-white/40 bg-white/40 p-8 shadow-sm backdrop-blur dark:border-white/10 dark:bg-black/20">
            <h3 className="mb-6 flex items-center gap-2 text-[11px] font-black tracking-[0.2em] text-foreground uppercase">
              <UserRound className="size-4 text-primary" /> Profile Signals
            </h3>

            <div className="space-y-6">
              <div className="space-y-3">
                <label className="ml-1 text-[10px] font-black tracking-widest text-muted-foreground/60 uppercase">
                  Gender Identification
                </label>
                <div className="flex gap-2">
                  <span className="flex h-10 flex-1 items-center rounded-xl border border-white/40 bg-white/50 px-3 text-xs font-bold dark:bg-black/20">
                    {payload.signals.genderType
                      ? payload.signals.genderType.charAt(0).toUpperCase() +
                        payload.signals.genderType.slice(1).toLowerCase()
                      : "Not set"}
                  </span>
                  <Button
                    size="sm"
                    onClick={() => setIsEditorOpen(true)}
                    className="h-10 rounded-xl px-5 font-bold transition-all active:scale-95"
                  >
                    <Pencil className="mr-2 size-3.5" />
                    Edit attendee
                  </Button>
                </div>
              </div>

              <div className="grid gap-3">
                {[
                  { label: "Category", value: payload.signals.ticketCategory, icon: Tag },
                  { label: "Age Group", value: payload.signals.ageGroup, icon: Calendar },
                  { label: "Location", value: payload.signals.location, icon: MapPin },
                  { label: "Dietary", value: payload.signals.dietary, icon: Utensils },
                  { label: "Roommate", value: payload.signals.roommatePreference, icon: Users },
                  { 
                    label: "Priority", 
                    value: payload.signals.allocationPriority, 
                    icon: Flag, 
                    urgent: payload.signals.allocationPriority === "CRITICAL" || payload.signals.allocationPriority === "HIGH" 
                  },
                ]
                  .filter((i) => i.value)
                  .map((item) => (
                    <div
                      key={item.label}
                      className={cn(
                        "flex items-center gap-4 rounded-2xl border p-4 transition-all hover:border-white/60 dark:hover:border-white/20",
                        item.urgent ? "border-rose-500/20 bg-rose-500/5" : "border-white/20 bg-white/30 dark:bg-white/5"
                      )}
                    >
                      <div
                        className={cn(
                          "flex size-10 items-center justify-center rounded-xl shadow-sm",
                          item.urgent ? "bg-rose-500 text-white" : "bg-primary/10 text-primary"
                        )}
                      >
                        <item.icon className="size-5" />
                      </div>
                      <div className="min-w-0">
                        <p className="text-[9px] font-black tracking-widest text-muted-foreground/60 uppercase">
                          {item.label}
                        </p>
                        <p
                          className={cn(
                            "mt-0.5 truncate text-sm font-black tracking-tight",
                            item.urgent ? "text-rose-600 dark:text-rose-400" : "text-foreground"
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

          {/* Remarks Card */}
          {payload.signals.remarks && (
            <article className="rounded-2xl border border-white/40 bg-white/40 p-8 shadow-sm backdrop-blur dark:border-white/10 dark:bg-black/20 group">
              <h3 className="mb-4 flex items-center gap-2 text-[11px] font-black tracking-widest text-foreground uppercase">
                <FileText className="size-4 text-primary" /> Observations
              </h3>
              <div className="relative rounded-2xl border border-primary/10 bg-primary/5 p-5 text-sm leading-relaxed text-foreground/80 font-medium italic shadow-inner dark:border-primary/20">
                <span className="absolute -top-3 -left-1 text-5xl text-primary/10 font-serif">&ldquo;</span>
                {payload.signals.remarks}
                <span className="absolute -bottom-6 -right-1 text-5xl text-primary/10 font-serif">&rdquo;</span>
              </div>
            </article>
          )}
        </div>
      </div>

      <Dialog open={isEditorOpen} onOpenChange={setIsEditorOpen}>
        <DialogContent className="max-h-[90vh] overflow-y-auto sm:max-w-2xl">
          <DialogHeader>
            <DialogTitle>Edit attendee</DialogTitle>
            <DialogDescription>
              Update ticket, location, gender, accommodation preferences, or
              move this attendee to another order.
            </DialogDescription>
          </DialogHeader>
          <AttendeeOrderEditor
            attendee={{
              id: payload.attendee.id,
              name: payload.attendee.name ?? "Attendee",
              ticketTypeId: payload.attendee.ticketTypeId,
              ticketTypeLabel: payload.attendee.ticketTypeLabel,
              genderType: payload.signals.genderType,
              location: payload.signals.location,
              orderId: payload.order.id,
              bookingRef: payload.order.bookingRef,
              eventId: payload.event.id,
            }}
            onSaved={() => loadAttendeeDetail(attendeeId, true)}
          />
        </DialogContent>
      </Dialog>
    </div>
  )
}
