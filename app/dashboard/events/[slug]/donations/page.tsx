"use client"

import { useEffect } from "react"
import { useParams, useRouter, useSearchParams } from "next/navigation"

import { DonationsWorkspace } from "@/components/dashboard/finance/donations-workspace"
import { donationDetailHref } from "@/lib/dashboard/workspace-routes"

/**
 * The donations list resolves the legacy `?donationId=` intent onto the
 * dedicated detail route (D-01). This page is the ONLY resolver of the query
 * form: it emits the route form exactly once and never points back at itself,
 * so a legacy/bookmarked chain cannot loop. Every hook runs before the early
 * return; while the adoption is in flight the page renders nothing rather than
 * flashing the list. `orderId` / `attendeeId` are tolerated by the workspace's
 * absence of any search-param read — never filtered.
 */
export default function DonationsPage() {
  const { slug } = useParams<{ slug: string }>()
  const router = useRouter()
  const searchParams = useSearchParams()

  const donationId = searchParams.get("donationId")

  useEffect(() => {
    if (donationId === null) return
    router.replace(donationDetailHref(slug, donationId))
  }, [donationId, router, slug])

  if (donationId !== null) return null

  return <DonationsWorkspace slug={slug} />
}
