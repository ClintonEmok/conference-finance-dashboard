"use client"

import { use } from "react"

import AttendeeDetailSurface from "@/components/dashboard/attendee-detail-surface"

export default function EventAttendeeDetailPage({
  params,
}: {
  params: Promise<{ slug: string; attendeeId: string }>
}) {
  const { slug, attendeeId } = use(params)

  return <AttendeeDetailSurface eventSlug={slug} params={Promise.resolve({ attendeeId })} />
}
