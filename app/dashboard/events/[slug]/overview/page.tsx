import { redirect } from "next/navigation"

export default async function LegacyOverviewPage({
  params,
  searchParams,
}: {
  params: Promise<{ slug: string }>
  searchParams: Promise<Record<string, string | string[] | undefined>>
}) {
  const { slug } = await params
  const query = await searchParams
  const search = new URLSearchParams()

  for (const [key, value] of Object.entries(query)) {
    if (Array.isArray(value)) {
      value.forEach((item) => search.append(key, item))
    } else if (value !== undefined) {
      search.set(key, value)
    }
  }

  const suffix = search.toString()
  redirect(`/dashboard/events/${slug}${suffix ? `?${suffix}` : ""}`)
}
