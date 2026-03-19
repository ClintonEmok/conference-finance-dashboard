import Link from "next/link"
import { headers } from "next/headers"
import { redirect } from "next/navigation"

import { LogoutButton } from "@/app/dashboard/logout-button"
import { Button } from "@/components/ui/button"
import { auth } from "@/lib/auth"

type DashboardLayoutProps = {
  children: React.ReactNode
}

const navigationItems = [
  { href: "/dashboard", label: "Overview" },
  { href: "/dashboard/reconciliation", label: "Outstanding balances" },
  { href: "/dashboard/attendees", label: "Attendees" },
  { href: "/dashboard/accommodation", label: "Room allocation" },
  { href: "/dashboard/orders", label: "Orders" },
  { href: "/dashboard/integrations", label: "Integrations" },
  { href: "/dashboard/ticket-tailor/sync", label: "Sync" },
] as const

export default async function DashboardLayout({ children }: DashboardLayoutProps) {
  const requestHeaders = await headers()
  const session = await auth.api.getSession({
    headers: requestHeaders,
  })

  if (!session) {
    redirect("/login?callbackUrl=%2Fdashboard")
  }

  return (
    <div className="min-h-svh bg-background">
      <header className="border-b border-border">
        <div className="mx-auto flex w-full max-w-5xl items-center justify-between px-6 py-4">
          <div>
            <h1 className="text-lg font-semibold">Conference finance command center</h1>
            <p className="text-sm text-muted-foreground">Signed in as {session.user.email}</p>
          </div>

          <div className="flex items-center gap-2">
            {navigationItems.map((item) => (
              <Button key={item.href} asChild variant={item.href === "/dashboard/integrations" || item.href === "/dashboard/ticket-tailor/sync" ? "outline" : "ghost"}>
                <Link href={item.href}>{item.label}</Link>
              </Button>
            ))}
            <LogoutButton />
          </div>
        </div>
      </header>

      <main className="mx-auto w-full max-w-5xl px-6 py-6">{children}</main>
    </div>
  )
}
