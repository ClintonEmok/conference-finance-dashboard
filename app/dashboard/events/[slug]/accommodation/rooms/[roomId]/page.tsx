import { redirect } from "next/navigation"
import { accommodationHref } from "@/lib/dashboard/workspace-routes"

export default async function LegacyRoomDetailPage({ params }: { params: Promise<{ slug: string; roomId: string }> }) {
  const { slug, roomId } = await params
  redirect(accommodationHref(slug, "allocation", { roomId }))
}
