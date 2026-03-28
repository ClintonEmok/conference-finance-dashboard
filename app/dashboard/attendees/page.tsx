"use client"

import Link from "next/link"
import { useRouter, useSearchParams } from "next/navigation"
import { FormEvent, useEffect, useMemo, useState } from "react"
import {
  Users,
  Search,
  Calendar,
  Layers,
  ChevronRight,
  ChevronLeft,
  Filter,
  UserRound,
  ShieldCheck,
  BedDouble,
  CreditCard,
  Mail,
  ArrowRight,
} from "lucide-react"

import { Button } from "@/components/ui/button"
import { Skeleton } from "@/components/ui/skeleton"
import { Badge } from "@/components/ui/badge"
import { cn } from "@/lib/utils"

type GenderType = "MALE" | "FEMALE" | "MIXED" | "UNKNOWN"

type AttendeesPayload = {
  generatedAt: string
  filters: {
    eventId: string | null
    from: string
    to: string
    search: string | null
    page: number
    pageSize: number
  }
  availableEvents: Array<{
    providerEventId: string
    name: string | null
  }>
  page: {
    number: number
    size: number
    totalRows: number
    totalPages: number
  }
  rows: Array<{
    attendeeId: string
    providerAttendeeId: string | null
    providerIssuedTicketId: string | null
    providerOrderId: string
    providerEventId: string
    eventName: string | null
    attendeeName: string | null
    attendeeEmail: string | null
    genderType: GenderType | null
    ticketTypeLabel: string | null
    normalizedStatus: "paid" | "refunded" | "cancelled" | "pending"
    totalAmountMinor: number
    outstandingAmountMinor: number
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
    orderedAt: string | null
  }>
}

function toDateInputValue(date: Date) {
  return date.toISOString().slice(0, 10)
}

function toIsoBoundary(value: string, boundary: "start" | "end") {
  if (!value.trim()) return null
  const suffix = boundary === "start" ? "T00:00:00.000Z" : "T23:59:59.999Z"
  const parsed = new Date(`${value}${suffix}`)
  return Number.isNaN(parsed.getTime()) ? null : parsed.toISOString()
}

function formatGenderLabel(value: GenderType | null) {
  if (value === "MALE") return "Male"
  if (value === "FEMALE") return "Female"
  if (value === "MIXED") return "Mixed"
  if (value === "UNKNOWN") return "Unknown"
  return "Not set"
}

export default function AttendeesPage() {
  const searchParams = useSearchParams()
  const router = useRouter()
  const [eventIdInput, setEventIdInput] = useState("")
  const [searchInput, setSearchInput] = useState("")
  const [fromInput, setFromInput] = useState(() => {
    const today = new Date()
    return toDateInputValue(new Date(today.getTime() - 29 * 24 * 60 * 60 * 1000))
  })
  const [toInput, setToInput] = useState(() => toDateInputValue(new Date()))

  const [appliedEventId, setAppliedEventId] = useState("")
  const [appliedSearch, setAppliedSearch] = useState("")
  const [appliedFrom, setAppliedFrom] = useState(fromInput)
  const [appliedTo, setAppliedTo] = useState(toInput)
  const [page, setPage] = useState(1)

  const [isLoading, setIsLoading] = useState(true)
  const [errorMessage, setErrorMessage] = useState<string | null>(null)
  const [payload, setPayload] = useState<AttendeesPayload | null>(null)

  const source = searchParams.get("source")
  const focusedOrderId = searchParams.get("orderId")

  useEffect(() => {
    const nextEventId = searchParams.get("eventId") ?? ""
    const nextSearch = searchParams.get("search") ?? ""
    setEventIdInput(nextEventId)
    setSearchInput(nextSearch)
    setAppliedEventId(nextEventId)
    setAppliedSearch(nextSearch)
    setPage(1)
  }, [searchParams])

  useEffect(() => {
    const fromIso = toIsoBoundary(appliedFrom, "start")
    const toIso = toIsoBoundary(appliedTo, "end")
    if (!fromIso || !toIso) return

    const controller = new AbortController()
    async function loadAttendees() {
      setIsLoading(true)
      try {
        const query = new URLSearchParams({ 
          from: fromIso!, 
          to: toIso!, 
          page: String(page), 
          pageSize: "25" 
        })
        if (appliedEventId.trim()) query.set("eventId", appliedEventId.trim())
        if (appliedSearch.trim()) query.set("search", appliedSearch.trim())

        const response = await fetch(`/api/dashboard/attendees?${query.toString()}`, { signal: controller.signal })
        const data = await response.json()
        if (!response.ok) throw new Error(data.error?.message || "Failed to load")
        setPayload(data)
      } catch (error) {
        if (error instanceof Error && error.name === "AbortError") return
        setErrorMessage("Field to load attendees.")
      } finally {
        setIsLoading(false)
      }
    }
    loadAttendees()
    return () => controller.abort()
  }, [appliedEventId, appliedFrom, appliedSearch, appliedTo, page])

  function applyFilters(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    setAppliedEventId(eventIdInput)
    setAppliedSearch(searchInput)
    setAppliedFrom(fromInput)
    setAppliedTo(toInput)
    setPage(1)
  }

  return (
    <div className="space-y-8 animate-in fade-in duration-700">
      <header className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between px-1">
        <div>
          <h1 className="text-3xl font-bold tracking-tight text-foreground flex items-center gap-3">
            Attendees
            {payload && (
              <Badge variant="outline" className="ml-2 font-mono text-[10px] uppercase tracking-wider h-5 flex items-center border-primary/20 text-primary/70 bg-primary/5">
                {payload.page.totalRows} Verified
              </Badge>
            )}
          </h1>
          <p className="text-muted-foreground mt-1 text-sm font-medium">Synced directory of conference delegates and their logistical status.</p>
        </div>
      </header>

      {/* Filter Station */}
      <article className="rounded-xl border border-border/50 bg-card/40 backdrop-blur-xl p-6 shadow-sm">
        <form className="flex flex-wrap items-end gap-5" onSubmit={applyFilters}>
          <div className="flex-[2] min-w-[240px] space-y-1.5">
            <label className="text-[10px] font-bold uppercase tracking-widest text-muted-foreground ml-1 flex items-center gap-1.5">
              <Search className="size-3" /> Quick Search
            </label>
            <input
              type="text"
              value={searchInput}
              onChange={(e) => setSearchInput(e.target.value)}
              placeholder="Filter by name, email, or ticket ID..."
              className="w-full h-11 rounded-lg border border-border/40 bg-background/50 px-4 text-xs font-bold transition-all focus:ring-2 focus:ring-primary/20 outline-none"
            />
          </div>

          <div className="flex-1 min-w-[200px] space-y-1.5">
            <label className="text-[10px] font-bold uppercase tracking-widest text-muted-foreground ml-1 flex items-center gap-1.5">
              <Layers className="size-3" /> Event context
            </label>
            <select
              value={eventIdInput}
              onChange={(e) => setEventIdInput(e.target.value)}
              className="w-full h-11 rounded-lg border border-border/40 bg-background/50 px-4 text-xs font-bold transition-all focus:ring-2 focus:ring-primary/20 outline-none"
            >
              <option value="">All Events</option>
              {payload?.availableEvents.map((e) => (
                <option key={e.providerEventId} value={e.providerEventId}>
                  {e.name?.trim() || e.providerEventId}
                </option>
              ))}
            </select>
          </div>

          <div className="flex-[1.5] min-w-[280px] space-y-1.5">
            <label className="text-[10px] font-bold uppercase tracking-widest text-muted-foreground ml-1 flex items-center gap-1.5">
              <Calendar className="size-3" /> Booking timeline
            </label>
            <div className="grid grid-cols-2 gap-2">
              <input
                type="date"
                value={fromInput}
                onChange={(e) => setFromInput(e.target.value)}
                className="w-full h-11 rounded-lg border border-border/40 bg-background/50 px-4 text-xs font-bold transition-all"
              />
              <input
                type="date"
                value={toInput}
                onChange={(e) => setToInput(e.target.value)}
                className="w-full h-11 rounded-lg border border-border/40 bg-background/50 px-4 text-xs font-bold transition-all"
              />
            </div>
          </div>

          <Button type="submit" disabled={isLoading} className="h-11 px-8 rounded-lg bg-primary text-white shadow-lg shadow-primary/20 active:scale-95 transition-all">
            <Filter className="mr-2 size-4" /> Apply
          </Button>
        </form>
      </article>

      {/* Main Grid */}
      <article className="rounded-xl border border-border/50 bg-card/40 backdrop-blur-xl overflow-hidden shadow-sm">
        <div className="overflow-x-auto">
          <table className="w-full border-collapse text-left text-sm">
            <thead className="border-b border-border/30 bg-muted/40">
              <tr>
                <th className="px-8 py-4 font-bold text-[10px] uppercase tracking-widest text-muted-foreground/70">Attendee Detail</th>
                <th className="px-8 py-4 font-bold text-[10px] uppercase tracking-widest text-muted-foreground/70 text-center">Gender</th>
                <th className="px-8 py-4 font-bold text-[10px] uppercase tracking-widest text-muted-foreground/70 text-center">Status</th>
                <th className="px-8 py-4 font-bold text-[10px] uppercase tracking-widest text-muted-foreground/70">Accommodation</th>
                <th className="px-8 py-4 w-10"></th>
              </tr>
            </thead>
            <tbody className="divide-y divide-border/20">
              {isLoading ? (
                Array.from({ length: 8 }).map((_, i) => (
                  <tr key={i} className="border-b border-border/10">
                    <td className="px-8 py-6">
                      <div className="flex items-center gap-4">
                        <Skeleton className="size-10 rounded-lg" />
                        <div className="space-y-2">
                           <Skeleton className="h-4 w-32" />
                           <Skeleton className="h-3 w-48" />
                        </div>
                      </div>
                    </td>
                    <td className="px-8 py-6"><Skeleton className="h-6 w-16 mx-auto rounded-lg" /></td>
                    <td className="px-8 py-6">
                      <div className="flex flex-col items-center gap-1.5">
                        <Skeleton className="h-6 w-20 rounded-lg" />
                        <Skeleton className="h-2.5 w-12" />
                      </div>
                    </td>
                    <td className="px-8 py-6">
                      <div className="space-y-1.5">
                        <Skeleton className="h-3.5 w-24" />
                        <Skeleton className="h-2.5 w-32" />
                      </div>
                    </td>
                    <td className="px-8 py-6 text-right"><Skeleton className="size-8 rounded-full ml-auto" /></td>
                  </tr>
                ))
              ) : payload?.rows.map((row) => (
                <tr 
                  key={row.attendeeId}
                  onClick={() => router.push(`/dashboard/attendees/${row.attendeeId}?search=${encodeURIComponent(appliedSearch || row.attendeeName || "")}&eventId=${appliedEventId || row.providerEventId}&source=${source ?? "attendee-ledger"}`)}
                  className="group cursor-pointer hover:bg-primary/[0.02] transition-colors"
                >
                  <td className="px-8 py-6">
                    <div className="flex items-center gap-4">
                       <div className="size-10 rounded-lg bg-primary/5 border border-primary/10 flex items-center justify-center text-primary/70 font-bold text-xs">
                          {row.attendeeName?.split(" ").map(n => n[0]).join("").toUpperCase().slice(0, 2)}
                       </div>
                       <div className="min-w-0">
                          <p className="font-bold text-foreground truncate">{row.attendeeName}</p>
                          <div className="flex items-center gap-2 mt-1 text-[10px] text-muted-foreground/60 font-medium">
                             <Mail className="size-3" /> {row.attendeeEmail}
                          </div>
                       </div>
                    </div>
                  </td>
                  <td className="px-8 py-6 text-center">
                     <Badge variant="outline" className={cn(
                       "rounded-lg h-6 px-2 text-[9px] font-black uppercase tracking-widest border-none",
                       row.genderType === "MALE" ? "bg-indigo-500/10 text-indigo-600" :
                       row.genderType === "FEMALE" ? "bg-rose-500/10 text-rose-600" : "bg-muted text-muted-foreground"
                     )}>
                        {formatGenderLabel(row.genderType)}
                     </Badge>
                  </td>
                  <td className="px-8 py-6 text-center">
                    <div className="flex flex-col items-center gap-1.5">
                       <Badge className={cn(
                         "rounded-lg h-6 px-3 text-[9px] font-black uppercase tracking-widest shadow-none border-none",
                         row.normalizedStatus === "paid" ? "bg-emerald-500/10 text-emerald-600" : "bg-orange-500/10 text-orange-600"
                       )}>
                          {row.normalizedStatus}
                       </Badge>
                       {row.roomStatus.status === "assigned" && (
                         <div className="flex items-center gap-1 text-[9px] font-bold text-indigo-500/70 uppercase">
                            <ShieldCheck className="size-2.5" /> Placed
                         </div>
                       )}
                    </div>
                  </td>
                  <td className="px-8 py-6">
                    {row.roomStatus.status === "assigned" ? (
                      <div className="space-y-1">
                        <p className="text-xs font-bold text-foreground flex items-center gap-1.5">
                          <BedDouble className="size-3 text-indigo-500" /> {row.roomStatus.roomLabel}
                        </p>
                        <p className="text-[10px] font-medium text-muted-foreground/60 truncate max-w-[150px]">
                          {row.roomStatus.hotelName}
                        </p>
                      </div>
                    ) : (
                      <p className="text-[10px] font-bold uppercase tracking-tighter text-muted-foreground/30">Not assigned</p>
                    )}
                  </td>
                  <td className="px-8 py-6">
                    <div className="flex size-8 items-center justify-center rounded-full bg-muted/40 text-muted-foreground/40 group-hover:bg-primary group-hover:text-white transition-all shadow-sm">
                      <ArrowRight className="size-3.5" />
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>

        {/* Dynamic Pagination */}
        {payload && payload.page.totalPages > 1 && (
          <footer className="border-t border-border/30 px-8 py-5 flex items-center justify-between bg-muted/20">
            <p className="text-[10px] font-bold uppercase tracking-widest text-muted-foreground/50">
              Page <span className="text-foreground">{payload.page.number}</span> of {payload.page.totalPages}
            </p>
            <div className="flex items-center gap-2">
              <Button
                variant="outline"
                size="sm"
                disabled={payload.page.number <= 1}
                onClick={() => setPage(p => p - 1)}
                className="rounded-lg h-9 px-4 font-bold text-xs shadow-sm hover:bg-background active:scale-95 transition-all"
              >
                <ChevronLeft className="mr-2 size-4" /> Back
              </Button>
              <Button
                variant="outline"
                size="sm"
                disabled={payload.page.number >= payload.page.totalPages}
                onClick={() => setPage(p => p + 1)}
                className="rounded-lg h-9 px-4 font-bold text-xs shadow-sm hover:bg-background active:scale-95 transition-all"
              >
                Next <ChevronRight className="ml-2 size-4" />
              </Button>
            </div>
          </footer>
        )}
      </article>
    </div>
  )
}
