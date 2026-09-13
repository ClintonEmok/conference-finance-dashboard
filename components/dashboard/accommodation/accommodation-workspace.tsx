"use client"

import { useMemo } from "react"
import { useSearchParams } from "next/navigation"
import { useQuery } from "convex/react"
import Link from "next/link"
import { BedDouble } from "lucide-react"
import { WorkspaceFrame } from "@/components/dashboard/workspace-frame"
import { WorkspaceTabs } from "@/components/dashboard/workspace-tabs"
import { WorkspaceAttentionQueue } from "@/components/dashboard/workspace-attention-queue"
import { accommodationHref, parseAccommodationTab, readWorkspaceIntent } from "@/lib/dashboard/workspace-routes"
import { useEventDashboard } from "@/components/dashboard/event-dashboard-context"
import { createAccommodationReadPlan } from "@/lib/dashboard/accommodation-read-plan"
import { api } from "@/lib/convex/api"
import {
  buildAccommodationAttentionItems,
  type AttentionQueryState,
} from "@/lib/dashboard/workspace-attention"
import { Button } from "@/components/ui/button"
import { AccommodationHotelsTab } from "./hotels-tab"
import { AccommodationUpgradesOptionsTab } from "./upgrades-options-tab"
import type { AccommodationBoard } from "./legacy-allocation-surface"
import { readAllocationFiltersFromSearchParams } from "@/app/dashboard/accommodation/filter-state"

function toQueryState<T>(value: T | Error | undefined): AttentionQueryState<T> {
  if (value instanceof Error) return { status: "error", message: value.message }
  if (value === undefined) return { status: "pending" }
  return { status: "ready", data: value }
}

export function AccommodationWorkspace({ slug }: { slug: string }) {
  const { event } = useEventDashboard()
  const searchParams = useSearchParams()
  const activeTab = parseAccommodationTab(searchParams)
  const roomId = readWorkspaceIntent(searchParams).roomId
  const filters = readAllocationFiltersFromSearchParams(searchParams)
  const readPlan = createAccommodationReadPlan({
    enabled: event.accommodationEnabled,
    activeTab,
    filters,
    roomId,
  })

  // The room-allocation board is only queried on the Hotels & Rooms setup
  // surface. Upgrades & Options must not mount the allocation board query.
  const boardResult = useQuery(
    api.accommodation.getRoomAllocationBoard,
    event.accommodationEnabled && readPlan.readAttentionBoard
      ? { eventId: event._id }
      : "skip"
  )
  const boardState = toQueryState(
    boardResult as AccommodationBoard | Error | undefined
  )
  const attention = useMemo(() => buildAccommodationAttentionItems(
    {
      enabled: event.accommodationEnabled,
      board: boardState,
      mode: readPlan.mode,
    },
    {
      allocation: accommodationHref(slug, "allocation"),
      hotels: accommodationHref(slug, "hotels"),
    }
  ), [boardState, event.accommodationEnabled, slug, readPlan.mode])
  const tabs = useMemo(() => [
     { value: "hotels", label: "Hotels & Rooms", href: accommodationHref(slug, "hotels") },
     { value: "upgrades-options", label: "Upgrades & Options", href: accommodationHref(slug, "upgrades-options") },
  ], [slug])

  if (!event.accommodationEnabled) return <div className="rounded-xl border border-dashed p-10 text-center"><BedDouble className="mx-auto size-10 text-muted-foreground/50" /><h1 className="mt-4 text-xl font-semibold">Accommodation is disabled</h1><p className="mt-2 text-sm text-muted-foreground">Enable it in event settings before managing hotels or room allocation.</p><Button asChild className="mt-5"><Link href={`/dashboard/events/${slug}/settings`}>Open Settings</Link></Button></div>

  return <WorkspaceFrame
    title="Accommodation"
    description="Resolve setup, capacity, and attendee placement for this event."
     eventLabel={event.title}
     workspaceLabel="Accommodation"
     workspaceId="accommodation"
     activeTab={activeTab}
     summary={<WorkspaceAttentionQueue {...attention} />}
     tabs={<WorkspaceTabs workspaceId="accommodation" tabs={tabs} activeTab={activeTab} />}
  >
     {activeTab === "hotels" && <AccommodationHotelsTab slug={slug} event={event} />}
       {activeTab === "upgrades-options" && <AccommodationUpgradesOptionsTab event={event} />}
  </WorkspaceFrame>
}
