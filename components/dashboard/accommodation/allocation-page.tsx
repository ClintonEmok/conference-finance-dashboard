"use client"

import { useSearchParams } from "next/navigation"
import Link from "next/link"
import { useQuery } from "convex/react"
import { BedDouble } from "lucide-react"

import { Button } from "@/components/ui/button"
import { WorkspaceFrame } from "@/components/dashboard/workspace-frame"
import { useEventDashboard } from "@/components/dashboard/event-dashboard-context"
import { api } from "@/lib/convex/api"
import { readWorkspaceIntent } from "@/lib/dashboard/workspace-routes"
import { createAccommodationReadPlan } from "@/lib/dashboard/accommodation-read-plan"
import { readAllocationFiltersFromSearchParams } from "@/app/dashboard/accommodation/filter-state"
import type { AttentionQueryState } from "@/lib/dashboard/workspace-attention"
import LegacyAllocationPage, {
  type AccommodationBoard,
} from "./legacy-allocation-surface"

function toQueryState<T>(value: T | Error | undefined): AttentionQueryState<T> {
  if (value instanceof Error) return { status: "error", message: value.message }
  if (value === undefined) return { status: "pending" }
  return { status: "ready", data: value }
}

export function AccommodationAllocationPage({ slug }: { slug: string }) {
  const { event } = useEventDashboard()
  const searchParams = useSearchParams()
  const roomId = readWorkspaceIntent(searchParams).roomId
  const filters = readAllocationFiltersFromSearchParams(searchParams)
  const readPlan = createAccommodationReadPlan({
    enabled: event.accommodationEnabled,
    activeTab: "allocation",
    filters,
    roomId,
  })
  const boardResult = useQuery(
    api.accommodation.getRoomAllocationBoard,
    event.accommodationEnabled && readPlan.readAttentionBoard
      ? { eventId: event._id }
      : "skip"
  )
  const parentBoard = toQueryState(
    boardResult as AccommodationBoard | Error | undefined
  )

  if (!event.accommodationEnabled) {
    return (
      <div className="rounded-xl border border-dashed p-10 text-center">
        <BedDouble className="mx-auto size-10 text-muted-foreground/50" />
        <h1 className="mt-4 text-xl font-semibold">Accommodation is disabled</h1>
        <p className="mt-2 text-sm text-muted-foreground">
          Enable it in event settings before managing room allocation.
        </p>
        <Button asChild className="mt-5">
          <Link href={`/dashboard/events/${slug}/settings`}>Open Settings</Link>
        </Button>
      </div>
    )
  }

  return (
    <WorkspaceFrame
      title="Allocation"
      description="Place attendees and resolve room capacity for this event."
      eventLabel={event.title}
      workspaceLabel="Accommodation"
      workspaceId="accommodation"
      activeTab="allocation"
    >
      <LegacyAllocationPage
        params={Promise.resolve({ slug })}
        event={event}
        roomId={roomId}
        parentBoard={parentBoard}
        readPlan={readPlan}
      />
    </WorkspaceFrame>
  )
}
