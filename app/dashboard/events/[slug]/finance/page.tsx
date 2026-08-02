"use client"

import { use } from "react"
import { FinanceWorkspace } from "@/components/dashboard/finance/finance-workspace"

export default function FinancePage({ params }: { params: Promise<{ slug: string }> }) {
  const { slug } = use(params)
  return <FinanceWorkspace slug={slug} />
}
