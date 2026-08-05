"use client"

import { useParams } from "next/navigation"
import { FinanceWorkspace } from "@/components/dashboard/finance/finance-workspace"

export default function FinancePage() {
  const { slug } = useParams<{ slug: string }>()
  return <FinanceWorkspace slug={slug} />
}
