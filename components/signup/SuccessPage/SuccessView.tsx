"use client"

import { useState, useEffect } from "react"
import {
  Copy,
  CheckCircle,
  Calendar,
  MapPin,
  Ticket,
  Users,
  Bed,
  Sparkles,
  ChevronDown,
  PartyPopper,
} from "lucide-react"
import { formatMoney } from "@/lib/format"
import { TikkieSection } from "./TikkieSection"
import { Card, CardContent } from "@/components/ui/card"
import { Button } from "@/components/ui/button"
import { Badge } from "@/components/ui/badge"
import { Separator } from "@/components/ui/separator"
import { cn } from "@/lib/utils"

interface SubmissionAttendee {
  name: string
  email?: string
  ticketType: string
  assignedRoom?: string
}

interface RoomAssignment {
  roomType: string
  hotelName: string
  bedCount: number
}

interface TicketSelection {
  ticketTypeId: string
  ticketTypeName: string
  quantity: number
  pricePerTicketMinor: number
}

interface Submission {
  bookingRef?: string
  bookerName?: string
  bookerEmail?: string
  bookerPhone?: string
  submittedAt?: number
  attendees: SubmissionAttendee[]
  roomAssignments: RoomAssignment[]
  totalAmountMinor?: number
  ticketSelections: TicketSelection[]
}

interface Event {
  name: string
  startsAt: number
  location?: string
  description?: string
}

interface SuccessViewProps {
  submission: Submission
  event: Event
  tikkieUrl?: string | null
}

// Animated checkmark component
function AnimatedCheck() {
  return (
    <div className="relative">
      <svg
        className="h-20 w-20 text-emerald-500"
        viewBox="0 0 100 100"
        fill="none"
        xmlns="http://www.w3.org/2000/svg"
      >
        <circle
          cx="50"
          cy="50"
          r="45"
          stroke="currentColor"
          strokeWidth="2"
          className="opacity-20"
        />
        <circle
          cx="50"
          cy="50"
          r="45"
          stroke="currentColor"
          strokeWidth="2"
          strokeDasharray="283"
          strokeDashoffset="283"
          className="animate-[draw_0.8s_ease-out_0.2s_forwards]"
          style={{
            transformOrigin: "center",
            transform: "rotate(-90deg)",
          }}
        />
        <path
          d="M30 52 L45 67 L70 35"
          stroke="currentColor"
          strokeWidth="6"
          strokeLinecap="round"
          strokeLinejoin="round"
          strokeDasharray="60"
          strokeDashoffset="60"
          className="animate-[draw_0.5s_ease-out_1s_forwards]"
        />
      </svg>
    </div>
  )
}

// Confetti effect component
function Confetti() {
  return (
    <div className="pointer-events-none absolute inset-0 overflow-hidden">
      {[...Array(30)].map((_, i) => (
        <div
          key={i}
          className="absolute h-1.5 w-1.5 animate-[confetti-fall_3s_ease-out_forwards]"
          style={{
            left: `${Math.random() * 100}%`,
            top: `-10px`,
            backgroundColor: ["#10b981", "#3b82f6", "#f59e0b", "#ec4899", "#8b5cf6"][Math.floor(Math.random() * 5)],
            animationDelay: `${Math.random() * 2}s`,
            transform: `rotate(${Math.random() * 360}deg)`,
          }}
        />
      ))}
    </div>
  )
}

function CollapsibleSection({
  title,
  icon: Icon,
  count,
  children,
  defaultOpen = false,
}: {
  title: string
  icon: React.ElementType
  count?: number
  children: React.ReactNode
  defaultOpen?: boolean
}) {
  const [isOpen, setIsOpen] = useState(defaultOpen)

  return (
    <Card className="overflow-hidden border-none bg-card/40 shadow-lg ring-1 ring-border/50">
      <button
        onClick={() => setIsOpen(!isOpen)}
        className="flex w-full items-center justify-between p-6 text-left transition-colors hover:bg-muted/30"
      >
        <div className="flex items-center gap-4">
          <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-primary/10 text-primary">
            <Icon className="h-5 w-5" />
          </div>
          <div>
            <h3 className="text-lg font-bold tracking-tight text-foreground">{title}</h3>
            {count !== undefined && (
              <p className="text-xs font-medium text-muted-foreground uppercase tracking-widest">
                {count} {count === 1 ? "item" : "items"}
              </p>
            )}
          </div>
        </div>
        <ChevronDown className={cn("h-5 w-5 text-muted-foreground transition-transform duration-300", isOpen && "rotate-180")} />
      </button>
      <div className={cn("grid transition-all duration-300 ease-in-out", isOpen ? "grid-rows-[1fr] opacity-100" : "grid-rows-[0fr] opacity-0")}>
        <div className="overflow-hidden">
          <div className="border-t border-border/50 p-6 space-y-4">
            {children}
          </div>
        </div>
      </div>
    </Card>
  )
}

export function SuccessView({
  submission,
  event,
  tikkieUrl,
}: SuccessViewProps) {
  const [copied, setCopied] = useState(false)
  const [mounted, setMounted] = useState(false)

  useEffect(() => {
    setMounted(true)
  }, [])

  if (!mounted) return null

  const handleCopy = () => {
    if (submission.bookingRef) {
      navigator.clipboard.writeText(submission.bookingRef)
      setCopied(true)
      setTimeout(() => setCopied(false), 2000)
    }
  }

  const totalAttendees = submission.attendees.length
  const totalRooms = submission.roomAssignments.length
  const totalTickets = submission.ticketSelections.reduce((sum, ts) => sum + ts.quantity, 0)
  const formattedDate = new Intl.DateTimeFormat("en-GB", {
    dateStyle: "full",
  }).format(new Date(event.startsAt))

  return (
    <div className="relative mx-auto w-full max-w-4xl space-y-12 p-6 animate-in fade-in duration-1000">
      <Confetti />

      {/* Hero Section */}
      <div className="flex flex-col items-center text-center space-y-8 py-12">
        <div className="relative">
          <div className="absolute inset-0 -m-4 animate-pulse rounded-full bg-emerald-500/10 blur-2xl" />
          <AnimatedCheck />
        </div>

        <div className="space-y-4">
          <Badge variant="outline" className="rounded-full border-emerald-500/20 bg-emerald-500/10 px-4 py-1 text-emerald-600 dark:text-emerald-400 font-bold uppercase tracking-widest text-[10px]">
            <Sparkles className="mr-2 h-3.5 w-3.5" />
            Registration Successful
          </Badge>
          <h1 className="text-4xl font-black tracking-tight text-foreground sm:text-6xl">
            You&apos;re all set!
          </h1>
          <p className="mx-auto max-w-xl text-lg text-muted-foreground font-medium">
            Your booking for <span className="text-foreground font-bold">{event.name}</span> is confirmed.
            A confirmation has been sent to <span className="text-foreground font-bold">{submission.bookerEmail}</span>.
          </p>
        </div>
      </div>

      <div className="grid gap-8 lg:grid-cols-12">
        {/* Left Column: Key Info */}
        <div className="space-y-8 lg:col-span-12">
          {/* Booking Ref Card */}
          <Card className="overflow-hidden border-none bg-gradient-to-br from-primary/10 via-primary/5 to-transparent shadow-2xl backdrop-blur-xl ring-1 ring-primary/20">
            <CardContent className="p-8 sm:p-10">
              <div className="flex flex-col items-center justify-between gap-8 md:flex-row text-center md:text-left">
                <div className="space-y-3">
                  <p className="text-[10px] font-black uppercase tracking-[0.2em] text-white mt-4">
                    Booking Reference
                  </p>
                  <div className="flex items-center justify-center gap-4 md:justify-start">
                    <code className="text-4xl font-black tracking-tighter text-white sm:text-5xl">
                      {submission.bookingRef}
                    </code>
                    <Button
                      variant="ghost"
                      size="icon"
                      onClick={handleCopy}
                      className="h-10 w-10 rounded-xl bg-primary/5 hover:bg-primary/10"
                    >
                      {copied ? (
                        <CheckCircle className="h-5 w-5 text-emerald-500" />
                      ) : (
                        <Copy className="h-5 w-5 text-primary/60" />
                      )}
                    </Button>
                  </div>
                </div>

                <div className="hidden h-16 w-px bg-primary/10 md:block" />

                <div className="flex gap-10">
                  <div className="space-y-1">
                    <p className="text-3xl font-black text-foreground">{totalTickets}</p>
                    <p className="text-[10px] font-black uppercase tracking-widest text-muted-foreground/60">Tickets</p>
                  </div>
                  <div className="space-y-1">
                    <p className="text-3xl font-black text-foreground">{totalAttendees}</p>
                    <p className="text-[10px] font-black uppercase tracking-widest text-muted-foreground/60">Attendees</p>
                  </div>
                  {totalRooms > 0 && (
                    <div className="space-y-1">
                      <p className="text-3xl font-black text-foreground">{totalRooms}</p>
                      <p className="text-[10px] font-black uppercase tracking-widest text-muted-foreground/60">Rooms</p>
                    </div>
                  )}
                </div>
              </div>
            </CardContent>
          </Card>

          {/* Event Context Card */}
          <Card className="overflow-hidden border-none bg-card/40 p-1 shadow-xl ring-1 ring-border/50">
            <div className="rounded-[calc(var(--radius)-1px)] bg-card p-6">
              <div className="flex flex-col gap-6 md:flex-row md:items-center">
                <div className="flex h-14 w-14 shrink-0 items-center justify-center rounded-2xl bg-secondary/50 text-secondary-foreground ring-1 ring-border">
                  <PartyPopper className="h-7 w-7" />
                </div>
                <div className="flex-1 space-y-1">
                  <h2 className="text-2xl font-black tracking-tight text-foreground">{event.name}</h2>
                  <div className="flex flex-wrap gap-4 text-sm font-medium text-muted-foreground">
                    <div className="flex items-center gap-2">
                      <Calendar className="h-4 w-4 text-primary" />
                      {formattedDate}
                    </div>
                    {event.location && (
                      <div className="flex items-center gap-2">
                        <MapPin className="h-4 w-4 text-primary" />
                        {event.location}
                      </div>
                    )}
                  </div>
                </div>
                {submission.totalAmountMinor !== undefined && (
                  <div className="md:text-right">
                    <p className="text-[10px] font-black uppercase tracking-widest text-muted-foreground/60 mb-1">Total Amount</p>
                    <p className="text-3xl font-black text-foreground">
                      {formatMoney(submission.totalAmountMinor)}
                    </p>
                  </div>
                )}
              </div>
            </div>
          </Card>
        </div>

        {/* Details Sections */}
        <div className="space-y-6 lg:col-span-12">
          <CollapsibleSection title="Tickets Summary" icon={Ticket} count={totalTickets} defaultOpen={true}>
            <div className="space-y-3">
              {submission.ticketSelections.map((ticket) => (
                <div key={ticket.ticketTypeId} className="flex items-center justify-between rounded-2xl border border-border/50 bg-muted/20 p-4">
                  <div className="space-y-1">
                    <p className="font-bold text-foreground">{ticket.ticketTypeName}</p>
                    <p className="text-xs text-muted-foreground">
                      {formatMoney(ticket.pricePerTicketMinor)} each
                    </p>
                  </div>
                  <div className="text-right">
                    <p className="text-lg font-black text-foreground">× {ticket.quantity}</p>
                    <p className="text-xs font-medium text-muted-foreground">
                      {formatMoney(ticket.pricePerTicketMinor * ticket.quantity)}
                    </p>
                  </div>
                </div>
              ))}
              <Separator className="my-2 bg-border/50" />
              {submission.totalAmountMinor != null && (
                <div className="flex items-center justify-between px-2">
                  <span className="text-sm font-bold text-muted-foreground">Total</span>
                  <span className="text-xl font-black text-foreground">
                    {formatMoney(submission.totalAmountMinor)}
                  </span>
                </div>
              )}
            </div>
          </CollapsibleSection>

          <CollapsibleSection title="Attendees List" icon={Users} count={totalAttendees}>
            <div className="grid gap-4 sm:grid-cols-2">
              {submission.attendees.map((attendee, index) => (
                <div key={index} className="rounded-2xl border border-border/50 bg-muted/20 p-5 space-y-4">
                  <div className="flex items-start justify-between gap-4">
                    <div className="space-y-1">
                      <p className="font-bold text-foreground leading-none">{attendee.name}</p>
                      {attendee.email && (
                        <p className="text-xs text-muted-foreground truncate">{attendee.email}</p>
                      )}
                    </div>
                    <Badge variant="secondary" className="rounded-lg text-[10px] font-black uppercase tracking-widest whitespace-nowrap">
                      {attendee.ticketType}
                    </Badge>
                  </div>
                  {attendee.assignedRoom && (
                    <div className="flex items-center gap-2 rounded-xl bg-primary/5 px-3 py-2 text-xs font-bold text-primary">
                      <Bed className="h-4 w-4" />
                      {attendee.assignedRoom}
                    </div>
                  )}
                </div>
              ))}
            </div>
          </CollapsibleSection>

          {totalRooms > 0 && (
            <CollapsibleSection title="Room Assignments" icon={Bed} count={totalRooms}>
              <div className="grid gap-4 sm:grid-cols-2">
                {submission.roomAssignments.map((room, index) => (
                  <div key={index} className="rounded-2xl border border-border/50 bg-muted/20 p-5 space-y-3">
                    <div className="flex items-center justify-between">
                      <div className="space-y-1">
                        <p className="font-bold text-foreground">{room.roomType}</p>
                        <p className="text-xs text-muted-foreground">{room.hotelName}</p>
                      </div>
                      <Badge variant="outline" className="rounded-lg border-primary/20 bg-primary/5 text-[10px] font-black uppercase tracking-widest">
                        {room.bedCount} Bed{room.bedCount !== 1 ? "s" : ""}
                      </Badge>
                    </div>
                  </div>
                ))}
              </div>
            </CollapsibleSection>
          )}

          {/* Payment Section */}
          <div className="pt-4">
            <TikkieSection tikkieUrl={tikkieUrl ?? null} eventName={event.name} />
          </div>

          {/* Footer Info */}
        </div>
      </div>

      {/* Global CSS for animations */}
      <style jsx global>{`
        @keyframes draw {
          to {
            stroke-dashoffset: 0;
          }
        }
        @keyframes confetti-fall {
          0% {
            transform: translateY(0) rotate(0deg);
            opacity: 1;
          }
          100% {
            transform: translateY(100vh) rotate(720deg);
            opacity: 0;
          }
        }
      `}</style>
    </div>
  )
}

