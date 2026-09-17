"use client"

import { useParams } from "next/navigation"
import { PaymentsWorkspace } from "@/components/dashboard/finance/payments-workspace"

export default function PaymentsPage() {
  const { slug } = useParams<{ slug: string }>()
  return <PaymentsWorkspace slug={slug} />
}
