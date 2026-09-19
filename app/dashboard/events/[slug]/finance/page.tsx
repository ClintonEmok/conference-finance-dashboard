import { redirect } from "next/navigation"

import {
  financeTabHref,
  parseFinanceTab,
} from "@/lib/dashboard/workspace-routes"

/**
 * LEGACY REDIRECT SHELL — the inversion landed in Phase 58.
 *
 * `/finance?tab=…` is no longer a surface: `payments`, `donations` and
 * `reconciliation` are their own real event-scoped pages. This page renders
 * nothing, keeps no UI, and forwards every param except `tab` verbatim — the
 * target page owns its own query semantics, so a stray `?tab=` must never
 * reappear there. A missing or unknown tab resolves to `payments` (the
 * `defaultFinanceTab`) and the destination path always comes from
 * `financeTabHref`, the single owner of that mapping.
 */
export default async function FinanceRedirectPage({
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

  const base = financeTabHref(
    slug,
    parseFinanceTab(query as Record<string, string | undefined>)
  )
  const queryString = forwarded.toString()
  redirect(queryString ? `${base}?${queryString}` : base)
}
