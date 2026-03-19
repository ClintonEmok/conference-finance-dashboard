"use client"

import Link from "next/link"
import { usePathname } from "next/navigation"
import {
  BedDouble,
  FileSpreadsheet,
  Home,
  RefreshCcwDot,
  ShieldEllipsis,
  WalletCards,
  Users,
} from "lucide-react"

import { LogoutButton } from "@/app/dashboard/logout-button"
import { cn } from "@/lib/utils"

type DashboardShellProps = {
  userEmail: string
  children: React.ReactNode
}

const navigationItems = [
  {
    href: "/dashboard",
    exact: true,
    label: "Overview",
    description: "Daily command center",
    icon: Home,
  },
  {
    href: "/dashboard/financial",
    exact: true,
    label: "Financial",
    description: "Revenue and ledger",
    icon: WalletCards,
  },
  {
    href: "/dashboard/reconciliation",
    exact: true,
    label: "Outstanding",
    description: "Collections queue",
    icon: FileSpreadsheet,
  },
  {
    href: "/dashboard/attendees",
    exact: false,
    label: "Attendees",
    description: "People and payment context",
    icon: Users,
  },
  {
    href: "/dashboard/accommodation",
    exact: true,
    label: "Rooms",
    description: "Allocation and capacity",
    icon: BedDouble,
  },
  {
    href: "/dashboard/accommodation/inventory",
    exact: false,
    label: "Inventory",
    description: "Hotels and room setup",
    icon: BedDouble,
  },
  {
    href: "/dashboard/integrations",
    exact: true,
    label: "Settings",
    description: "Integrations and health",
    icon: ShieldEllipsis,
  },
  {
    href: "/dashboard/ticket-tailor/sync",
    exact: true,
    label: "Sync",
    description: "Refresh event data",
    icon: RefreshCcwDot,
  },
] as const

function isActive(pathname: string, href: string, exact: boolean) {
  if (exact) {
    return pathname === href
  }

  return pathname.startsWith(href)
}

export function DashboardShell({ userEmail, children }: DashboardShellProps) {
  const pathname = usePathname()

  return (
    <div className="min-h-svh text-foreground bg-black">
      <div className="mx-auto grid min-h-svh gap-4 px-4 py-4 lg:grid-cols-[220px_minmax(0,1fr)] lg:px-6 lg:py-6">
        <aside className="hidden lg:flex lg:flex-col">
          <div className="sticky top-6 flex h-[calc(100svh-3rem)] flex-col overflow-hidden rounded-xl border border-white/60 bg-white/82 p-3 shadow-[0_18px_48px_rgba(40,24,82,0.08)] backdrop-blur-xl dark:border-white/10 dark:bg-white/6 dark:shadow-[0_18px_48px_rgba(0,0,0,0.2)]">
            <div className="shrink-0 space-y-2 px-1 pb-4">
              <p className="text-[10px] font-semibold uppercase tracking-[0.22em] text-primary/70">
                Conference finance dashboard
              </p>
              <div>
                <h1 className="text-xl font-semibold tracking-tight text-foreground">
                  Command center
                </h1>
                <p className="mt-1 text-xs leading-5 text-muted-foreground">
                  Financial follow-up, attendees, and room operations in one calm workspace.
                </p>
              </div>
            </div>

            <nav className="min-h-0 flex-1 space-y-1.5 overflow-y-auto pr-1">
              {navigationItems.map((item) => {
                const Icon = item.icon
                const active = isActive(pathname, item.href, item.exact)

                return (
                  <Link
                    key={item.href}
                    href={item.href}
                    className={cn(
                      "group flex items-center gap-2.5 rounded-lg border px-2.5 py-2 transition-all duration-200",
                      active
                        ? "border-primary/15 bg-primary text-primary-foreground shadow-[0_10px_24px_rgba(90,58,191,0.22)]"
                        : "border-transparent bg-transparent text-foreground hover:border-primary/10 hover:bg-primary/6 dark:hover:bg-white/8",
                    )}
                  >
                    <span
                      className={cn(
                        "flex size-8 shrink-0 items-center justify-center rounded-md transition-colors",
                        active
                          ? "bg-white/18 text-primary-foreground"
                          : "bg-primary/8 text-primary dark:bg-white/10 dark:text-primary-foreground",
                      )}
                    >
                      <Icon className="size-4" />
                    </span>
                    <span className="min-w-0 flex-1">
                      <span className="block text-xs font-semibold">{item.label}</span>
                      <span
                        className={cn(
                          "block text-[10px] leading-4",
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

            <div className="mt-3 flex shrink-0 items-center justify-between gap-2 rounded-lg border border-border/60 bg-background/70 px-2.5 py-2 backdrop-blur dark:bg-white/6">
              <div className="min-w-0">
                <p className="text-[10px] font-semibold uppercase tracking-[0.16em] text-muted-foreground">
                  Signed in
                </p>
                <p className="truncate text-xs font-medium text-foreground">{userEmail}</p>
              </div>
              <LogoutButton className="h-8 rounded-md px-3 text-[11px]" />
            </div>
          </div>
        </aside>

        <div className="min-w-0">
          <div className="rounded-xl border border-white/60 bg-white/78 p-4 shadow-[0_20px_56px_rgba(40,24,82,0.06)] backdrop-blur-xl dark:border-white/10 dark:bg-white/6 dark:shadow-[0_20px_56px_rgba(0,0,0,0.18)] lg:p-5">
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
                  const active = isActive(pathname, item.href, item.exact)

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
                <LogoutButton className="h-8 rounded-md px-3 text-[11px]" />
              </div>
            </div>

            <main className="min-w-0">{children}</main>
          </div>
        </div>
      </div>
    </div>
  )
}
