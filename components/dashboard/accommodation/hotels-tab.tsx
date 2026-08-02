"use client"

import LegacyAccommodationPage from "@/app/dashboard/events/[slug]/accommodation/page"

export function AccommodationHotelsTab({ slug }: { slug: string }) {
  return <LegacyAccommodationPage params={Promise.resolve({ slug })} />
}
