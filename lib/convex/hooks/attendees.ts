"use client"

import { useQuery, useMutation } from "convex/react"
import { api } from "@/lib/convex/api"
import type { Id } from "@/convex/_generated/dataModel"

export function useAttendees(args?: {
  eventId?: string
  orderId?: Id<"orders">
  genderType?: "MALE" | "FEMALE" | "MIXED" | "UNKNOWN"
  allocationPriority?: "CRITICAL" | "HIGH" | "NORMAL" | "LOW"
  assignedRoomId?: string
}) {
  return useQuery(api.attendees.getAttendees, {
    ...args,
    orderId: args?.orderId,
  })
}

export function useAttendeeById(attendeeId: string) {
  return useQuery(api.attendees.getAttendeeByStringId, {
    attendeeId,
  })
}

export function useAttendeeByEmail(email: string, eventId: string) {
  return useQuery(api.attendees.getAttendeeByEmail, { email, eventId })
}

export function useCreateAttendee() {
  return useMutation(api.attendees.createAttendee)
}

export function useUpsertAttendee() {
  return useMutation(api.attendees.upsertAttendee)
}

export function useUpdateAttendee() {
  return useMutation(api.attendees.updateAttendee)
}

export function useCheckInAttendee() {
  return useMutation(api.attendees.checkInAttendee)
}

export function useAssignRoom() {
  return useMutation(api.attendees.assignRoom)
}

export function useUnassignRoom() {
  return useMutation(api.attendees.unassignRoom)
}
