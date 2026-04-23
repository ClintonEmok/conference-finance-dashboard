"use client"

import { usePathname } from "next/navigation"

type DashboardSurfaceProps = {
  children: React.ReactNode
}

const fullscreenRoutes = new Set(["/dashboard", "/dashboard/events", "/dashboard/events/new"])

function isSlugScopedEventRoute(pathname: string) {
  return /^\/dashboard\/events\/(?!new(?:\/|$))[^/]+(?:\/|$)/.test(pathname)
}

export function DashboardSurface({ children }: DashboardSurfaceProps) {
  const pathname = usePathname()

  // Fullscreen routes render without any shell chrome
  if (fullscreenRoutes.has(pathname)) {
    return <>{children}</>
  }

  // Slug-scoped event routes bypass DashboardShell — the event-local layout
  // (events/[slug]/layout.tsx) provides the single sidebar with EventSwitcher.
  // This avoids duplicate shell chrome (global shell + event-local aside).
  if (isSlugScopedEventRoute(pathname)) {
    return <>{children}</>
  }

  // All other routes get the minimal global shell (utilities only)
  return <>{children}</>
}
