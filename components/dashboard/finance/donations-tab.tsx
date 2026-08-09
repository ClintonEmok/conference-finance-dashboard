"use client"

import LegacyDonationPage from "./legacy-donations-surface"
import type { EventDashboardEvent } from "@/components/dashboard/event-dashboard-context"

export function FinanceDonationsTab({ slug, event }: { slug: string; event: EventDashboardEvent }) {
  return <LegacyDonationPage slug={slug} event={event} />
}
