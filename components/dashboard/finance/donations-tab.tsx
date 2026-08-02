"use client"

import LegacyDonationPage from "@/app/dashboard/events/[slug]/donation/page"

export function FinanceDonationsTab({ slug }: { slug: string }) {
  return <LegacyDonationPage params={Promise.resolve({ slug })} />
}
