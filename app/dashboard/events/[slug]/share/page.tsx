import { redirect } from "next/navigation"

export default async function LegacySharePage({
  params,
  searchParams,
}: {
  params: Promise<{ slug: string }>
  searchParams: Promise<Record<string, string | string[] | undefined>>
}) {
  const { slug } = await params
  const query = await searchParams
  const search = new URLSearchParams({ sharing: "1" })

  for (const [key, value] of Object.entries(query)) {
    if (Array.isArray(value)) {
      value.forEach((item) => search.append(key, item))
    } else if (value !== undefined) {
      search.set(key, value)
    }
  }

  redirect(`/dashboard/events/${slug}/settings?${search.toString()}#sharing`)
}
