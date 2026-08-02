"use client"

import LegacyAllocationPage from "./legacy-allocation-surface"
import type { EventDashboardEvent } from "@/components/dashboard/event-dashboard-context"
import type { AttentionQueryState } from "@/lib/dashboard/workspace-attention"
import type { AccommodationReadPlan } from "@/lib/dashboard/accommodation-read-plan"
import type { AccommodationBoard } from "./legacy-allocation-surface"

export function AccommodationAllocationTab({ slug, event, roomId, parentBoard, readPlan }: {
  slug: string
  event: EventDashboardEvent
  roomId?: string | null
  parentBoard: AttentionQueryState<AccommodationBoard>
  readPlan: AccommodationReadPlan
}) {
  return <LegacyAllocationPage params={Promise.resolve({ slug })} event={event} roomId={roomId ?? undefined} parentBoard={parentBoard} readPlan={readPlan} />
}
