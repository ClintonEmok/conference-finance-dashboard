"use client"

import Link from "next/link"
import { Calendar, ChevronRight, Tag } from "lucide-react"

import { Button } from "@/components/ui/button"
import { Card } from "@/components/ui/card"

type TicketInfo = {
  ticketTypeId: string
  label: string
  priceMinor: number
  selectable: boolean
  reason: string | null
}

type EventEntryContentProps = {
  event: {
    slug: string
    title: string
    startsAt: number
    endsAt?: number
    timezone: string
    tickets: TicketInfo[]
    accommodation: {
      eligible: boolean
      reason: string | null
    }
  }
}

function formatEventDateRange(
  startsAt: number,
  endsAt: number | undefined,
  timezone: string
) {
  const formatter = new Intl.DateTimeFormat("en-GB", {
    dateStyle: "medium",
    timeZone: timezone,
  })

  const startStr = formatter.format(new Date(startsAt))
  const endStr = endsAt ? formatter.format(new Date(endsAt)) : null

  if (endStr && startStr !== endStr) {
    return `${startStr} - ${endStr}`
  }
  return startStr
}

function signupStatusCopy(reason: string | null) {
  if (reason === "event_closed") {
    return {
      label: "Signup Closed",
      variant: "secondary" as const,
      detail: "This event is no longer accepting new signups.",
    }
  }

  if (reason === "accommodation_disabled") {
    return {
      label: "Limited Status",
      variant: "outline" as const,
      detail: "Signup is open, but accommodation assignment is currently limited.",
    }
  }

  return {
    label: "Signup Open",
    variant: "default" as const,
    detail: "You can begin the guided signup flow for this event.",
  }
}

export function EventEntryContent({ event }: EventEntryContentProps) {
  const signupOpen = event.tickets.some((ticket) => ticket.selectable)
  const status = signupStatusCopy(event.accommodation.reason)
  const dateRange = formatEventDateRange(event.startsAt, event.endsAt, event.timezone)

  return (
    <main className="mx-auto w-full max-w-5xl space-y-12 p-6 animate-in fade-in duration-700">
      {/* Hero Section */}
      <section className="relative overflow-hidden rounded-[2.5rem] bg-card p-1 shadow-2xl transition-all duration-500 hover:shadow-primary/5">
        <div className="absolute inset-0 bg-gradient-to-br from-primary/10 via-transparent to-primary/5 opacity-50" />
        <div className="absolute -right-20 -top-20 h-64 w-64 rounded-full bg-primary/10 blur-3xl" />
        <div className="absolute -bottom-20 -left-20 h-64 w-64 rounded-full bg-primary/10 blur-3xl" />

        <div className="relative rounded-[calc(2.5rem-4px)] bg-card/60 backdrop-blur-xl">
          <div className="flex flex-col items-center gap-10 p-10 py-16 text-center sm:p-20">
            <div className="space-y-6">


              <div className="space-y-4">
                <h1 className="text-4xl font-black tracking-tight text-foreground sm:text-6xl lg:text-7xl">
                  {event.title}
                </h1>
                <div className="mx-auto flex flex-wrap justify-center gap-6 text-sm font-medium text-muted-foreground sm:text-lg">
                  <div className="flex items-center gap-2">
                    <Calendar className="h-5 w-5 text-primary" />
                    {dateRange}
                  </div>
                </div>
              </div>
            </div>

            <div className="flex flex-col items-center gap-6">
              <Button
                asChild
                size="lg"
                className="h-14 rounded-2xl bg-primary px-10 text-lg font-bold shadow-xl shadow-primary/20 transition-all hover:scale-105 hover:bg-primary/95 active:scale-95 disabled:grayscale"
                disabled={!signupOpen}
              >
                <Link href={`/signup/${event.slug}`} className="flex items-center gap-2">
                  Start Registration
                  <ChevronRight className="h-5 w-5" />
                </Link>
              </Button>

              <p className="max-w-md text-sm leading-relaxed text-muted-foreground/80">
                {status.detail} Registration consists of choosing tickets, rooms, and providing attendee details.
              </p>
            </div>
          </div>
        </div>
      </section>



      {/* Support Section */}
      <section className="grid gap-6">
        <Card className="col-span-12 overflow-hidden border-none bg-card/40 p-1 shadow-lg">
          <div className="flex h-full flex-col items-center justify-center rounded-[calc(var(--radius)-1px)] bg-card p-10 text-center ring-1 ring-border/50">
            <div className="mb-6 flex h-20 w-20 items-center justify-center rounded-full bg-primary/5 text-primary ring-1 ring-primary/10">
              <Tag className="h-10 w-10" />
            </div>
            <div className="space-y-4">
              <h3 className="text-2xl font-black tracking-tight text-foreground">Need help?</h3>
              <p className="mx-auto max-w-xs text-sm leading-relaxed text-muted-foreground">
                If you encounter any issues during the registration process, please contact our support team.
              </p>
              <Button variant="outline" className="h-12 w-full rounded-2xl border-primary/20 bg-primary/5 text-primary hover:bg-primary/10">
                Contact Support
              </Button>
            </div>
          </div>
        </Card>
      </section>
    </main>
  )
}
