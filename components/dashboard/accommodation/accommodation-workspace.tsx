"use client"

import { useMemo } from "react"
import { useSearchParams } from "next/navigation"
import Link from "next/link"
import { BedDouble } from "lucide-react"
import { WorkspaceFrame } from "@/components/dashboard/workspace-frame"
import { WorkspaceTabs } from "@/components/dashboard/workspace-tabs"
import { WorkspaceAttentionQueue } from "@/components/dashboard/workspace-attention-queue"
import { accommodationHref, parseAccommodationTab } from "@/lib/dashboard/workspace-routes"
import { useEventBySlug } from "@/lib/convex/hooks/events"
import { Skeleton } from "@/components/ui/skeleton"
import { Button } from "@/components/ui/button"
import { AccommodationHotelsTab } from "./hotels-tab"
import { AccommodationAllocationTab } from "./allocation-tab"

export function AccommodationWorkspace({ slug }: { slug: string }) {
  const event = useEventBySlug(slug)
  const searchParams = useSearchParams()
  const activeTab = parseAccommodationTab(searchParams)
  const tabs = useMemo(() => [
    { value: "hotels", label: "Hotels", href: accommodationHref(slug, "hotels") },
    { value: "allocation", label: "Allocation", href: accommodationHref(slug, "allocation") },
  ], [slug])

  if (event === undefined) return <Skeleton className="h-96 w-full rounded-xl" />
  if (event === null) return <div className="rounded-xl border p-8 text-center"><h1 className="font-semibold">Event not found</h1></div>
  if (!event.accommodationEnabled) return <div className="rounded-xl border border-dashed p-10 text-center"><BedDouble className="mx-auto size-10 text-muted-foreground/50" /><h1 className="mt-4 text-xl font-semibold">Accommodation is disabled</h1><p className="mt-2 text-sm text-muted-foreground">Enable it in event settings before managing hotels or room allocation.</p><Button asChild className="mt-5"><Link href={`/dashboard/events/${slug}/settings`}>Open Settings</Link></Button></div>

  return <WorkspaceFrame
    title="Accommodation"
    description="Resolve setup, capacity, and attendee placement from one event-scoped workspace."
    eventLabel={event.title}
    workspaceLabel="Accommodation"
    summary={<WorkspaceAttentionQueue items={[{ id: "allocation", label: "Placement inbox", detail: "Review attendees waiting for a room and available capacity.", href: accommodationHref(slug, "allocation"), tone: "urgent" }, { id: "hotels", label: "Hotel setup", detail: "Link hotels and configure rooms when inventory is missing.", href: accommodationHref(slug, "hotels") }]} />}
    tabs={<WorkspaceTabs tabs={tabs} activeTab={activeTab} />}
  >
    {activeTab === "hotels" && <AccommodationHotelsTab slug={slug} />}
    {activeTab === "allocation" && <AccommodationAllocationTab slug={slug} />}
  </WorkspaceFrame>
}
