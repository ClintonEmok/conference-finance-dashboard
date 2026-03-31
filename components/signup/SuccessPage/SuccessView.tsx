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
        className="h-24 w-24 text-emerald-400"
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
          strokeWidth="4"
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
  const colors = ["#10b981", "#3b82f6", "#f59e0b", "#ec4899", "#8b5cf6"]

  return (
    <div className="pointer-events-none absolute inset-0 overflow-hidden">
      {[...Array(50)].map((_, i) => (
        <div
          key={i}
          className="absolute h-2 w-2 animate-[confetti-fall_3s_ease-out_forwards]"
          style={{
            left: `${Math.random() * 100}%`,
            top: `-10px`,
            backgroundColor: colors[Math.floor(Math.random() * colors.length)],
            animationDelay: `${Math.random() * 2}s`,
            transform: `rotate(${Math.random() * 360}deg)`,
          }}
        />
      ))}
    </div>
  )
}

// Expandable section with smooth animation
function ExpandableCard({
  title,
  icon: Icon,
  badge,
  children,
  defaultExpanded = false,
}: {
  title: string
  icon: React.ElementType
  badge: string
  children: React.ReactNode
  defaultExpanded?: boolean
}) {
  const [isOpen, setIsOpen] = useState(defaultExpanded)

  return (
    <div className="group overflow-hidden rounded-2xl border border-white/10 bg-white/5 backdrop-blur-sm transition-all duration-300 hover:bg-white/10">
      <button
        onClick={() => setIsOpen(!isOpen)}
        className="flex w-full items-center justify-between p-6 text-left"
      >
        <div className="flex items-center gap-4">
          <div className="flex h-12 w-12 items-center justify-center rounded-xl border border-white/10 bg-gradient-to-br from-violet-500/20 to-purple-600/20">
            <Icon className="h-6 w-6 text-violet-300" />
          </div>
          <div>
            <h3 className="text-lg font-semibold text-white">{title}</h3>
            <p className="text-sm text-white/50">{badge} items</p>
          </div>
        </div>
        <div
          className={`flex h-10 w-10 items-center justify-center rounded-full bg-white/5 transition-transform duration-300 ${
            isOpen ? "rotate-180" : ""
          }`}
        >
          <ChevronDown className="h-5 w-5 text-white/60" />
        </div>
      </button>
      <div
        className={`overflow-hidden transition-all duration-300 ease-in-out ${
          isOpen ? "max-h-[800px] opacity-100" : "max-h-0 opacity-0"
        }`}
      >
        <div className="border-t border-white/10 px-6 pt-4 pb-6">
          {children}
        </div>
      </div>
    </div>
  )
}

function formatEventDate(startsAt: number): string {
  const date = new Date(startsAt)
  return new Intl.DateTimeFormat("en-GB", {
    weekday: "long",
    year: "numeric",
    month: "long",
    day: "numeric",
  }).format(date)
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

  const handleCopy = () => {
    if (submission.bookingRef) {
      navigator.clipboard.writeText(submission.bookingRef)
      setCopied(true)
      setTimeout(() => setCopied(false), 2000)
    }
  }

  const totalAttendees = submission.attendees.length
  const totalRooms = submission.roomAssignments.length
  const totalTickets = submission.ticketSelections.reduce(
    (sum, ts) => sum + ts.quantity,
    0
  )

  if (!mounted) return null

  return (
    <div className="relative min-h-screen overflow-hidden bg-gradient-to-br from-slate-950 via-slate-900 to-slate-950">
      {/* Animated background */}
      <div className="absolute inset-0">
        <div className="absolute top-0 left-1/4 h-96 w-96 animate-pulse rounded-full bg-emerald-500/10 blur-3xl" />
        <div
          className="absolute right-1/4 bottom-0 h-96 w-96 animate-pulse rounded-full bg-violet-500/10 blur-3xl"
          style={{ animationDelay: "1s" }}
        />
        <div className="absolute top-1/2 left-1/2 h-[800px] w-[800px] -translate-x-1/2 -translate-y-1/2 transform rounded-full bg-blue-500/5 blur-3xl" />
      </div>

      {/* Confetti */}
      <Confetti />

      {/* Main content */}
      <div className="relative z-10 container mx-auto max-w-3xl px-4 py-12">
        {/* Hero Section */}
        <div className="mb-12 text-center">
          <div className="mb-6 inline-flex animate-[fadeInUp_0.6s_ease-out] items-center gap-2 rounded-full border border-emerald-500/20 bg-emerald-500/10 px-4 py-2 text-sm font-medium text-emerald-400">
            <Sparkles className="h-4 w-4" />
            <span>Booking Confirmed</span>
          </div>

          <div className="mb-6 flex animate-[fadeInUp_0.6s_ease-out_0.2s_both] justify-center">
            <AnimatedCheck />
          </div>

          <h1
            className="mb-4 animate-[fadeInUp_0.6s_ease-out_0.3s_both] text-4xl font-bold text-white md:text-5xl"
            style={{ fontFamily: "system-ui, -apple-system, sans-serif" }}
          >
            You&apos;re all set!
          </h1>

          <p className="mx-auto max-w-lg animate-[fadeInUp_0.6s_ease-out_0.4s_both] text-lg text-white/60">
            Your booking for{" "}
            <span className="font-medium text-white">{event.name}</span> has
            been confirmed. We&apos;ve sent a confirmation email to{" "}
            <span className="text-white">{submission.bookerEmail}</span>.
          </p>
        </div>

        {/* Booking Reference Card */}
        <div className="mb-8 animate-[fadeInUp_0.6s_ease-out_0.5s_both] rounded-3xl border border-white/10 bg-gradient-to-r from-violet-600/20 via-purple-600/20 to-pink-600/20 p-8 backdrop-blur-xl">
          <div className="flex flex-col items-center gap-6 md:flex-row">
            <div className="flex-1 text-center md:text-left">
              <p className="mb-2 text-sm tracking-wider text-white/50 uppercase">
                Booking Reference
              </p>
              <div className="flex items-center justify-center gap-3 md:justify-start">
                <code className="text-3xl font-bold tracking-wider text-white">
                  {submission.bookingRef}
                </code>
                <button
                  onClick={handleCopy}
                  className="group rounded-xl border border-white/10 bg-white/5 p-3 transition-all duration-200 hover:bg-white/10"
                  title="Copy booking reference"
                >
                  {copied ? (
                    <CheckCircle className="h-5 w-5 text-emerald-400" />
                  ) : (
                    <Copy className="h-5 w-5 text-white/60 transition-colors group-hover:text-white" />
                  )}
                </button>
              </div>
            </div>

            <div className="hidden h-16 w-px bg-white/10 md:block" />

            <div className="flex gap-8 text-center">
              <div>
                <p className="text-2xl font-bold text-white">{totalTickets}</p>
                <p className="text-sm text-white/50">Tickets</p>
              </div>
              <div>
                <p className="text-2xl font-bold text-white">
                  {totalAttendees}
                </p>
                <p className="text-sm text-white/50">Attendees</p>
              </div>
              {totalRooms > 0 && (
                <div>
                  <p className="text-2xl font-bold text-white">{totalRooms}</p>
                  <p className="text-sm text-white/50">Rooms</p>
                </div>
              )}
            </div>
          </div>
        </div>

        {/* Event Details */}
        <div className="mb-8 animate-[fadeInUp_0.6s_ease-out_0.6s_both] rounded-2xl border border-white/10 bg-white/5 p-6 backdrop-blur-sm">
          <div className="flex items-start gap-4">
            <div className="flex h-14 w-14 shrink-0 items-center justify-center rounded-xl border border-white/10 bg-gradient-to-br from-blue-500/20 to-cyan-500/20">
              <PartyPopper className="h-7 w-7 text-blue-300" />
            </div>
            <div className="flex-1">
              <h2 className="mb-2 text-xl font-semibold text-white">
                {event.name}
              </h2>
              <div className="flex flex-wrap gap-4 text-sm text-white/60">
                <div className="flex items-center gap-2">
                  <Calendar className="h-4 w-4" />
                  <span>{formatEventDate(event.startsAt)}</span>
                </div>
                {event.location && (
                  <div className="flex items-center gap-2">
                    <MapPin className="h-4 w-4" />
                    <span>{event.location}</span>
                  </div>
                )}
              </div>
            </div>
            {submission.totalAmountMinor !== undefined && (
              <div className="text-right">
                <p className="text-sm text-white/50">Total</p>
                <p className="text-2xl font-bold text-white">
                  {formatMoney(submission.totalAmountMinor)}
                </p>
              </div>
            )}
          </div>
        </div>

        {/* Expandable Sections */}
        <div className="mb-8 animate-[fadeInUp_0.6s_ease-out_0.7s_both] space-y-4">
          {/* Tickets Section */}
          <ExpandableCard
            title="Tickets"
            icon={Ticket}
            badge={totalTickets.toString()}
            defaultExpanded={true}
          >
            <div className="space-y-3">
              {submission.ticketSelections.map((ticket) => (
                <div
                  key={ticket.ticketTypeId}
                  className="flex items-center justify-between rounded-xl border border-white/5 bg-white/5 p-4 transition-colors hover:bg-white/10"
                >
                  <div>
                    <p className="font-medium text-white">
                      {ticket.ticketTypeName}
                    </p>
                    <p className="text-sm text-white/50">
                      {formatMoney(ticket.pricePerTicketMinor)} each
                    </p>
                  </div>
                  <div className="text-right">
                    <p className="text-lg font-semibold text-white">
                      × {ticket.quantity}
                    </p>
                    <p className="text-sm text-white/50">
                      {formatMoney(
                        ticket.pricePerTicketMinor * ticket.quantity
                      )}
                    </p>
                  </div>
                </div>
              ))}
              {submission.totalAmountMinor !== undefined && (
                <div className="flex items-center justify-between border-t border-white/10 pt-4">
                  <span className="text-white/70">Total Amount</span>
                  <span className="text-xl font-bold text-white">
                    {formatMoney(submission.totalAmountMinor)}
                  </span>
                </div>
              )}
            </div>
          </ExpandableCard>

          {/* Attendees Section */}
          <ExpandableCard
            title="Attendees"
            icon={Users}
            badge={totalAttendees.toString()}
            defaultExpanded={false}
          >
            <div className="space-y-3">
              {submission.attendees.map((attendee, index) => (
                <div
                  key={index}
                  className="rounded-xl border border-white/5 bg-white/5 p-4"
                >
                  <div className="mb-2 flex items-center justify-between">
                    <p className="text-lg font-medium text-white">
                      {attendee.name}
                    </p>
                    <span className="rounded-full border border-white/10 bg-white/10 px-3 py-1 text-xs font-medium text-white/80">
                      {attendee.ticketType}
                    </span>
                  </div>
                  {attendee.email && (
                    <p className="text-sm text-white/50">{attendee.email}</p>
                  )}
                  {attendee.assignedRoom && (
                    <div className="mt-2 flex items-center gap-2 text-sm text-emerald-400">
                      <Bed className="h-4 w-4" />
                      <span>{attendee.assignedRoom}</span>
                    </div>
                  )}
                </div>
              ))}
            </div>
          </ExpandableCard>

          {/* Room Assignments Section */}
          {totalRooms > 0 && (
            <ExpandableCard
              title="Room Assignments"
              icon={Bed}
              badge={totalRooms.toString()}
              defaultExpanded={false}
            >
              <div className="space-y-3">
                {submission.roomAssignments.map((room, index) => (
                  <div
                    key={index}
                    className="rounded-xl border border-white/5 bg-white/5 p-4"
                  >
                    <div className="flex items-center justify-between">
                      <div>
                        <p className="font-medium text-white">
                          {room.roomType}
                        </p>
                        <p className="text-sm text-white/50">
                          {room.hotelName}
                        </p>
                      </div>
                      <div className="flex items-center gap-2 rounded-full border border-white/10 bg-white/10 px-3 py-1 text-sm text-white/80">
                        <Bed className="h-4 w-4" />
                        <span>
                          {room.bedCount} bed{room.bedCount !== 1 ? "s" : ""}
                        </span>
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            </ExpandableCard>
          )}
        </div>

        {/* Tikkie Payment Section */}
        <div className="animate-[fadeInUp_0.6s_ease-out_0.8s_both]">
          <TikkieSection tikkieUrl={tikkieUrl ?? null} eventName={event.name} />
        </div>

        {/* Footer */}
        <div className="mt-12 animate-[fadeInUp_0.6s_ease-out_0.9s_both] text-center">
          <p className="text-sm text-white/40">
            Keep your booking reference safe. Questions?{" "}
            <a
              href="#"
              className="text-violet-400 underline underline-offset-4 transition-colors hover:text-violet-300"
            >
              Contact the event organizers
            </a>
          </p>
        </div>
      </div>

      {/* CSS Animations */}
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
        @keyframes fadeInUp {
          from {
            opacity: 0;
            transform: translateY(20px);
          }
          to {
            opacity: 1;
            transform: translateY(0);
          }
        }
      `}</style>
    </div>
  )
}
