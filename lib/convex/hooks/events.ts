"use client"

import { useQuery, useMutation } from "convex/react"
import { api } from "convex/functions/_generated/api"

export function useEvents() {
  return useQuery(api.events.getEvents)
}

export function useEventById(eventId: string) {
  return useQuery(api.events.getEventById, { eventId: eventId as any })
}

export function useEventByProviderId(providerEventId: string) {
  return useQuery(api.events.getEventByProviderId, { providerEventId })
}

export function useCreateEvent() {
  return useMutation(api.events.createEvent)
}

export function useUpsertEvent() {
  return useMutation(api.events.upsertEvent)
}
