import { redirect } from "next/navigation"

type PageProps = {
  params: Promise<{ orderId: string }>
  searchParams?: Promise<Record<string, string | string[] | undefined>>
}

export default async function OrderDetailPage({
  params,
  searchParams,
}: PageProps) {
  const { orderId } = await params
  const query = await searchParams
  const forwarded = new URLSearchParams()
  for (const [key, value] of Object.entries(query ?? {})) {
    if (typeof value === "string") forwarded.set(key, value)
  }
  const suffix = forwarded.toString()
  redirect(
    `/dashboard/manage-orders/${encodeURIComponent(orderId)}${suffix ? `?${suffix}` : ""}`
  )
}
