"use client"

import LegacyDonationPage from "./legacy-donations-surface"

export function FinanceDonationsTab({ slug }: { slug: string }) {
  return <LegacyDonationPage params={Promise.resolve({ slug })} />
}
