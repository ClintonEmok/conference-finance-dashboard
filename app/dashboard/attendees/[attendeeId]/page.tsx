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

function formatMoney(minor: number) {
  return new Intl.NumberFormat("en-US", {
    style: "currency",
    currency: "EUR",
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  }).format(minor / 100)
}

function formatStatus(status: string | null) {
  if (!status) return "-"
  return status.replace(/[-_]/g, " ")
}

export default function AttendeeDetailPage({ params }: { params: Promise<{ attendeeId: string }> }) {
  const searchParams = useSearchParams()
  const [attendeeId, setAttendeeId] = useState<string | null>(null)
  const [payload, setPayload] = useState<AttendeeDetailPayload | null>(null)
  const [errorMessage, setErrorMessage] = useState<string | null>(null)
  const [isLoading, setIsLoading] = useState(true)
  const [selectedGender, setSelectedGender] = useState<"" | GenderType>("")
  const [isSavingGender, setIsSavingGender] = useState(false)

  const attendeeSearch = searchParams.get("search")
  const eventId = searchParams.get("eventId")

  const loadAttendeeDetail = useCallback(async (targetId: string, silent = false) => {
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
  }, [])

  useEffect(() => {
    params.then(p => {
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
      <div className="space-y-8 p-1 animate-pulse">
        <Skeleton className="h-32 w-full rounded-3xl" />
        <div className="grid gap-6 lg:grid-cols-3">
          <Skeleton className="h-96 lg:col-span-2 rounded-3xl" />
          <Skeleton className="h-96 rounded-3xl" />
        </div>
      </div>
    )
  }

  if (!payload) return <div className="p-8 text-center text-muted-foreground">{errorMessage || "Attendee not found."}</div>

  const initials = payload.attendee.name?.split(" ").map(n => n[0]).join("").toUpperCase().slice(0, 2)
  const paymentProgress = Math.round((payload.finance.paidAmountMinor / payload.order.totalAmountMinor) * 100) || 0

  return (
    <div className="space-y-8 animate-in fade-in slide-in-from-bottom-4 duration-700 pb-12">
      {/* Premium Header */}
      <header className="relative overflow-hidden rounded-xl border border-border/50 bg-card/40 backdrop-blur-xl p-8 shadow-2xl">
        <div className="absolute -right-20 -top-20 size-64 rounded-full bg-primary/5 blur-3xl" />
        <div className="flex flex-col gap-8 lg:flex-row lg:items-center">
          <div className="relative">
             <div className="flex size-32 items-center justify-center rounded-xl bg-gradient-to-br from-primary/20 to-primary/5 shadow-inner border border-primary/20 text-4xl font-bold text-primary">
               {initials}
             </div>
             <div className={cn(
               "absolute -bottom-1 -right-1 size-8 rounded-full border-4 border-card flex items-center justify-center",
               payload.attendee.ticketStatus === "checked_in" ? "bg-emerald-500" : "bg-orange-500"
             )}>
                {payload.attendee.ticketStatus === "checked_in" ? <ShieldCheck className="size-4 text-white" /> : <Clock className="size-4 text-white" />}
             </div>
          </div>

          <div className="flex-1 space-y-4">
            <div className="flex flex-wrap items-center gap-2">
              <Link href="/dashboard/attendees" className="group flex items-center text-[10px] font-bold uppercase tracking-widest text-muted-foreground hover:text-primary transition-colors">
                <ArrowLeft className="mr-2 size-3 group-hover:-translate-x-1 transition-transform" /> Directory
              </Link>
              <ChevronRight className="size-3 text-muted-foreground/30" />
              <span className="text-[10px] font-bold uppercase tracking-widest text-primary/70">Attendee Detail</span>
            </div>

            <div>
              <h1 className="text-4xl lg:text-5xl font-extrabold tracking-tight text-foreground">
                {payload.attendee.name}
              </h1>
              <div className="mt-3 flex flex-wrap items-center gap-3">
                <Badge variant="outline" className="rounded-xl h-7 px-3 bg-primary/5 text-primary border-primary/20 font-bold uppercase tracking-wider text-[9px]">
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
             <Button asChild variant="outline" className="rounded-2xl h-12 px-6 shadow-sm hover:bg-primary/5 active:scale-95 transition-all">
                <Link href={`/dashboard/orders/${payload.order.providerOrderId}?eventId=${payload.order.providerEventId}`}>
                  <CreditCard className="mr-2 size-4 text-primary" /> Order Detail
                </Link>
             </Button>
             <Button asChild className="rounded-2xl h-12 px-8 bg-primary text-white shadow-lg shadow-primary/20 active:scale-95 transition-all">
                <Link href={`/dashboard/accommodation?attendeeId=${payload.attendee.id}&search=${encodeURIComponent(payload.attendee.name || "")}`}>
                  <BedDouble className="mr-2 size-4" /> Room Placement
                </Link>
             </Button>
          </div>
        </div>
      </header>

      <div className="grid gap-8 lg:grid-cols-3">
        {/* Left Column: Finance & History */}
        <div className="lg:col-span-2 space-y-8">
          {/* Finance Insights */}
          <article className="rounded-xl border border-border/50 bg-card/40 backdrop-blur-xl p-8 shadow-sm">
            <div className="flex items-center justify-between mb-8">
              <div>
                <h3 className="text-xl font-bold text-foreground">Order Ledger</h3>
              </div>
              <div className="size-10 rounded-2xl bg-primary/10 flex items-center justify-center text-primary">
                <Zap className="size-5" />
              </div>
            </div>

            <div className="grid gap-6 sm:grid-cols-3 mb-8">
              <div className="p-5 rounded-lg bg-background/40 border border-border/30">
                <p className="text-[10px] font-bold uppercase tracking-widest text-muted-foreground">Total Due</p>
                <p className="text-2xl font-bold text-foreground mt-1">{formatMoney(payload.order.totalAmountMinor)}</p>
              </div>
              <div className="p-5 rounded-lg bg-emerald-500/5 border border-emerald-500/10">
                <p className="text-[10px] font-bold uppercase tracking-widest text-emerald-600/70">Amount Paid</p>
                <p className="text-2xl font-bold text-emerald-600 mt-1">{formatMoney(payload.finance.paidAmountMinor)}</p>
              </div>
              <div className="p-5 rounded-lg bg-orange-500/5 border border-orange-500/10">
                <p className="text-[10px] font-bold uppercase tracking-widest text-orange-600/70">Outstanding</p>
                <p className="text-2xl font-bold text-orange-600 mt-1">{formatMoney(payload.finance.outstandingAmountMinor)}</p>
              </div>
            </div>

            <div className="space-y-4">
              <div className="flex items-center justify-between">
                <span className="text-sm font-bold text-foreground">Settlement Progress</span>
                <span className="text-sm font-black text-primary">{paymentProgress}%</span>
              </div>
              <div className="h-3 rounded-full bg-muted/50 overflow-hidden">
                <div 
                  className="h-full bg-gradient-to-r from-primary to-emerald-500 transition-all duration-1000" 
                  style={{ width: `${paymentProgress}%` }}
                />
              </div>
            </div>
          </article>

          {/* Activity Ledger */}
          <article className="rounded-xl border border-border/50 bg-card/40 backdrop-blur-xl overflow-hidden shadow-sm">
             <div className="p-8 pb-4">
                <h3 className="text-xl font-bold text-foreground">Activity Ledger</h3>
                <p className="text-xs font-medium text-muted-foreground mt-0.5">Timeline of payments and status updates</p>
             </div>
             <div className="overflow-x-auto">
               <table className="w-full text-left">
                  <thead className="bg-muted/30 border-y border-border/20">
                    <tr>
                      <th className="px-8 py-3 text-[10px] font-bold uppercase tracking-widest text-muted-foreground/70">Event</th>
                      <th className="px-8 py-3 text-[10px] font-bold uppercase tracking-widest text-muted-foreground/70">Date</th>
                      <th className="px-8 py-3 text-[10px] font-bold uppercase tracking-widest text-muted-foreground/70 text-right">Amount</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-border/10">
                    {payload.paymentHistory.map((item) => (
                      <tr key={item.id} className="hover:bg-muted/20 transition-colors">
                        <td className="px-8 py-5">
                          <p className="font-bold text-foreground text-sm">{item.title}</p>
                          <div className="flex items-center gap-2 mt-1">
                             <Badge variant="outline" className="rounded-lg h-5 px-1.5 text-[9px] font-bold border-primary/20 text-primary/70">{item.type.replace('-', ' ')}</Badge>
                             {item.url && <a href={item.url} target="_blank" className="text-primary hover:underline flex items-center gap-1 text-[10px] font-bold uppercase tracking-tighter"><ExternalLink className="size-2.5" /> View Tikkie</a>}
                          </div>
                        </td>
                        <td className="px-8 py-5 text-xs font-medium text-muted-foreground">
                          {new Date(item.happenedAt).toLocaleDateString('en-GB', { day: '2-digit', month: 'short', year: 'numeric' })}
                        </td>
                        <td className="px-8 py-5 text-right font-black tabular-nums text-foreground">
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
          <article className="rounded-xl bg-indigo-600 p-8 text-white shadow-xl shadow-indigo-200 dark:shadow-indigo-950 flex flex-col justify-between min-h-[220px]">
            <div className="flex items-start justify-between">
               <div className="size-12 rounded-lg bg-white/10 flex items-center justify-center backdrop-blur-md">
                 <BedDouble className="size-6" />
               </div>
               <Badge className="bg-white/20 hover:bg-white/20 border-none text-[9px] font-black uppercase tracking-widest text-white/90">
                 {payload.roomStatus.status}
               </Badge>
            </div>
            <div>
               <p className="text-[10px] font-bold uppercase tracking-[0.2em] text-indigo-200/60">Live Accommodation</p>
               <h3 className="text-2xl font-bold mt-1 text-white truncate">
                 {payload.roomStatus.status === "assigned" ? payload.roomStatus.hotelName : "Unassigned"}
               </h3>
               {payload.roomStatus.status === "assigned" && (
                 <div className="mt-3 flex items-center gap-4 text-xs font-bold text-indigo-100/80">
                   <span className="flex items-center gap-1.5"><Layers className="size-3.5 opacity-60" /> {payload.roomStatus.roomLabel}</span>
                   <span className="flex items-center gap-1.5"><Users className="size-3.5 opacity-60" /> {payload.roomStatus.roomTypeLabel}</span>
                 </div>
               )}
            </div>
          </article>

          {/* Personal Profile */}
          <article className="rounded-xl border border-border/50 bg-card/40 backdrop-blur-xl p-8 shadow-sm">
            <h3 className="text-sm font-black uppercase tracking-widest text-foreground flex items-center gap-2 mb-6">
               <UserRound className="size-4 text-primary" /> Profile Attributes
            </h3>
            
            <div className="space-y-6">
               <div className="space-y-2">
                 <label className="text-[10px] font-bold uppercase tracking-widest text-muted-foreground ml-1">Gender Signal</label>
                 <div className="flex gap-2">
                    <select 
                      value={selectedGender}
                      onChange={(e) => setSelectedGender(e.target.value as any)}
                      className="flex-1 h-10 rounded-xl border border-border/40 bg-background/50 px-3 text-xs font-bold transition-all"
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
                      disabled={isSavingGender || payload.signals.genderType === selectedGender}
                      className="h-10 rounded-xl px-4 active:scale-95 transition-all"
                    >
                      Save
                    </Button>
                 </div>
               </div>

               <div className="grid gap-4">
                  {[
                    { label: "Ticket Category", value: payload.signals.ticketCategory, icon: Tag },
                    { label: "Age Group", value: payload.signals.ageGroup, icon: Calendar },
                    { label: "Location", value: payload.signals.location, icon: MapPin },
                    { label: "Dietary", value: payload.signals.dietary, icon: Utensils },
                    { label: "Roommate", value: payload.signals.roommatePreference, icon: Users },
                    { label: "Priority", value: payload.signals.allocationPriority, icon: Flag, highlight: payload.signals.allocationPriority === "CRITICAL" },
                  ].filter(i => i.value).map((item) => (
                    <div key={item.label} className={cn(
                      "flex items-center gap-3 p-3 rounded-2xl border transition-all",
                      item.highlight ? "bg-rose-500/5 border-rose-500/20" : "bg-background/20 border-border/20 hover:border-border/40"
                    )}>
                       <div className={cn("size-8 rounded-lg flex items-center justify-center", item.highlight ? "bg-rose-500/10 text-rose-600" : "bg-primary/5 text-primary/60")}>
                          <item.icon className="size-4" />
                       </div>
                       <div className="min-w-0">
                          <p className="text-[9px] font-bold uppercase tracking-tight text-muted-foreground/60 leading-none">{item.label}</p>
                          <p className={cn("text-xs font-bold mt-1 truncate", item.highlight ? "text-rose-600" : "text-foreground")}>{item.value}</p>
                       </div>
                    </div>
                  ))}
               </div>
            </div>
          </article>

          {/* Remarks / Notes */}
          {payload.signals.remarks && (
            <article className="rounded-xl border border-border/50 bg-card/40 backdrop-blur-xl p-8 shadow-sm">
               <h3 className="text-sm font-black uppercase tracking-widest text-foreground flex items-center gap-2 mb-4">
                  <FileText className="size-4 text-primary" /> Remarks
               </h3>
               <div className="p-4 rounded-lg bg-primary/5 border border-primary/10 italic text-sm text-foreground/80 leading-relaxed shadow-inner">
                 &ldquo;{payload.signals.remarks}&rdquo;
               </div>
            </article>
          )}
        </div>
      </div>
    </div>
  )
}
