"use client"

import { useParams } from "next/navigation"

import { DonationDetailSurface } from "@/components/dashboard/finance/donation-detail-surface"

/**
 * The dedicated donation detail route (D-01). It never redirects — the list
 * page adopts the legacy `?donationId=` intent onto this route, so a redirect
 * here would create the loop the phase forbids.
 */
export default function DonationDetailPage() {
  const { slug, donationId } = useParams<{ slug: string; donationId: string }>()

  return <DonationDetailSurface slug={slug} donationId={donationId} />
}
