import { headers } from "next/headers"
import { redirect } from "next/navigation"

import { DashboardShell } from "@/app/dashboard/dashboard-shell"
import { auth } from "@/lib/auth"

type DashboardLayoutProps = {
  children: React.ReactNode
}

export default async function DashboardLayout({ children }: DashboardLayoutProps) {
  const requestHeaders = await headers()
  const session = await auth.api.getSession({
    headers: requestHeaders,
  })

  if (!session) {
    redirect("/login?callbackUrl=%2Fdashboard")
  }

  return <DashboardShell userEmail={session.user.email}>{children}</DashboardShell>
}
