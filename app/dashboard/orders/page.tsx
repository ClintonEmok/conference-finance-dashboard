import { redirect } from "next/navigation"

type PageProps = {
  searchParams?: Promise<Record<string, string | string[] | undefined>>
}

export default async function OrdersPage({ searchParams }: PageProps) {
  const query = await searchParams
  const forwarded = new URLSearchParams()
  for (const [key, value] of Object.entries(query ?? {})) {
    if (typeof value === "string") forwarded.set(key, value)
  }
  const suffix = forwarded.toString()
  redirect(`/dashboard/manage-orders${suffix ? `?${suffix}` : ""}`)
}
