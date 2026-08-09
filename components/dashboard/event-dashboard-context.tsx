"use client"

import { createContext, useContext, type ReactNode } from "react"
import type { Id } from "@/convex/_generated/dataModel"

type EventDashboardEvent = {
  _id: Id<"events">
  slug: string
  title: string
  isPublished: boolean
  isSignupOpen: boolean
  accommodationEnabled: boolean
  currency: string
  startsAt: number
  endsAt?: number
  timezone: string
  defaultRoomTypeId?: Id<"accommodationRoomTypes">
}

type EventDashboardContextValue = {
  slug: string
  event: EventDashboardEvent
}

const EventDashboardContext = createContext<EventDashboardContextValue | null>(
  null
)

export function EventDashboardProvider({
  slug,
  event,
  children,
}: EventDashboardContextValue & { children: ReactNode }) {
  return (
    <EventDashboardContext.Provider value={{ slug, event }}>
      {children}
    </EventDashboardContext.Provider>
  )
}

export function useEventDashboard() {
  const context = useContext(EventDashboardContext)

  if (!context) {
    throw new Error(
      "useEventDashboard must be used within an EventDashboardProvider"
    )
  }

  return context
}

export type { EventDashboardEvent }
