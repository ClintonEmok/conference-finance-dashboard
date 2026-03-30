"use client"

import { useQuery, useMutation } from "convex/react"
import { api } from "@/lib/convex/api"

export function useEvents() {
  return useQuery(api.events.getEvents)
}

export function useEventsForLedger() {
  return useQuery(api.events.getEventsForLedger)
}

export function useEventById(eventId: string) {
  return useQuery(api.events.getEventById, { eventId })
}

export function useEventBySlug(slug: string) {
  return useQuery(api.events.getEventBySlug, { slug })
}

export function useEventSourcesForEvent(eventId: string | undefined) {
  return useQuery(
    api.events.getEventSourcesForEvent,
    eventId ? { eventId: eventId as any } : ("skip" as any)
  )
}

// Legacy: TicketTailor-specific lookups for backward compatibility
export function useTicketTailorEventByProviderId(providerEventId: string) {
  return useQuery(api.events.getTicketTailorEventByProviderId, {
    providerEventId,
  })
}

export function useUpsertTicketTailorEvent() {
  return useMutation(api.events.upsertTicketTailorEvent)
}

// Canonical event mutations
export function useCreateEvent() {
  return useMutation(api.events.createEvent)
}

export function useUpdateEvent() {
  return useMutation(api.events.updateEvent)
}
