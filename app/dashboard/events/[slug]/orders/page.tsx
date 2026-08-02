import { redirect } from "next/navigation"
import { financeHref } from "@/lib/dashboard/workspace-routes"

export default async function LegacyOrdersPage({ params, searchParams }: { params: Promise<{ slug: string }>; searchParams?: Promise<Record<string, string | string[] | undefined>> }) {
  const { slug } = await params
  const query = await searchParams
  const href = new URL(financeHref(slug, "orders"), "http://workspace.local")
  for (const [key, value] of Object.entries(query ?? {})) if (key !== "tab" && typeof value === "string") href.searchParams.set(key, value)
  redirect(`${href.pathname}?${href.searchParams.toString()}`)
}
