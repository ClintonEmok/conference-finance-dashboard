"use client"

import { useState, useEffect } from "react"
import Link from "next/link"
import { Calendar, MapPin, Ticket, Users, Bed, PartyPopper } from "lucide-react"
import { TikkieSection } from "./TikkieSection"
import { SignupHeader } from "../SignupHeader"
import { SummaryCard } from "./SummaryCard"
import { Button } from "@/components/ui/button"
import { Card, CardContent } from "@/components/ui/card"
import { Badge } from "@/components/ui/badge"
import { Separator } from "@/components/ui/separator"
import { cn } from "@/lib/utils"
import { formatMoney } from "@/lib/format"
import Image from "next/image"

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
    <div className="pointer-events-none fixed inset-0 z-50 overflow-hidden">
      {[...Array(50)].map((_, i) => (
        <div
          key={i}
          className="absolute h-1.5 w-1.5 animate-[confetti-fall_4s_ease-out_forwards]"
          style={{
            left: `${Math.random() * 100}%`,
            top: `-20px`,
            backgroundColor: [
              "#10b981",
              "#3b82f6",
              "#f59e0b",
              "#ec4899",
              "#8b5cf6",
            ][Math.floor(Math.random() * 5)],
            animationDelay: `${Math.random() * 3}s`,
            transform: `rotate(${Math.random() * 360}deg)`,
          }}
        />
      ))}
    </div>
  )
}

export function SuccessView({
  submission,
  event,
  tikkieUrl,
}: SuccessViewProps) {
  const [mounted, setMounted] = useState(false)

  useEffect(() => {
    setMounted(true)
  }, [])

  if (!mounted) return null

  const totalAttendees = submission.attendees.length
  const totalRooms = submission.roomAssignments.length
  const totalTickets = submission.ticketSelections.reduce(
    (sum, ts) => sum + ts.quantity,
    0
  )
  const formattedDate = new Intl.DateTimeFormat("en-GB", {
    dateStyle: "full",
  }).format(new Date(event.startsAt))

  return (
    <div className="flex min-h-screen flex-col bg-background selection:bg-primary/20">
      <Confetti />

      <SignupHeader eventName={event.name} />

      <main className="container mx-auto max-w-7xl px-6 py-8 md:py-12">
        <div className="grid grid-cols-1 gap-8 lg:grid-cols-12">
          {/* Main Content: Left Column (lg: 8/12) */}
          <div className="space-y-12 lg:col-span-8">
            {/* Hero Section */}
            <section className="flex flex-col items-center space-y-6 text-center md:items-start md:text-left">
              <div className="relative inline-block">
                <div className="absolute inset-0 -m-4 animate-pulse rounded-full bg-emerald-500/10 blur-2xl" />
                <AnimatedCheck />
              </div>
              <div className="space-y-4">
                <h1 className="text-4xl font-black tracking-tight text-foreground sm:text-6xl lg:text-7xl">
                  You&apos;re confirmed!
                </h1>
                <p className="mx-auto max-w-2xl text-lg font-medium text-muted-foreground md:mx-0">
                  Great news! Your booking for{" "}
                  <span className="font-bold text-foreground">
                    {event.name}
                  </span>{" "}
                  is successfully registered. We&apos;ve sent a confirmation to{" "}
                  {submission.bookerEmail ? (
                    <span className="font-bold text-foreground">
                      {submission.bookerEmail}
                    </span>
                  ) : (
                    <span className="font-bold text-foreground">
                      the email address you provided
                    </span>
                  )}
                  .
                </p>
              </div>
            </section>

            {/* Event Details Card */}
            <Card className="overflow-hidden border-none bg-card/40 p-1 shadow-xl ring-1 ring-border/50 transition-all hover:bg-card/50">
              <div className="flex flex-col gap-6 rounded-[calc(var(--radius)-1px)] bg-card p-6 md:flex-row md:items-center md:p-8">
                <div className="flex h-16 w-16 shrink-0 items-center justify-center rounded-2xl bg-primary/10 text-primary ring-1 ring-primary/20">
                  <PartyPopper className="h-8 w-8" />
                </div>
                <div className="flex-1 space-y-2">
                  <h2 className="text-2xl font-black tracking-tight text-foreground">
                    {event.name}
                  </h2>
                  <div className="flex flex-wrap gap-4 text-sm font-semibold text-muted-foreground">
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
              </div>
            </Card>

            {/* Attendees Section */}
            <div className="space-y-6">
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-3">
                  <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-primary/10 text-primary">
                    <Users className="h-5 w-5" />
                  </div>
                  <div>
                    <h3 className="text-xl font-bold tracking-tight">
                      Attendees List
                    </h3>
                    <p className="text-xs font-black tracking-widest text-muted-foreground/60 uppercase">
                      {totalAttendees} registered{" "}
                      {totalAttendees === 1 ? "person" : "people"}
                    </p>
                  </div>
                </div>
              </div>

              <div className="grid gap-4 sm:grid-cols-2">
                {submission.attendees.map((attendee, index) => (
                  <div
                    key={index}
                    className="group relative overflow-hidden rounded-2xl border border-border/50 bg-card/40 p-5 transition-all hover:border-primary/50 hover:bg-card/60"
                  >
                    <div className="flex items-start justify-between gap-4">
                      <div className="space-y-1">
                        <p className="font-bold text-foreground transition-colors group-hover:text-primary">
                          {attendee.name}
                        </p>
                        {attendee.email && (
                          <p className="max-w-[150px] truncate text-xs text-muted-foreground">
                            {attendee.email}
                          </p>
                        )}
                      </div>
                      <Badge
                        variant="secondary"
                        className="rounded-lg text-[10px] font-black tracking-widest uppercase"
                      >
                        {attendee.ticketType}
                      </Badge>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          </div>

          {/* Sidebar: Right Column (lg: 4/12) */}
          <aside className="space-y-8 lg:col-span-4">
            <div className="sticky top-28 space-y-8">
              {/* Summary Card */}
              <SummaryCard
                bookingRef={submission.bookingRef || "N/A"}
                totalTickets={totalTickets}
                totalAttendees={totalAttendees}
                totalRooms={totalRooms}
                totalAmountMinor={submission.totalAmountMinor}
              />

              <Card className="border-none bg-card/40 shadow-xl ring-1 ring-border/50 backdrop-blur-xl">
                <CardContent className="space-y-4 p-6">
                  <div className="space-y-1">
                    <p className="text-[10px] font-black tracking-[0.2em] text-muted-foreground/70 uppercase">
                      Manage booking
                    </p>
                    <p className="text-sm font-semibold text-foreground">
                      Review your payment progress and booking details any time.
                    </p>
                  </div>
                  <Button asChild className="w-full">
                    <Link href="/booking">Manage booking</Link>
                  </Button>
                </CardContent>
              </Card>
            </div>
          </aside>

          {/* Full Width Payment Section */}
          <div className="animate-in delay-300 duration-700 fade-in slide-in-from-bottom-4 lg:col-span-12">
            <TikkieSection
              tikkieUrl={tikkieUrl ?? null}
              eventName={event.name}
            />
          </div>
        </div>
      </main>

      <footer className="mt-auto border-t border-border/50 bg-card/20 py-12">
        <div className="container mx-auto max-w-7xl space-y-6 px-6 text-center">
          <div className="flex justify-center opacity-30 grayscale transition-all duration-500 hover:grayscale-0">
            <Image
              src="/dlbc-logo.png"
              alt="Logo"
              width={40}
              height={40}
              className="object-contain"
            />
          </div>
          <p className="text-xs font-black tracking-[0.2em] text-muted-foreground/40 uppercase">
            Powered by DCLM Netherlands &copy; 2026
          </p>
        </div>
      </footer>

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
