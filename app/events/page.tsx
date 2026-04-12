"use client"

import Link from "next/link"
import {
  AlertCircle,
  Calendar,
  ChevronRight,
  MapPin,
  ShieldCheck,
  Sparkles,
} from "lucide-react"

import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card"
import { Skeleton } from "@/components/ui/skeleton"
import { Separator } from "@/components/ui/separator"
import { usePublicSignupCatalogRaw } from "@/lib/convex/hooks/signup"
import { normalizePublicSignupCatalog } from "@/lib/domain/signup/catalog"

function formatEventDate(startsAt: number, timezone: string) {
  return new Intl.DateTimeFormat("en-GB", {
    dateStyle: "medium",
    timeStyle: "short",
    timeZone: timezone,
  }).format(new Date(startsAt))
}

function formatStatus(
  ticketCount: number,
  accommodationEligible: boolean,
  accommodationReason: string | null
) {
  if (ticketCount === 0) {
    return {
      label: "Closed",
      variant: "destructive" as const,
      detail: "No public ticket types are currently selectable.",
    }
  }

  if (accommodationReason === "event_closed") {
    return {
      label: "Signup closed",
      variant: "secondary" as const,
      detail: "Registration is not accepting new entries.",
    }
  }

  if (!accommodationEligible) {
    return {
      label: "Limited",
      variant: "outline" as const,
      detail: "Tickets are available, but accommodation is restricted.",
    }
  }

  return {
    label: "Open",
    variant: "default" as const,
    detail: "Registration is open for this event.",
  }
}

export default function PublicEventsPage() {
  const catalogRaw = usePublicSignupCatalogRaw()
  const events = normalizePublicSignupCatalog(catalogRaw)

  const isLoading = catalogRaw === undefined
  const openEvents = events.filter((event) =>
    event.tickets.some((ticket) => ticket.selectable)
  )
  const featuredEvent =
    events.find((event) => event.tickets.some((ticket) => ticket.selectable)) ??
    events[0]

  return (
    <div className="relative min-h-svh overflow-hidden bg-background text-foreground selection:bg-primary/15">
      <div className="pointer-events-none absolute inset-0">
        <div className="absolute inset-x-0 top-0 h-[28rem] bg-[radial-gradient(circle_at_top,hsl(var(--primary)/0.16),transparent_60%)]" />
        <div className="absolute top-[-7rem] left-[-6rem] h-[20rem] w-[20rem] rounded-full bg-primary/10 blur-3xl" />
        <div className="absolute top-[12rem] right-[-7rem] h-[24rem] w-[24rem] rounded-full bg-muted/80 blur-3xl" />
        <div className="absolute inset-0 bg-[linear-gradient(to_right,hsl(var(--border)/0.35)_1px,transparent_1px),linear-gradient(to_bottom,hsl(var(--border)/0.35)_1px,transparent_1px)] [mask-image:linear-gradient(to_bottom,black,transparent_82%)] bg-[size:96px_96px] opacity-40" />
      </div>

      <main className="relative mx-auto flex w-full max-w-7xl flex-col gap-12 px-4 py-10 sm:px-6 lg:px-8 lg:py-14">
        <section className="grid gap-8 lg:grid-cols-[1.1fr_0.9fr] lg:items-end">
          <div className="max-w-3xl">
            <h1 className="mt-8 text-5xl font-semibold tracking-[-0.06em] text-foreground sm:text-6xl lg:text-7xl">
              Find the event you want
              <span className="block text-muted-foreground">
                and register in a few steps.
              </span>
            </h1>

            <p className="mt-6 max-w-2xl text-base leading-8 text-muted-foreground sm:text-lg">
              Browse upcoming conference events, check whether registration is
              open, and open the event page when you’re ready to join.
            </p>

            <div className="mt-8 flex flex-wrap gap-3">
              <Button
                asChild
                className="h-12 rounded-full px-6 text-sm font-medium shadow-sm transition-transform hover:-translate-y-0.5"
              >
                <Link href="/">Back to home</Link>
              </Button>
              {featuredEvent ? (
                <Button
                  asChild
                  variant="outline"
                  className="h-12 rounded-full px-6 text-sm font-medium shadow-sm backdrop-blur"
                >
                  <Link href={`/events/${featuredEvent.slug}`}>
                    {featuredEvent.tickets.some((ticket) => ticket.selectable)
                      ? "View next open event"
                      : "View featured event"}
                  </Link>
                </Button>
              ) : null}
            </div>
          </div>

          {featuredEvent ? (
            <Card className="overflow-hidden border bg-card/85 shadow-sm backdrop-blur">
              <CardHeader className="gap-5 p-6 sm:p-8">
                <div className="flex flex-wrap items-start justify-between gap-3">
                  <div className="space-y-2">
                    <CardDescription>Featured event</CardDescription>
                    <CardTitle className="text-3xl tracking-[-0.05em] sm:text-4xl">
                      {featuredEvent.title}
                    </CardTitle>
                  </div>

                  <Badge
                    variant={
                      featuredEvent.tickets.some((ticket) => ticket.selectable)
                        ? "default"
                        : "secondary"
                    }
                    className="h-6 rounded-full px-3 text-[10px] font-semibold tracking-[0.18em] uppercase"
                  >
                    {featuredEvent.tickets.some((ticket) => ticket.selectable)
                      ? "Registration open"
                      : "Coming soon"}
                  </Badge>
                </div>

                <CardDescription className="max-w-2xl text-sm leading-7 sm:text-base">
                  {formatEventDate(
                    featuredEvent.startsAt,
                    featuredEvent.timezone
                  )}
                  {featuredEvent.endsAt
                    ? ` to ${formatEventDate(featuredEvent.endsAt, featuredEvent.timezone)}`
                    : ""}
                  .{" "}
                  {
                    formatStatus(
                      featuredEvent.tickets.filter(
                        (ticket) => ticket.selectable
                      ).length,
                      featuredEvent.accommodation.eligible,
                      featuredEvent.accommodation.reason
                    ).detail
                  }
                </CardDescription>
              </CardHeader>

              <Separator />

              <CardContent className="grid gap-4 p-6 sm:grid-cols-3 sm:p-8">
                <div className="rounded-2xl border bg-background p-4">
                  <div className="flex items-center gap-2 text-sm text-muted-foreground">
                    <Calendar className="size-4" />
                    Date
                  </div>
                  <p className="mt-2 text-sm font-medium text-foreground">
                    {formatEventDate(
                      featuredEvent.startsAt,
                      featuredEvent.timezone
                    )}
                  </p>
                </div>

                <div className="rounded-2xl border bg-background p-4">
                  <div className="flex items-center gap-2 text-sm text-muted-foreground">
                    <ShieldCheck className="size-4" />
                    Registration
                  </div>
                  <p className="mt-2 text-sm font-medium text-foreground">
                    {featuredEvent.tickets.some((ticket) => ticket.selectable)
                      ? "Open now"
                      : "Currently unavailable"}
                  </p>
                </div>

                <div className="rounded-2xl border bg-background p-4">
                  <div className="flex items-center gap-2 text-sm text-muted-foreground">
                    <MapPin className="size-4" />
                    Accommodation
                  </div>
                  <p className="mt-2 text-sm font-medium text-foreground">
                    {featuredEvent.accommodation.eligible
                      ? "Available for eligible attendees"
                      : "Limited for this event"}
                  </p>
                </div>
              </CardContent>
            </Card>
          ) : null}
        </section>

        <section className="grid gap-6">
          {isLoading ? (
            Array.from({ length: 4 }).map((_, index) => (
              <Card
                key={index}
                className="border bg-card/80 shadow-sm backdrop-blur"
              >
                <CardHeader>
                  <Skeleton className="h-4 w-24" />
                  <Skeleton className="h-7 w-52" />
                  <Skeleton className="h-4 w-full max-w-2xl" />
                </CardHeader>
                <Separator />
                <CardContent className="pt-4">
                  <div className="grid gap-3 sm:grid-cols-3">
                    <Skeleton className="h-12 rounded-xl" />
                    <Skeleton className="h-12 rounded-xl" />
                    <Skeleton className="h-12 rounded-xl" />
                  </div>
                </CardContent>
              </Card>
            ))
          ) : events.length === 0 ? (
            <Card className="border bg-card/80 shadow-sm backdrop-blur">
              <CardHeader className="items-center text-center">
                <div className="flex size-12 items-center justify-center rounded-full bg-muted text-muted-foreground">
                  <AlertCircle className="size-5" />
                </div>
                <CardTitle>No public events yet.</CardTitle>
                <CardDescription>
                  Once an event is published, it will appear here automatically.
                </CardDescription>
              </CardHeader>
            </Card>
          ) : (
            events.map((event, index) => {
              const signupOpen = event.tickets.some(
                (ticket) => ticket.selectable
              )
              const status = formatStatus(
                event.tickets.filter((ticket) => ticket.selectable).length,
                event.accommodation.eligible,
                event.accommodation.reason
              )

              return (
                <Card
                  key={event.slug}
                  className="group overflow-hidden border bg-card/85 shadow-sm backdrop-blur transition-all duration-300 hover:-translate-y-1 hover:shadow-lg"
                  style={{ animationDelay: `${index * 80}ms` }}
                >
                  <CardHeader className="gap-4 p-6 sm:p-8">
                    <div className="flex flex-wrap items-start justify-between gap-3">
                      <div className="space-y-2">
                        <CardDescription className="font-mono text-xs tracking-[0.18em] uppercase">
                          {event.slug}
                        </CardDescription>
                        <CardTitle className="text-2xl tracking-[-0.05em] sm:text-3xl">
                          {event.title}
                        </CardTitle>
                      </div>

                      <Badge
                        variant={status.variant}
                        className="h-6 rounded-full px-3 text-[10px] font-semibold tracking-[0.18em] uppercase"
                      >
                        {status.label}
                      </Badge>
                    </div>

                    <CardDescription className="max-w-2xl text-sm leading-7 sm:text-base">
                      {status.detail}
                    </CardDescription>
                  </CardHeader>

                  <Separator />

                  <CardContent className="grid gap-6 p-6 pt-5 sm:p-8 lg:grid-cols-[1.3fr_0.7fr] lg:items-center">
                    <div className="space-y-4">
                      <div className="flex flex-wrap gap-3 text-sm text-muted-foreground">
                        <div className="rounded-full border bg-background px-4 py-2">
                          <span className="font-medium text-foreground">
                            {formatEventDate(event.startsAt, event.timezone)}
                          </span>
                        </div>
                        <div className="rounded-full border bg-background px-4 py-2">
                          {event.tickets.length} ticket type
                          {event.tickets.length === 1 ? "" : "s"}
                        </div>
                        <div className="rounded-full border bg-background px-4 py-2">
                          {event.accommodation.eligible
                            ? "Accommodation available"
                            : "Accommodation limited"}
                        </div>
                      </div>

                      <div className="flex items-center gap-2 text-sm text-muted-foreground">
                        <ShieldCheck className="size-4" />
                        {signupOpen
                          ? "Open signups are available from the event detail page."
                          : "This event currently has no selectable public tickets."}
                      </div>
                    </div>

                    <div className="flex flex-col gap-3 lg:items-end">
                      <Button
                        asChild
                        className="h-11 rounded-full px-5 shadow-sm"
                      >
                        <Link
                          href={`/events/${event.slug}`}
                          className="flex items-center gap-2"
                        >
                          View details
                          <ChevronRight />
                        </Link>
                      </Button>
                    </div>
                  </CardContent>
                </Card>
              )
            })
          )}
        </section>
      </main>
    </div>
  )
}
