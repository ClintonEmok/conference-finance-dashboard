"use client"

import LegacyAllocationPage from "@/app/dashboard/events/[slug]/accommodation/allocation/page"

export function AccommodationAllocationTab({ slug }: { slug: string }) {
  return <LegacyAllocationPage params={Promise.resolve({ slug })} />
}
