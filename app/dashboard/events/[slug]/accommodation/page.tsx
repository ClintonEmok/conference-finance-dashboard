"use client"

import { useParams } from "next/navigation"
import { AccommodationWorkspace } from "@/components/dashboard/accommodation/accommodation-workspace"

export default function EventAccommodationPage() {
  const { slug } = useParams<{ slug: string }>()
  return <AccommodationWorkspace slug={slug} />
}
