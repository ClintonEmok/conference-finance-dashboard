import { DashboardSurface } from "@/app/dashboard/dashboard-surface"
import { requirePageUser } from "@/lib/auth/server"

type DashboardLayoutProps = {
  children: React.ReactNode
}

export default async function DashboardLayout({
  children,
}: DashboardLayoutProps) {
  const user = await requirePageUser("/dashboard")

  return <DashboardSurface userEmail={user.email}>{children}</DashboardSurface>
}
