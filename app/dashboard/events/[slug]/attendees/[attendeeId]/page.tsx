"use client"

import { use } from "react"

import GlobalAttendeeDetailPage from "@/app/dashboard/attendees/[attendeeId]/page"

export default function EventAttendeeDetailPage({
  params,
}: {
  params: Promise<{ slug: string; attendeeId: string }>
}) {
  const { attendeeId } = use(params)

  return <GlobalAttendeeDetailPage params={Promise.resolve({ attendeeId })} />
}
