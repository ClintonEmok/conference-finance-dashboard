"use client"

import { use, useState } from "react"
import Link from "next/link"
import { useMutation } from "convex/react"
import {
  ArrowRight,
  BedDouble,
  CreditCard,
  Link2,
  Ticket,
  Users,
  type LucideIcon,
} from "lucide-react"

import { api } from "@/convex/_generated/api"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { Input } from "@/components/ui/input"
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
  const createReportShare = useMutation(api.reportShares.createEventShare)
  const [shareUrl, setShareUrl] = useState<string | null>(null)
  const [shareStatus, setShareStatus] = useState<string | null>(null)
  const [shareError, setShareError] = useState<string | null>(null)
  const [isSharing, setIsSharing] = useState(false)

  if (!event) return null

  const hasAccommodation = Boolean(event.accommodationEnabled)
  const hotelCount = accommodationSummary?.hotelsLinked ?? 0
  const slotCount = accommodationSummary?.totalSlots ?? 0
  const submissionCount = accommodationSummary?.submissionsCount ?? 0

  async function handleShareReport() {
    setIsSharing(true)
    setShareStatus(null)
    setShareError(null)

    try {
      const result = await createReportShare({ eventId: event._id })
      const reportUrl = new URL(result.path, window.location.origin).toString()
      setShareUrl(reportUrl)

      if (navigator.clipboard?.writeText) {
        await navigator.clipboard.writeText(reportUrl)
      }

      setShareStatus(
        result.reused ? "Copied the existing report link." : "Created and copied a new report link."
      )
    } catch (error) {
      setShareError(
        error instanceof Error ? error.message : "Unable to create the report link right now."
      )
    } finally {
      setIsSharing(false)
    }
  }

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

      <Card className="border-border/50 bg-background/80 shadow-sm backdrop-blur">
        <CardHeader>
          <CardTitle>Share report link</CardTitle>
          <CardDescription>
            Generate a read-only stakeholder link for the event report.
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="flex flex-col gap-3 lg:flex-row lg:items-center">
            <Input
              readOnly
              value={shareUrl ?? "No report token created yet."}
              className="h-11 rounded-xl bg-background/60 font-mono text-xs"
            />
            <Button
              type="button"
              className="h-11 rounded-xl shadow-lg shadow-primary/20"
              onClick={() => {
                void handleShareReport()
              }}
              disabled={isSharing}
            >
              <Link2 className="mr-2 size-4" />
              {isSharing ? "Preparing link…" : shareUrl ? "Copy link" : "Generate link"}
            </Button>
          </div>

          {(shareStatus || shareError) && (
            <div className="flex items-start gap-3 rounded-2xl border border-border/50 bg-muted/30 p-4 text-sm">
              <div className="mt-1 size-2 rounded-full bg-primary" />
              <div className="space-y-1">
                {shareStatus ? <p className="font-medium text-foreground">{shareStatus}</p> : null}
                {shareError ? <p className="text-muted-foreground">{shareError}</p> : null}
              </div>
            </div>
          )}
        </CardContent>
      </Card>

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
