"use client"

import { useParams } from "next/navigation"
import { CommunicationsWorkspace } from "@/components/dashboard/communications/communications-workspace"

export default function CommunicationsPage() {
  const { slug } = useParams<{ slug: string }>()
  return <CommunicationsWorkspace slug={slug} />
}
