"use client"

import LegacyAllocationPage from "./legacy-allocation-surface"

export function AccommodationAllocationTab({ slug }: { slug: string }) {
  return <LegacyAllocationPage params={Promise.resolve({ slug })} />
}
