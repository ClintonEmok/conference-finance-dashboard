"use client"

import Link from "next/link"
import { usePathname } from "next/navigation"
import {
  ArrowRight,
  BedDouble,
  FileSpreadsheet,
  Home,
  PlugZap,
  RefreshCcwDot,
  WalletCards,
  Users,
} from "lucide-react"

import { LogoutButton } from "@/app/dashboard/logout-button"
import { Button } from "@/components/ui/button"
import { cn } from "@/lib/utils"

type DashboardShellProps = {
  userEmail: string
  children: React.ReactNode
}

const navigationItems = [
  {
    href: "/dashboard",
    label: "Overview",
    description: "Daily command center",
    icon: Home,
  },
  {
    href: "/dashboard/reconciliation",
    label: "Outstanding balances",
    description: "Collection follow-up",
    icon: WalletCards,
  },
  {
    href: "/dashboard/attendees",
    label: "Attendees",
    description: "People and payment context",
    icon: Users,
  },
  {
    href: "/dashboard/accommodation",
    label: "Room allocation",
    description: "Placement and capacity",
    icon: BedDouble,
  },
  {
    href: "/dashboard/orders",
    label: "Orders",
    description: "Order-level review",
    icon: FileSpreadsheet,
  },
  {
    href: "/dashboard/integrations",
    label: "Integrations",
    description: "Connection health",
    icon: PlugZap,
  },
  {
    href: "/dashboard/ticket-tailor/sync",
    label: "Sync",
    description: "Refresh event data",
    icon: RefreshCcwDot,
  },
] as const

function isActive(pathname: string, href: string) {
  if (href === "/dashboard") {
    return pathname === href
  }

  return pathname.startsWith(href)
}

export function DashboardShell({ userEmail, children }: DashboardShellProps) {
  const pathname = usePathname()

  return (
    <div className="min-h-svh bg-[radial-gradient(circle_at_top_left,rgba(113,84,255,0.16),transparent_28%),radial-gradient(circle_at_bottom_right,rgba(113,84,255,0.10),transparent_24%),linear-gradient(180deg,rgba(255,255,255,0.98),rgba(247,245,252,0.96))] text-foreground dark:bg-[radial-gradient(circle_at_top_left,rgba(113,84,255,0.28),transparent_26%),radial-gradient(circle_at_bottom_right,rgba(113,84,255,0.18),transparent_22%),linear-gradient(180deg,rgba(18,17,25,0.98),rgba(20,17,27,0.98))]">
      <div className="mx-auto grid min-h-svh max-w-[1600px] gap-6 px-4 py-4 lg:grid-cols-[280px_minmax(0,1fr)] lg:px-6 lg:py-6">
        <aside className="hidden lg:flex lg:flex-col">
          <div className="sticky top-6 flex h-[calc(100svh-3rem)] flex-col rounded-[2rem] border border-white/60 bg-white/85 p-5 shadow-[0_24px_80px_rgba(40,24,82,0.12)] backdrop-blur-xl dark:border-white/10 dark:bg-white/6 dark:shadow-[0_24px_80px_rgba(0,0,0,0.28)]">
            <div className="space-y-2 px-1 pb-5">
              <p className="text-xs font-semibold uppercase tracking-[0.24em] text-primary/70">
                Conference finance dashboard
              </p>
              <div>
                <h1 className="text-2xl font-semibold tracking-tight text-foreground">
                  Command center
                </h1>
                <p className="mt-1 text-sm leading-6 text-muted-foreground">
                  Payments, attendees, and room operations in one calm workspace.
                </p>
              </div>
            </div>

            <nav className="space-y-2">
              {navigationItems.map((item) => {
                const Icon = item.icon
                const active = isActive(pathname, item.href)

                return (
                  <Link
                    key={item.href}
                    href={item.href}
                    className={cn(
                      "group flex items-center gap-3 rounded-2xl border px-4 py-3 transition-all duration-200",
                      active
                        ? "border-primary/20 bg-primary text-primary-foreground shadow-[0_18px_48px_rgba(90,58,191,0.28)]"
                        : "border-transparent bg-transparent text-foreground hover:border-primary/10 hover:bg-primary/6 hover:shadow-[0_12px_32px_rgba(45,29,98,0.08)] dark:hover:bg-white/8",
                    )}
                  >
                    <span
                      className={cn(
                        "flex size-11 shrink-0 items-center justify-center rounded-2xl transition-colors",
                        active
                          ? "bg-white/18 text-primary-foreground"
                          : "bg-primary/8 text-primary dark:bg-white/10 dark:text-primary-foreground",
                      )}
                    >
                      <Icon className="size-4.5" />
                    </span>
                    <span className="min-w-0 flex-1">
                      <span className="block text-sm font-semibold">{item.label}</span>
                      <span
                        className={cn(
                          "block text-xs",
                          active ? "text-primary-foreground/80" : "text-muted-foreground",
                        )}
                      >
                        {item.description}
                      </span>
                    </span>
                  </Link>
                )
              })}
            </nav>

            <div className="mt-6 rounded-[1.75rem] bg-[linear-gradient(145deg,rgba(113,84,255,0.94),rgba(82,56,170,0.92))] p-5 text-primary-foreground shadow-[0_22px_60px_rgba(74,48,164,0.34)]">
              <p className="text-xs font-semibold uppercase tracking-[0.22em] text-primary-foreground/70">
                Today&apos;s focus
              </p>
              <h2 className="mt-3 text-xl font-semibold leading-tight">
                Clear balances, confirm attendees, then place the final rooms.
              </h2>
              <div className="mt-4 grid grid-cols-2 gap-3 text-sm">
                <div className="rounded-2xl bg-white/12 px-3 py-3">
                  <p className="text-primary-foreground/70">Flow</p>
                  <p className="mt-1 font-semibold">Balances to rooms</p>
                </div>
                <div className="rounded-2xl bg-white/12 px-3 py-3">
                  <p className="text-primary-foreground/70">State</p>
                  <p className="mt-1 font-semibold">MVP-ready loop</p>
                </div>
              </div>
              <Button
                asChild
                variant="secondary"
                className="mt-5 h-11 w-full justify-between rounded-2xl bg-white text-primary hover:bg-white/92"
              >
                <Link href="/dashboard/reconciliation">
                  Start follow-up
                  <ArrowRight className="size-4" />
                </Link>
              </Button>
            </div>

            <div className="mt-auto flex items-center justify-between gap-3 rounded-[1.5rem] border border-border/60 bg-background/70 px-4 py-3 backdrop-blur dark:bg-white/6">
              <div className="min-w-0">
                <p className="text-xs font-semibold uppercase tracking-[0.18em] text-muted-foreground">
                  Signed in
                </p>
                <p className="truncate text-sm font-medium text-foreground">{userEmail}</p>
              </div>
              <LogoutButton />
            </div>
          </div>
        </aside>

        <div className="min-w-0">
          <div className="rounded-[2rem] border border-white/60 bg-white/78 p-4 shadow-[0_24px_80px_rgba(40,24,82,0.08)] backdrop-blur-xl dark:border-white/10 dark:bg-white/6 dark:shadow-[0_24px_80px_rgba(0,0,0,0.22)] lg:p-6">
            <div className="mb-6 flex flex-col gap-4 lg:hidden">
              <div className="rounded-[1.75rem] bg-[linear-gradient(145deg,rgba(113,84,255,0.94),rgba(82,56,170,0.92))] p-5 text-primary-foreground shadow-[0_18px_48px_rgba(74,48,164,0.24)]">
                <p className="text-xs font-semibold uppercase tracking-[0.22em] text-primary-foreground/70">
                  Conference finance dashboard
                </p>
                <h1 className="mt-2 text-2xl font-semibold tracking-tight">Command center</h1>
                <p className="mt-2 text-sm text-primary-foreground/84">
                  Move from balances to attendee follow-up and room placement without losing context.
                </p>
              </div>

              <div className="flex gap-2 overflow-x-auto pb-1">
                {navigationItems.map((item) => {
                  const Icon = item.icon
                  const active = isActive(pathname, item.href)

                  return (
                    <Link
                      key={item.href}
                      href={item.href}
                      className={cn(
                        "flex min-w-fit items-center gap-2 rounded-full border px-4 py-2 text-sm font-medium transition-colors",
                        active
                          ? "border-primary bg-primary text-primary-foreground"
                          : "border-border bg-background/70 text-foreground",
                      )}
                    >
                      <Icon className="size-4" />
                      {item.label}
                    </Link>
                  )
                })}
              </div>

              <div className="flex items-center justify-between rounded-[1.25rem] border border-border/60 bg-background/70 px-4 py-3 dark:bg-white/6">
                <div>
                  <p className="text-xs uppercase tracking-[0.18em] text-muted-foreground">Signed in</p>
                  <p className="text-sm font-medium text-foreground">{userEmail}</p>
                </div>
                <LogoutButton />
              </div>
            </div>

            <main className="min-w-0">{children}</main>
          </div>
        </div>
      </div>
    </div>
  )
}
