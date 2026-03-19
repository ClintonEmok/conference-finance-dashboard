import Link from "next/link"
import { headers } from "next/headers"
import { redirect } from "next/navigation"

import { Button } from "@/components/ui/button"
import { auth } from "@/lib/auth"

type DashboardLayoutProps = {
  children: React.ReactNode
}

async function logout() {
  "use server"

  await auth.api.signOut({
    headers: await headers(),
  })

  redirect("/login")
}

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
            <h1 className="text-lg font-semibold">Conference finance dashboard</h1>
            <p className="text-sm text-muted-foreground">Signed in as {session.user.email}</p>
          </div>

          <div className="flex items-center gap-2">
            <Button asChild variant="ghost">
              <Link href="/dashboard">Overview</Link>
            </Button>
            <Button asChild variant="ghost">
              <Link href="/dashboard/attendees">Attendees</Link>
            </Button>
            <Button asChild variant="ghost">
              <Link href="/dashboard/orders">Orders</Link>
            </Button>
            <Button asChild variant="ghost">
              <Link href="/dashboard/reconciliation">Reconciliation</Link>
            </Button>
            <Button asChild variant="outline">
              <Link href="/dashboard/integrations">Integrations</Link>
            </Button>
            <Button asChild variant="outline">
              <Link href="/dashboard/ticket-tailor/sync">Run sync</Link>
            </Button>
            <form action={logout}>
              <Button type="submit" variant="outline">
                Log out
              </Button>
            </form>
          </div>
        </div>
      </header>

      <main className="mx-auto w-full max-w-5xl px-6 py-6">{children}</main>
    </div>
  )
}
