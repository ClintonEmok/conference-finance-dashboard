"use client"

import { use } from "react"
import Link from "next/link"
import {
  ArrowRight,
  BedDouble,
  CreditCard,
  Ticket,
  Users,
  type LucideIcon,
} from "lucide-react"

import { useEventBySlug, useAttendeesForEvent, useTicketTypesForEvent } from "@/lib/convex/hooks/events"

function ActionCard({
  href,
  label,
  title,
  description,
  icon: Icon,
}: {
  href: string
  label: string
  title: string
  description: string
  icon: LucideIcon
}) {
  return (
    <Link
      href={href}
      className="group rounded-[1.75rem] border border-border/50 bg-background/80 p-5 shadow-sm backdrop-blur transition-all duration-200 hover:-translate-y-0.5 hover:border-primary/20 hover:bg-muted/35"
    >
      <div className="flex items-start justify-between gap-4">
        <div className="space-y-4">
          <div className="flex size-11 items-center justify-center rounded-2xl bg-primary/10 text-primary transition-colors group-hover:bg-primary group-hover:text-primary-foreground">
            <Icon className="size-5" />
          </div>

          <div>
            <p className="text-[10px] font-black tracking-[0.22em] text-muted-foreground uppercase">
              {label}
            </p>
            <h3 className="mt-2 text-lg font-semibold tracking-tight text-foreground">
              {title}
            </h3>
            <p className="mt-1 text-sm leading-6 text-muted-foreground">
              {description}
            </p>
          </div>
        </div>

        <ArrowRight className="size-4 shrink-0 text-muted-foreground transition-transform group-hover:translate-x-0.5 group-hover:text-foreground" />
      </div>
    </Link>
  )
}

export default function EventOverviewPage({
  params,
}: {
  params: Promise<{ slug: string }>
}) {
  const { slug } = use(params)
  const event = useEventBySlug(slug)
  const { attendees } = useAttendeesForEvent(event?._id)
  const { ticketTypes } = useTicketTypesForEvent(event?._id)

  if (!event) return null

  const hasAccommodation = Boolean(event.accommodationEnabled)

  return (
    <section className="space-y-6">
      <header className="space-y-3">
        <p className="text-[10px] font-black tracking-[0.24em] text-muted-foreground uppercase">
          Event home
        </p>
        <div className="flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between">
          <div className="space-y-2">
            <h2 className="text-3xl font-semibold tracking-tight text-foreground">
              {event.title}
            </h2>
            <p className="max-w-2xl text-sm leading-6 text-muted-foreground">
              Use this surface to jump into the parts that need attention.
            </p>
          </div>
        </div>
      </header>

      <div className="grid gap-4 lg:grid-cols-2">
        <ActionCard
          href={`/dashboard/events/${slug}/attendees`}
          label="Contact people"
          title="Manage registrations"
          description="Review attendees, add manual entries, and keep the people list current."
          icon={Users}
        />
        <ActionCard
          href={`/dashboard/events/${slug}/tickets`}
          label="Tickets"
          title="Tune products and pricing"
          description="Adjust ticket types, availability, and any room-linked options."
          icon={Ticket}
        />
        <ActionCard
          href={`/dashboard/events/${slug}/payments`}
          label="Finance"
          title="Check payments and matching"
          description="Move into reconciliation, linked payments, and payment status work."
          icon={CreditCard}
        />
        <ActionCard
          href={hasAccommodation ? `/dashboard/events/${slug}/accommodation` : `/dashboard/events/${slug}/settings`}
          label="Accommodation"
          title={hasAccommodation ? "Room placement" : "Enable accommodation"}
          description={
            hasAccommodation
              ? "Handle room assignments, hotel links, and placement details."
              : "Turn on accommodation first, then return here to manage rooms."
          }
          icon={BedDouble}
        />
      </div>
    </section>
  )
}
