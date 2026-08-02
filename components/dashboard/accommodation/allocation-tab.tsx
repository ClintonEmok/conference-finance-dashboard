"use client"

import LegacyAllocationPage from "./legacy-allocation-surface"

export function AccommodationAllocationTab({ slug, roomId }: { slug: string; roomId?: string }) {
  return <LegacyAllocationPage params={Promise.resolve({ slug })} roomId={roomId} />
}
