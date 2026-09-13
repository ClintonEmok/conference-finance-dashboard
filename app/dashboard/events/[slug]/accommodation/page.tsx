import { redirect } from "next/navigation"
import { AccommodationWorkspace } from "@/components/dashboard/accommodation/accommodation-workspace"
import { accommodationHref } from "@/lib/dashboard/workspace-routes"

export default async function EventAccommodationPage({
  params,
  searchParams,
}: {
  params: Promise<{ slug: string }>
  searchParams: Promise<Record<string, string | string[] | undefined>>
}) {
  const [{ slug }, input] = await Promise.all([params, searchParams])
  const tab = Array.isArray(input.tab) ? input.tab[0] : input.tab
  const roomId = Array.isArray(input.roomId) ? input.roomId[0] : input.roomId

  if (tab === "allocation" || roomId) {
    const query = new URLSearchParams()
    for (const [key, value] of Object.entries(input)) {
      if (key === "tab") continue
      const firstValue = Array.isArray(value) ? value[0] : value
      if (firstValue !== undefined) query.set(key, firstValue)
    }
    const queryString = query.toString()
    redirect(`${accommodationHref(slug, "allocation")}${queryString ? `?${queryString}` : ""}`)
  }

  return <AccommodationWorkspace slug={slug} />
}
