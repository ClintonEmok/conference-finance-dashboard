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

import { Badge } from "@/components/ui/badge"
import { useEventBySlug, useAttendeesForEvent, useTicketTypesForEvent } from "@/lib/convex/hooks/events"
import { useAccommodationSummaryForEvent } from "@/lib/convex/hooks/accommodation"

function ActionCard({
  href,
  label,
  title,
  description,
  icon: Icon,
  meta,
}: {
  href: string
  label: string
  title: string
  description: string
  icon: LucideIcon
  meta?: string
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

      {meta && (
        <div className="mt-5">
          <Badge variant="outline" className="rounded-full border-border/60 px-3 py-1 text-[10px] font-bold tracking-[0.18em] uppercase">
            {meta}
          </Badge>
        </div>
      )}
    </Link>
  )
}

function StatTile({
  label,
  value,
  hint,
}: {
  label: string
  value: string | number
  hint: string
}) {
  return (
    <div className="rounded-[1.5rem] border border-border/50 bg-background/65 p-4 shadow-sm">
      <p className="text-[10px] font-black tracking-[0.22em] text-muted-foreground uppercase">
        {label}
      </p>
      <p className="mt-2 text-2xl font-semibold tracking-tight text-foreground">
        {value}
      </p>
      <p className="mt-1 text-sm leading-6 text-muted-foreground">{hint}</p>
    </div>
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
  const accommodationSummary = useAccommodationSummaryForEvent(event?._id)

  if (!event) return null

  const hasAccommodation = Boolean(event.accommodationEnabled)
  const hotelCount = accommodationSummary?.hotelsLinked ?? 0
  const slotCount = accommodationSummary?.totalSlots ?? 0
  const submissionCount = accommodationSummary?.submissionsCount ?? 0

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

          <Badge
            variant="outline"
            className="w-fit rounded-full border-border/60 px-3 py-1 text-[10px] font-bold tracking-[0.2em] uppercase"
          >
            Scoped by event
          </Badge>
        </div>
      </header>

      <div className="grid gap-4 lg:grid-cols-2">
        <ActionCard
          href={`/dashboard/events/${slug}/attendees`}
          label="Contact people"
          title="Manage registrations"
          description="Review attendees, add manual entries, and keep the people list current."
          icon={Users}
          meta={`${attendees.length} in scope`}
        />
        <ActionCard
          href={`/dashboard/events/${slug}/tickets`}
          label="Tickets"
          title="Tune products and pricing"
          description="Adjust ticket types, availability, and any room-linked options."
          icon={Ticket}
          meta={`${ticketTypes.length} ticket types`}
        />
        <ActionCard
          href={`/dashboard/events/${slug}/payments`}
          label="Finance"
          title="Check payments and matching"
          description="Move into reconciliation, linked payments, and payment status work."
          icon={CreditCard}
          meta="Ledger and reconciliation"
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
          meta={hasAccommodation ? `${slotCount} slots` : "Off"}
        />
      </div>

      <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-4">
        <StatTile
          label="Contact people"
          value={attendees.length}
          hint="Registrations currently in scope."
        />
        <StatTile
          label="Ticket types"
          value={ticketTypes.length}
          hint="Products available for this event."
        />
        <StatTile
          label="Accommodation"
          value={hasAccommodation ? "On" : "Off"}
          hint={hasAccommodation ? `${slotCount} room slots available.` : "No room work yet."}
        />
        <StatTile
          label="Submissions"
          value={submissionCount}
          hint="Accommodation activity waiting to be processed."
        />
      </div>

      <div className="rounded-[1.75rem] border border-border/50 bg-background/70 p-5 shadow-sm">
        <p className="text-[10px] font-black tracking-[0.22em] text-muted-foreground uppercase">
          What changed
        </p>
        <p className="mt-2 max-w-3xl text-sm leading-6 text-muted-foreground">
          This workspace is now event-scoped with a single sidebar. The sidebar carries
          EventSwitcher, navigation, and event facts. The header strip above shows
          event title, status, and quick links.
        </p>
      </div>
    </section>
  )
}
