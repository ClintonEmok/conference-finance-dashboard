import { DashboardSurface } from "@/app/dashboard/dashboard-surface"
import { requirePageUser } from "@/lib/auth/server"

type DashboardLayoutProps = {
  children: React.ReactNode
}

export default async function DashboardLayout({
  children,
}: DashboardLayoutProps) {
  await requirePageUser("/dashboard")

  return <DashboardSurface>{children}</DashboardSurface>
}
