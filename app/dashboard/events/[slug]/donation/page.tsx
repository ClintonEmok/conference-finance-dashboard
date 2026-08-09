import { redirect } from "next/navigation"
import { financeHref } from "@/lib/dashboard/workspace-routes"

export default async function LegacyDonationPage({ params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params
  redirect(financeHref(slug, "donations"))
}
