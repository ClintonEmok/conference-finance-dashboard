"use client"

import { usePathname } from "next/navigation"

import { DashboardShell } from "@/app/dashboard/dashboard-shell"

type DashboardSurfaceProps = {
  userEmail: string
  children: React.ReactNode
}

const fullscreenRoutes = new Set(["/dashboard", "/dashboard/events", "/dashboard/events/new"])

function isSlugScopedEventRoute(pathname: string) {
  return /^\/dashboard\/events\/(?!new(?:\/|$))[^/]+(?:\/|$)/.test(pathname)
}

export function DashboardSurface({ userEmail, children }: DashboardSurfaceProps) {
  const pathname = usePathname()

  if (fullscreenRoutes.has(pathname) || !isSlugScopedEventRoute(pathname)) {
    return <>{children}</>
  }

  return <DashboardShell userEmail={userEmail}>{children}</DashboardShell>
}
