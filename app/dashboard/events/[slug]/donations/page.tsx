"use client"

import { useParams } from "next/navigation"
import { DonationsWorkspace } from "@/components/dashboard/finance/donations-workspace"

export default function DonationsPage() {
  const { slug } = useParams<{ slug: string }>()
  return <DonationsWorkspace slug={slug} />
}
