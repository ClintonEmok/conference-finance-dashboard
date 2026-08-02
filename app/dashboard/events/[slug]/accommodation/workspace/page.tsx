import { redirect } from "next/navigation"
import { accommodationHref } from "@/lib/dashboard/workspace-routes"

export default async function LegacyAccommodationWorkspacePage({ params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params
  redirect(accommodationHref(slug, "hotels"))
}
