import { redirect } from "next/navigation"
import { accommodationHref, parseAccommodationTab, readWorkspaceIntent } from "@/lib/dashboard/workspace-routes"

export default async function LegacyAccommodationWorkspacePage({ params, searchParams }: { params: Promise<{ slug: string }>; searchParams: Promise<Record<string, string | string[] | undefined>> }) {
  const { slug } = await params
  const input = await searchParams
  const query = Object.fromEntries(Object.entries(input).map(([key, value]) => [key, Array.isArray(value) ? value[0] : value]))
  const intent = readWorkspaceIntent(query)
  const tab = intent.roomId ? "allocation" : parseAccommodationTab(query)
  redirect(accommodationHref(slug, tab, intent.roomId ? { roomId: intent.roomId } : undefined))
}
