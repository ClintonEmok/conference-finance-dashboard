"use client"

import Link from "next/link"
import { use } from "react"
import { useSearchParams } from "next/navigation"

import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { formatMoney } from "@/lib/format"
import { usePublicSignupCatalog } from "@/lib/convex/hooks/signup"

type EventEntryPageProps = {
  params: Promise<{ slug: string }>
}

function formatEventDateRange(
  startsAt: number,
  endsAt: number,
  timezone: string
) {
  const formatter = new Intl.DateTimeFormat("en-GB", {
    dateStyle: "medium",
    timeStyle: "short",
    timeZone: timezone,
  })

  return `${formatter.format(new Date(startsAt))} - ${formatter.format(new Date(endsAt))}`
}

function ticketReasonCopy(reason: string | null) {
  if (reason === "sold_out") return "Sold out"
  if (reason === "disabled") return "Ticket currently unavailable"
  if (reason === "hidden") return "Ticket not publicly visible"
  if (reason === "not_on_sale") return "Ticket not on sale yet"
  return "Available"
}

function signupStatusCopy(reason: string | null) {
  if (reason === "event_closed") {
    return {
      label: "Signup closed",
      detail: "This event is no longer accepting new signups.",
    }
  }

  if (reason === "accommodation_disabled") {
    return {
      label: "Accommodation limited",
      detail:
        "Signup is open, but accommodation assignment is currently limited.",
    }
  }

  if (reason === "no_assignable_inventory") {
    return {
      label: "Limited assignment",
      detail:
        "Signup is open, but assignable accommodation slots are currently limited.",
    }
  }

  return {
    label: "Signup open",
    detail: "You can begin the guided signup flow for this event.",
  }
}

export default function EventEntryPage({ params }: EventEntryPageProps) {
  const { slug } = use(params)
  const searchParams = useSearchParams()
  const catalog = usePublicSignupCatalog()
  const event = catalog.find((entry) => entry.slug === slug)
  const restoreIntent = searchParams.get("restore")

  if (!event) {
    return (
      <main className="mx-auto flex min-h-svh w-full max-w-3xl items-center justify-center p-6">
        <Card className="w-full">
          <CardHeader>
            <CardTitle>Event not found</CardTitle>
          </CardHeader>
          <CardContent className="space-y-4 text-sm text-muted-foreground">
            <p>
              We couldn&apos;t find that event slug in the public signup
              catalog.
            </p>
            <Button asChild>
              <Link href="/">Back to home</Link>
            </Button>
          </CardContent>
        </Card>
      </main>
    )
  }

  const signupOpen = event.tickets.some((ticket) => ticket.selectable)
  const status = signupStatusCopy(event.accommodation.reason)

  return (
    <main className="mx-auto w-full max-w-5xl space-y-6 p-6">
      <Card>
        <CardHeader className="space-y-2">
          <Badge variant={signupOpen ? "default" : "outline"}>
            {status.label}
          </Badge>
          <CardTitle className="text-2xl">{event.title}</CardTitle>
          <p className="text-sm text-muted-foreground">
            {formatEventDateRange(event.startsAt, event.endsAt, event.timezone)}
          </p>
          <p className="text-sm text-muted-foreground">
            Location details will be shared after signup confirmation.
          </p>
          <p className="text-sm text-muted-foreground">{status.detail}</p>
          <p className="text-sm text-muted-foreground">
            Public signup flow: Tickets -&gt; Rooms -&gt; Attendee details -&gt;
            Review &amp; submit
          </p>
          <div>
            <Button asChild disabled={!signupOpen}>
              <Link href={`/signup/${event.slug}`}>Start signup</Link>
            </Button>
          </div>
          {restoreIntent ? (
            <div className="rounded-lg border border-border/70 p-3 text-sm text-muted-foreground">
              <p className="font-medium text-foreground">
                A previous submission was found for this event.
              </p>
              <p className="mt-1">
                Choose whether to continue the previous submission or edit
                current details.
              </p>
              <div className="mt-3 flex flex-wrap gap-2">
                <Button asChild size="sm" variant="secondary">
                  <Link href={`/signup/${event.slug}?restore=continue`}>
                    Continue previous submission
                  </Link>
                </Button>
                <Button asChild size="sm" variant="outline">
                  <Link href={`/signup/${event.slug}?restore=edit`}>
                    Edit current details
                  </Link>
                </Button>
              </div>
            </div>
          ) : null}
        </CardHeader>
      </Card>

      <section className="grid gap-4 md:grid-cols-2">
        {event.tickets.map((ticket) => (
          <Card key={ticket.ticketTypeId}>
            <CardHeader>
              <CardTitle className="text-base">{ticket.label}</CardTitle>
              <p className="text-sm text-muted-foreground">
                {formatMoney(ticket.priceMinor)}
              </p>
            </CardHeader>
            <CardContent className="flex items-center justify-between">
              <Badge variant={ticket.selectable ? "default" : "outline"}>
                {ticket.selectable ? "Selectable" : "Unavailable"}
              </Badge>
              <p className="text-xs text-muted-foreground">
                {ticketReasonCopy(ticket.reason)}
              </p>
            </CardContent>
          </Card>
        ))}
      </section>

      {event.accommodation.eligible ? (
        <Card>
          <CardHeader>
            <CardTitle className="text-base">Accommodation context</CardTitle>
          </CardHeader>
          <CardContent className="space-y-2 text-sm text-muted-foreground">
            <p>Bed assignment is part of signup for this event.</p>
            <p>Unassigned beds may be random-filled by another attendee.</p>
          </CardContent>
        </Card>
      ) : null}
    </main>
  )
}
