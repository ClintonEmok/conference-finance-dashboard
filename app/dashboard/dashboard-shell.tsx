"use client"

import Link from "next/link"
import { usePathname } from "next/navigation"
import { useState } from "react"
import {
  BedDouble,
  ChevronRight,
  Home,
  type LucideIcon,
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

type NavigationChildItem = {
  href: string
  label: string
}

type NavigationItem = {
  href: string
  label: string
  description: string
  icon: LucideIcon
  children?: NavigationChildItem[]
}

type NavigationSection = {
  title: string
  items: NavigationItem[]
}

const navigationSections: NavigationSection[] = [
  {
    title: "Overview",
    items: [
      {
        href: "/dashboard",
        label: "Overview",
        description: "Daily command center",
        icon: Home,
      },
    ],
  },
  {
    title: "Finance",
    items: [
      {
        href: "/dashboard/financial",
        label: "Financial",
        description: "Revenue and forecasting",
        icon: WalletCards,
        children: [
          {
            href: "/dashboard/reconciliation",
            label: "Reconciliation",
          },
          {
            href: "/dashboard/orders",
            label: "Orders",
          },
          {
            href: "/dashboard/reconciliation/payments",
            label: "Unassigned payments",
          },
        ],
      },
    ],
  },
  {
    title: "Operations",
    items: [
      {
        href: "/dashboard/attendees",
        label: "Attendees",
        description: "People and payment context",
        icon: Users,
      },
      {
        href: "/dashboard/accommodation",
        label: "Accommodation",
        description: "Rooms and assignments",
        icon: BedDouble,
        children: [
          {
            href: "/dashboard/accommodation/inventory",
            label: "Inventory",
          },
        ],
      },
    ],
  },
  {
    title: "System",
    items: [
      {
        href: "/dashboard/integrations",
        label: "Integrations",
        description: "Connections and health",
        icon: ShieldEllipsis,
        children: [
          {
            href: "/dashboard/settings/ticket-types",
            label: "Payment templates",
          },
          {
            href: "/dashboard/ticket-tailor/sync",
            label: "Ticket Tailor sync",
          },
        ],
      },
    ],
  },
]

function isPathActive(pathname: string, href: string) {
  return pathname === href || pathname.startsWith(`${href}/`)
}

export function DashboardShell({ userEmail, children }: DashboardShellProps) {
  const pathname = usePathname()

  const [expandedByHref, setExpandedByHref] = useState<Record<string, boolean>>(
    () => {
      const initial: Record<string, boolean> = {}

      for (const section of navigationSections) {
        for (const item of section.items) {
          if (!item.children?.length) {
            continue
          }

          initial[item.href] =
            isPathActive(pathname, item.href) ||
            item.children.some((child) => isPathActive(pathname, child.href))
        }
      }

      return initial
    }
  )

  function toggleExpanded(href: string) {
    setExpandedByHref((current) => ({
      ...current,
      [href]: !current[href],
    }))
  }

  return (
    <div className="min-h-svh bg-black text-foreground">
      <div className="mx-auto grid min-h-svh gap-4 px-4 py-4 lg:grid-cols-[220px_minmax(0,1fr)] lg:px-6 lg:py-6">
        <aside className="hidden lg:flex lg:flex-col">
          <div className="sticky top-6 flex h-[calc(100svh-3rem)] flex-col overflow-hidden rounded-xl border border-white/60 bg-white/82 p-3 shadow-[0_18px_48px_rgba(40,24,82,0.08)] backdrop-blur-xl dark:border-white/10 dark:bg-white/6 dark:shadow-[0_18px_48px_rgba(0,0,0,0.2)]">
            <div className="shrink-0 space-y-2 px-1 pb-4">
              <p className="text-[10px] font-semibold tracking-[0.22em] text-primary/70 uppercase">
                Conference finance dashboard
              </p>
              <div>
                <h1 className="text-xl font-semibold tracking-tight text-foreground">
                  Command center
                </h1>
                <p className="mt-1 text-xs leading-5 text-muted-foreground">
                  Financial follow-up, attendees, and room operations in one
                  calm workspace.
                </p>
              </div>
            </div>

            <nav className="min-h-0 flex-1 space-y-1.5 overflow-y-auto pr-1">
              {navigationSections.map((section) => (
                <div key={section.title} className="space-y-1.5">
                  <p className="px-2.5 text-[10px] font-semibold tracking-[0.16em] text-muted-foreground uppercase">
                    {section.title}
                  </p>
                  {section.items.map((item) => {
                    const Icon = item.icon
                    const hasChildren = Boolean(item.children?.length)
                    const childActive = Boolean(
                      item.children?.some((child) =>
                        isPathActive(pathname, child.href)
                      )
                    )
                    const active =
                      isPathActive(pathname, item.href) || childActive
                    const expanded = hasChildren
                      ? Boolean(expandedByHref[item.href]) || childActive
                      : false

                    return (
                      <div key={item.href} className="space-y-1">
                        <div className="flex items-stretch gap-1">
                          <Link
                            href={item.href}
                            className={cn(
                              "group flex min-w-0 flex-1 items-center gap-2.5 rounded-lg border px-2.5 py-2 transition-all duration-200",
                              active
                                ? "border-primary/15 bg-primary text-primary-foreground shadow-[0_10px_24px_rgba(90,58,191,0.22)]"
                                : "border-transparent bg-transparent text-foreground hover:border-primary/10 hover:bg-primary/6 dark:hover:bg-white/8"
                            )}
                          >
                            <span
                              className={cn(
                                "flex size-8 shrink-0 items-center justify-center rounded-md transition-colors",
                                active
                                  ? "bg-white/18 text-primary-foreground"
                                  : "bg-primary/8 text-primary dark:bg-white/10 dark:text-primary-foreground"
                              )}
                            >
                              <Icon className="size-4" />
                            </span>
                            <span className="min-w-0 flex-1">
                              <span className="block text-xs font-semibold">
                                {item.label}
                              </span>
                              <span
                                className={cn(
                                  "block text-[10px] leading-4",
                                  active
                                    ? "text-primary-foreground/80"
                                    : "text-muted-foreground"
                                )}
                              >
                                {item.description}
                              </span>
                            </span>
                          </Link>
                          {hasChildren && (
                            <button
                              type="button"
                              aria-label={
                                expanded
                                  ? "Collapse sub-items"
                                  : "Expand sub-items"
                              }
                              aria-expanded={expanded}
                              onClick={() => toggleExpanded(item.href)}
                              className={cn(
                                "flex w-8 items-center justify-center rounded-md border transition-colors",
                                active
                                  ? "border-primary/20 bg-primary/15 text-primary-foreground"
                                  : "border-border/80 bg-background/50 text-muted-foreground hover:bg-primary/6 hover:text-foreground"
                              )}
                            >
                              <ChevronRight
                                className={cn(
                                  "size-4 transition-transform",
                                  expanded && "rotate-90"
                                )}
                              />
                            </button>
                          )}
                        </div>

                        {hasChildren && expanded && (
                          <div className="ml-11 space-y-1">
                            {item.children?.map((child) => {
                              const childIsActive = isPathActive(
                                pathname,
                                child.href
                              )

                              return (
                                <Link
                                  key={child.href}
                                  href={child.href}
                                  className={cn(
                                    "block rounded-md px-2 py-1.5 text-[11px] font-medium transition-colors",
                                    childIsActive
                                      ? "bg-primary/12 text-primary"
                                      : "text-muted-foreground hover:bg-primary/6 hover:text-foreground"
                                  )}
                                >
                                  {child.label}
                                </Link>
                              )
                            })}
                          </div>
                        )}
                      </div>
                    )
                  })}
                </div>
              ))}
            </nav>

            <div className="mt-3 flex shrink-0 items-center justify-between gap-2 rounded-lg border border-border/60 bg-background/70 px-2.5 py-2 backdrop-blur dark:bg-white/6">
              <div className="min-w-0">
                <p className="text-[10px] font-semibold tracking-[0.16em] text-muted-foreground uppercase">
                  Signed in
                </p>
                <p className="truncate text-xs font-medium text-foreground">
                  {userEmail}
                </p>
              </div>
              <LogoutButton className="h-8 rounded-md px-3 text-[11px]" />
            </div>
          </div>
        </aside>

        <div className="min-w-0">
          <div className="rounded-xl border border-white/60 bg-white/78 p-4 shadow-[0_20px_56px_rgba(40,24,82,0.06)] backdrop-blur-xl lg:p-5 dark:border-white/10 dark:bg-white/6 dark:shadow-[0_20px_56px_rgba(0,0,0,0.18)]">
            <div className="mb-6 flex flex-col gap-4 lg:hidden">
              <div className="rounded-[1.75rem] bg-[linear-gradient(145deg,rgba(113,84,255,0.94),rgba(82,56,170,0.92))] p-5 text-primary-foreground shadow-[0_18px_48px_rgba(74,48,164,0.24)]">
                <p className="text-xs font-semibold tracking-[0.22em] text-primary-foreground/70 uppercase">
                  Conference finance dashboard
                </p>
                <h1 className="mt-2 text-2xl font-semibold tracking-tight">
                  Command center
                </h1>
                <p className="mt-2 text-sm text-primary-foreground/84">
                  Move from balances to attendee follow-up and room placement
                  without losing context.
                </p>
              </div>

              <div className="space-y-3">
                {navigationSections.map((section) => (
                  <div key={section.title} className="space-y-2">
                    <p className="px-1 text-[10px] font-semibold tracking-[0.16em] text-muted-foreground uppercase">
                      {section.title}
                    </p>
                    <div className="flex flex-wrap gap-2">
                      {section.items.map((item) => {
                        const Icon = item.icon
                        const hasChildren = Boolean(item.children?.length)
                        const childActive = Boolean(
                          item.children?.some((child) =>
                            isPathActive(pathname, child.href)
                          )
                        )
                        const isExpanded = hasChildren
                          ? Boolean(expandedByHref[item.href]) || childActive
                          : false
                        const active =
                          isPathActive(pathname, item.href) || childActive

                        return (
                          <div key={item.href} className="contents">
                            <Link
                              href={item.href}
                              className={cn(
                                "flex items-center gap-2 rounded-full border px-3 py-1.5 text-xs font-medium transition-colors",
                                active
                                  ? "border-primary bg-primary text-primary-foreground"
                                  : "border-border bg-background/70 text-foreground"
                              )}
                            >
                              <Icon className="size-3.5" />
                              {item.label}
                            </Link>
                            {hasChildren && (
                              <button
                                type="button"
                                aria-label={
                                  isExpanded
                                    ? `Collapse ${item.label}`
                                    : `Expand ${item.label}`
                                }
                                aria-expanded={isExpanded}
                                onClick={() => toggleExpanded(item.href)}
                                className={cn(
                                  "flex items-center justify-center rounded-full border px-2 py-1.5",
                                  active
                                    ? "border-primary/60 bg-primary/12 text-primary"
                                    : "border-border bg-background/50 text-muted-foreground"
                                )}
                              >
                                <ChevronRight
                                  className={cn(
                                    "size-3.5 transition-transform",
                                    isExpanded && "rotate-90"
                                  )}
                                />
                              </button>
                            )}
                          </div>
                        )
                      })}

                      {section.items.flatMap((item) => {
                        const childActive = Boolean(
                          item.children?.some((child) =>
                            isPathActive(pathname, child.href)
                          )
                        )

                        if (!expandedByHref[item.href] && !childActive) {
                          return []
                        }

                        return (item.children ?? []).map((child) => {
                          const active = isPathActive(pathname, child.href)

                          return (
                            <Link
                              key={child.href}
                              href={child.href}
                              className={cn(
                                "rounded-full border px-3 py-1.5 text-xs font-medium transition-colors",
                                active
                                  ? "border-primary/60 bg-primary/12 text-primary"
                                  : "border-border/80 bg-background/40 text-muted-foreground"
                              )}
                            >
                              {child.label}
                            </Link>
                          )
                        })
                      })}
                    </div>
                  </div>
                ))}
              </div>

              <div className="flex items-center justify-between rounded-[1.25rem] border border-border/60 bg-background/70 px-4 py-3 dark:bg-white/6">
                <div>
                  <p className="text-xs tracking-[0.18em] text-muted-foreground uppercase">
                    Signed in
                  </p>
                  <p className="text-sm font-medium text-foreground">
                    {userEmail}
                  </p>
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
