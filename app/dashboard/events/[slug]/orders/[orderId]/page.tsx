import { redirect } from "next/navigation"
import { financeHref } from "@/lib/dashboard/workspace-routes"

export default async function LegacyOrderDetailPage({ params }: { params: Promise<{ slug: string; orderId: string }> }) {
  const { slug, orderId } = await params
  redirect(financeHref(slug, "orders", { orderId }))
}
