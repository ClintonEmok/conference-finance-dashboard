"use client"

import { useParams } from "next/navigation"
import { OrdersWorkspace } from "@/components/dashboard/orders/orders-workspace"

export default function OrdersPage() {
  const { slug } = useParams<{ slug: string }>()
  return <OrdersWorkspace slug={slug} />
}
