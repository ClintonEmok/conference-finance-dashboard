import { redirect } from "next/navigation"

import { donationsHref } from "@/lib/dashboard/workspace-routes"

/**
 * LEGACY SINGULAR SHIM — `/donation` and `/donations` are DISTINCT routes.
 *
 * The plural `/donations` is the real page (Phase 58); this singular path is
 * the pre-Phase-58 bookmark and keeps resolving outward to it with every
 * non-`tab` param forwarded (the earlier shim forwarded none). It must never
 * alias onto itself and never set a `tab` param, so no pair can bounce.
 */
export default async function LegacyDonationPage({
  params,
  searchParams,
}: {
  params: Promise<{ slug: string }>
  searchParams?: Promise<Record<string, string | string[] | undefined>>
}) {
  const { slug } = await params
  const query = await searchParams

  const forwarded = new URLSearchParams()
  for (const [key, value] of Object.entries(query ?? {})) {
    if (key === "tab") continue
    if (typeof value === "string") forwarded.append(key, value)
    else if (Array.isArray(value))
      for (const item of value) forwarded.append(key, item)
  }

  const base = donationsHref(slug)
  const queryString = forwarded.toString()
  redirect(queryString ? `${base}?${queryString}` : base)
}
