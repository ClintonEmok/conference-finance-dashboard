"use client"

import LegacyAccommodationPage from "./legacy-hotels-surface"

export function AccommodationHotelsTab({ slug }: { slug: string }) {
  return <LegacyAccommodationPage params={Promise.resolve({ slug })} />
}
