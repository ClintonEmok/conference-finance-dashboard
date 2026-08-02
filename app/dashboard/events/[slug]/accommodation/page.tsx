"use client"

import { use } from "react"
import { AccommodationWorkspace } from "@/components/dashboard/accommodation/accommodation-workspace"

export default function EventAccommodationPage({
  params,
}: {
  params: Promise<{ slug: string }>
}) {
  const { slug } = use(params)
  return <AccommodationWorkspace slug={slug} />
}
