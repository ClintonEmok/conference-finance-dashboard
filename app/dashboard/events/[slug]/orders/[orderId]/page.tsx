import { redirect } from "next/navigation"
import { ordersHref } from "@/lib/dashboard/workspace-routes"

export default async function LegacyOrderDetailPage({ params }: { params: Promise<{ slug: string; orderId: string }> }) {
  const { slug, orderId } = await params
  redirect(ordersHref(slug, { orderId }))
}
