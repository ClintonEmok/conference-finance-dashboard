"use client"

import { use } from "react"
import Link from "next/link"
import { format } from "date-fns"
import {
  ArrowRight,
  BedDouble,
  Calendar,
  CreditCard,
  Ticket,
  Users,
} from "lucide-react"

import { Button } from "@/components/ui/button"
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card"
import { Badge } from "@/components/ui/badge"
import { useEventBySlug, useAttendeesForEvent, useTicketTypesForEvent } from "@/lib/convex/hooks/events"
import { useAccommodationSummaryForEvent } from "@/lib/convex/hooks/accommodation"

export default function EventOverviewPage({
  params,
}: {
  params: Promise<{ slug: string }>
}) {
  const { slug } = use(params)
  const event = useEventBySlug(slug)
  const { attendees } = useAttendeesForEvent(event?._id)
  const { ticketTypes } = useTicketTypesForEvent(event?._id)
  const accommodationSummary = useAccommodationSummaryForEvent(event?._id)

  if (!event) return null

  const hasAccommodation = Boolean(event.accommodationEnabled)
  const hotelCount = accommodationSummary?.hotelsLinked ?? 0
  const slotCount = accommodationSummary?.totalSlots ?? 0
  const submissionCount = accommodationSummary?.submissionsCount ?? 0

  return (
    <div className="space-y-6">
      <Card className="border-white/40 bg-white/40 shadow-sm backdrop-blur dark:border-white/10 dark:bg-black/20">
        <CardHeader>
          <div className="flex flex-col gap-4 lg:flex-row lg:items-start lg:justify-between">
            <div className="space-y-3">
              <p className="text-[10px] font-black tracking-[0.22em] text-muted-foreground uppercase">
                Event hub
              </p>
              <CardTitle className="text-3xl font-bold tracking-tight">
                {event.title}
              </CardTitle>
              <CardDescription className="max-w-2xl text-muted-foreground/80">
                Use this surface to jump into the event overview, manage contact
                people, review tickets, and keep finance and accommodation work
                close at hand.
              </CardDescription>
            </div>

            <div className="flex flex-wrap gap-3">
              <Button asChild className="rounded-xl shadow-lg shadow-primary/20">
                <Link href={`/dashboard/events/${slug}/overview`}>
                  Open overview
                </Link>
              </Button>
              <Button asChild variant="outline" className="rounded-xl">
                <Link href={`/dashboard/events/${slug}/attendees`}>
                  Contact people
                </Link>
              </Button>
              <Button asChild variant="outline" className="rounded-xl">
                <Link href={`/dashboard/events/${slug}/settings`}>
                  Edit event
                </Link>
              </Button>
            </div>
          </div>
        </CardHeader>
      </Card>

      <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-4">
        {[
          {
            label: "Contact people",
            value: attendees.length,
            desc: "Registrations in scope",
            icon: Users,
          },
          {
            label: "Ticket types",
            value: ticketTypes.length,
            desc: "Pricing and product setup",
            icon: Ticket,
          },
          {
            label: "Hotels linked",
            value: hasAccommodation ? hotelCount : "Off",
            desc: hasAccommodation
              ? `${slotCount} room slots`
              : "Accommodation disabled",
            icon: BedDouble,
          },
          {
            label: "Submissions",
            value: hasAccommodation ? submissionCount : "—",
            desc: "Accommodation activity",
            icon: CreditCard,
          },
        ].map((stat) => {
          const Icon = stat.icon

          return (
            <Card
              key={stat.label}
              className="border-white/40 bg-white/40 shadow-sm backdrop-blur dark:border-white/10 dark:bg-black/20"
            >
              <CardContent className="flex items-start justify-between gap-4 p-6">
                <div className="space-y-2">
                  <p className="text-[10px] font-black tracking-[0.22em] text-muted-foreground uppercase">
                    {stat.label}
                  </p>
                  <p className="text-3xl font-bold tracking-tight text-foreground">
                    {stat.value}
                  </p>
                  <p className="text-xs text-muted-foreground">{stat.desc}</p>
                </div>
                <div className="flex size-10 shrink-0 items-center justify-center rounded-xl bg-primary/10 text-primary">
                  <Icon className="size-5" />
                </div>
              </CardContent>
            </Card>
          )
        })}
      </div>

      <div className="grid gap-6 xl:grid-cols-2">
        <Card className="border-white/40 bg-white/40 shadow-sm backdrop-blur dark:border-white/10 dark:bg-black/20">
          <CardHeader>
            <CardTitle>Quick routes</CardTitle>
            <CardDescription>
              Move from the event hub into the right operator surface.
            </CardDescription>
          </CardHeader>
          <CardContent className="grid gap-3 sm:grid-cols-2">
            {[
              {
                href: `/dashboard/events/${slug}/overview`,
                title: "Event overview",
                desc: "Totals, status mix, and drilldowns.",
              },
              {
                href: `/dashboard/events/${slug}/attendees`,
                title: "Contact people",
                desc: "Review names, emails, and follow-up.",
              },
              {
                href: `/dashboard/events/${slug}/tickets`,
                title: "Tickets",
                desc: "Adjust products and pricing.",
              },
              {
                href: `/dashboard/events/${slug}/payments`,
                title: "Finance",
                desc: "Track collections and matching.",
              },
              {
                href: hasAccommodation
                  ? `/dashboard/events/${slug}/accommodation`
                  : `/dashboard/events/${slug}/settings`,
                title: hasAccommodation ? "Rooms" : "Settings",
                desc: hasAccommodation
                  ? "Room placement and hotel links."
                  : "Enable accommodation first.",
              },
              {
                href: `/dashboard/events/${slug}/settings`,
                title: "Edit event",
                desc: "Adjust the event configuration.",
              },
            ].map((item) => (
              <Link
                key={item.title}
                href={item.href}
                className="group rounded-2xl border border-border/50 bg-background/50 p-4 transition-all hover:border-primary/40 hover:bg-muted/30"
              >
                <div className="flex items-start justify-between gap-3">
                  <div>
                    <h3 className="font-bold text-foreground group-hover:text-primary">
                      {item.title}
                    </h3>
                    <p className="mt-1 text-xs text-muted-foreground">
                      {item.desc}
                    </p>
                  </div>
                  <ArrowRight className="size-4 text-muted-foreground transition-transform group-hover:translate-x-0.5 group-hover:text-foreground" />
                </div>
              </Link>
            ))}
          </CardContent>
        </Card>

        <Card className="border-white/40 bg-white/40 shadow-sm backdrop-blur dark:border-white/10 dark:bg-black/20">
          <CardHeader>
            <CardTitle>Event context</CardTitle>
            <CardDescription>
              The basics operators need before they drill down.
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="flex items-center justify-between border-b border-border/40 py-2">
              <span className="text-sm text-muted-foreground">Start</span>
              <span className="text-sm font-medium">
                {format(new Date(event.startsAt), "PPP p")}
              </span>
            </div>
            <div className="flex items-center justify-between border-b border-border/40 py-2">
              <span className="text-sm text-muted-foreground">Timezone</span>
              <span className="text-sm font-medium">{event.timezone}</span>
            </div>
            <div className="flex items-center justify-between border-b border-border/40 py-2">
              <span className="text-sm text-muted-foreground">Currency</span>
              <span className="text-sm font-medium">{event.currency}</span>
            </div>
            <div className="flex items-center justify-between py-2">
              <span className="text-sm text-muted-foreground">Accommodation</span>
              <span className="text-sm font-medium">
                {hasAccommodation ? "Enabled" : "Disabled"}
              </span>
            </div>
            <Badge variant="outline" className="mt-2">
              ID: {event.slug}
            </Badge>
          </CardContent>
        </Card>
      </div>
    </div>
  )
}
