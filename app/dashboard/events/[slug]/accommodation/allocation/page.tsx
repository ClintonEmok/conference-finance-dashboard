import { redirect } from "next/navigation"
import { accommodationHref } from "@/lib/dashboard/workspace-routes"

export default async function LegacyAllocationPage({ params, searchParams }: { params: Promise<{ slug: string }>; searchParams: Promise<Record<string, string | string[] | undefined>> }) {
  const { slug } = await params
  const input = await searchParams
  const roomId = Array.isArray(input.roomId) ? input.roomId[0] : input.roomId
  redirect(accommodationHref(slug, "allocation", roomId ? { roomId } : undefined))
}
