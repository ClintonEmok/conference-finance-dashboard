import { DashboardShell } from "@/app/dashboard/dashboard-shell"
import { requirePageUser } from "@/lib/auth/server"

type DashboardLayoutProps = {
  children: React.ReactNode
}

export default async function DashboardLayout({
  children,
}: DashboardLayoutProps) {
  const user = await requirePageUser("/dashboard")

  return <DashboardShell userEmail={user.email}>{children}</DashboardShell>
}
