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
            href: "/dashboard/payments",
            label: "Payments",
          },
          {
            href: "/dashboard/orders",
            label: "Orders",
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
  const [isCollapsed, setIsCollapsed] = useState(false)

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
    if (isCollapsed) return // Do not allow expanding submenus if sidebar is collapsed
    setExpandedByHref((current) => ({
      ...current,
      [href]: !current[href],
    }))
  }

  return (
    <div className="min-h-svh bg-black text-foreground">
      <div 
        className={cn(
          "mx-auto grid min-h-svh gap-4 px-4 py-4 lg:px-6 lg:py-6 transition-[grid-template-columns] duration-300 ease-[cubic-bezier(0.25,1,0.5,1)]",
          isCollapsed ? "lg:grid-cols-[80px_minmax(0,1fr)]" : "lg:grid-cols-[240px_minmax(0,1fr)]"
        )}
      >
        <aside className="hidden lg:flex lg:flex-col relative">
          <div className="sticky top-6 flex h-[calc(100svh-3rem)] w-full">
            <div className="flex w-full flex-col overflow-hidden rounded-xl border border-white/60 bg-white/85 shadow-[0_18px_48px_rgba(40,24,82,0.08)] backdrop-blur-xl dark:border-white/10 dark:bg-white/8 dark:shadow-[0_18px_48px_rgba(0,0,0,0.2)]">
              
              <div className="shrink-0 flex items-center p-5 h-[64px]">
                 <div className="flex size-8 shrink-0 items-center justify-center rounded-lg bg-primary text-white shadow-lg shadow-primary/20">
                    <ShieldEllipsis className="size-4" />
                 </div>
                 {!isCollapsed && (
                   <div className="ml-2.5 flex-1 overflow-hidden">
                      <h1 className="text-[11px] font-black tracking-tight text-foreground uppercase">Doclines</h1>
                      <p className="text-[9px] font-bold text-muted-foreground/50 uppercase tracking-widest leading-none">Finance v2.0</p>
                   </div>
                 )}
              </div>

              <nav className="min-h-0 flex-1 space-y-6 overflow-y-auto px-4 py-2">
                {navigationSections.map((section) => (
                  <div key={section.title} className="flex flex-col gap-1 focus-visible:outline-none">
                    {!isCollapsed && (
                       <hr className="my-1 border-border/20 mx-3 opacity-30" />
                    )}

                    {section.items.map((item) => {
                      const Icon = item.icon
                      const hasChildren = Boolean(item.children?.length)
                      const childActive = Boolean(
                        item.children?.some((child) => isPathActive(pathname, child.href))
                      )
                      const active = isPathActive(pathname, item.href) || childActive
                      const expanded = hasChildren
                        ? Boolean(expandedByHref[item.href]) || childActive
                        : false

                      return (
                        <div key={item.href} className="flex flex-col">
                          <div className="relative group">
                            <Link
                              href={item.href}
                              className={cn(
                                "flex items-center rounded-lg transition-all duration-200 relative z-10",
                                isCollapsed ? "size-9 justify-center mx-auto mb-1.5" : "px-3 py-2 gap-2.5",
                                active
                                  ? "bg-primary text-white shadow-lg shadow-primary/20"
                                  : "text-muted-foreground hover:bg-muted/50 hover:text-foreground"
                              )}
                            >
                              <Icon className={cn("shrink-0", isCollapsed ? "size-4.5" : "size-4")} />
                              {!isCollapsed && (
                                <span className="flex-1 text-[11px] font-bold uppercase tracking-wider">
                                  {item.label}
                                </span>
                              )}
                            </Link>

                            {hasChildren && !isCollapsed && (
                              <button
                                type="button"
                                onClick={(e) => {
                                  e.preventDefault()
                                  toggleExpanded(item.href)
                                }}
                                className={cn(
                                  "absolute right-2 top-1/2 -translate-y-1/2 flex size-6 items-center justify-center rounded-md transition-colors z-20",
                                  active ? "text-white hover:bg-white/20" : "text-muted-foreground hover:bg-black/5"
                                )}
                              >
                                <ChevronRight className={cn("size-4 transition-transform duration-200", expanded && "rotate-90")} />
                              </button>
                            )}
                          </div>

                          {hasChildren && expanded && !isCollapsed && (
                            <div className="ml-4 mt-1 flex flex-col gap-0.5 border-l border-border/30 pl-3">
                              {item.children?.map((child) => {
                                const childIsActive = isPathActive(pathname, child.href)
                                return (
                                  <Link
                                    key={child.href}
                                    href={child.href}
                                    className={cn(
                                      "block rounded-md px-3 py-1.5 text-[10px] font-bold uppercase tracking-wide transition-colors whitespace-nowrap",
                                      childIsActive
                                        ? "text-primary bg-primary/5"
                                        : "text-muted-foreground/60 hover:text-foreground hover:bg-muted/30"
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

              <div className="p-4 shrink-0 transition-all duration-300">
                <div className={cn(
                  "flex items-center rounded-lg border border-border/40 shadow-sm backdrop-blur overflow-hidden transition-all duration-300",
                  isCollapsed ? "h-12 w-12 justify-center mx-auto flex-col p-0 border-transparent shadow-none" : "px-2.5 py-2.5 justify-between gap-2 bg-white/40 dark:bg-black/20"
                )}>
                  {!isCollapsed ? (
                    <div className="min-w-0">
                      <p className="truncate text-[10px] font-black uppercase tracking-widest text-foreground">
                        {userEmail.split('@')[0]}
                      </p>
                      <p className="truncate text-[8px] uppercase tracking-[0.2em] text-muted-foreground/40 font-bold mt-0.5">
                        Conference OP
                      </p>
                    </div>
                  ) : (
                    <div className="size-8 rounded-lg bg-muted/50 flex items-center justify-center text-muted-foreground/60 font-black text-[10px] border border-border/50">
                       {userEmail[0].toUpperCase()}
                    </div>
                  )}
                  {!isCollapsed && <LogoutButton className="h-6 rounded-md px-2 text-[8px] font-black uppercase tracking-widest bg-muted/50 hover:bg-muted transition-colors" />}
                </div>
              </div>

            </div>
            
            <button
              onClick={() => setIsCollapsed(!isCollapsed)}
              className="absolute -right-[14px] top-10 flex size-7 items-center justify-center rounded-full border border-border bg-white shadow-md transition hover:bg-muted text-foreground dark:bg-zinc-800 dark:border-white/10 z-50 focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-primary"
            >
              <ChevronRight className={cn("size-3.5 transition-transform duration-300 text-muted-foreground hover:text-foreground", !isCollapsed && "rotate-180")} />
            </button>
          </div>
        </aside>

        <div className="min-w-0 flex flex-col transition-all duration-300">
          <div className="flex-1 rounded-xl border border-white/60 bg-white/78 p-4 shadow-[0_20px_56px_rgba(40,24,82,0.06)] backdrop-blur-xl lg:p-7 dark:border-white/10 dark:bg-white/6 dark:shadow-[0_20px_56px_rgba(0,0,0,0.18)]">
            <div className="mb-6 flex flex-col gap-4 lg:hidden">
              <div className="rounded-xl bg-[linear-gradient(145deg,rgba(113,84,255,0.94),rgba(82,56,170,0.92))] p-5 text-primary-foreground shadow-[0_18px_48px_rgba(74,48,164,0.24)]">
                <p className="text-[10px] font-semibold tracking-[0.2em] text-primary-foreground/70 uppercase">
                  Doclines Finance
                </p>
                <h1 className="mt-2 text-2xl font-bold tracking-tight">
                  Command center
                </h1>
                <p className="mt-2 text-[13px] leading-relaxed text-primary-foreground/85">
                  Move from balances to attendee follow-up and room placement
                  without losing context.
                </p>
              </div>

              <div className="space-y-4">
                {navigationSections.map((section) => (
                  <div key={section.title} className="space-y-2">
                    <p className="px-1 text-[10px] font-semibold tracking-[0.18em] text-muted-foreground uppercase">
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
                                "flex items-center gap-2.5 rounded-md border px-3.5 py-[10px] text-[13px] font-semibold transition-colors shadow-sm",
                                active
                                  ? "border-transparent bg-[linear-gradient(145deg,rgba(113,84,255,0.94),rgba(82,56,170,0.92))] text-white shadow-primary/20"
                                  : "border-border bg-background/80 text-foreground hover:bg-muted"
                              )}
                            >
                              <Icon className="size-[18px]" />
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
                                  "flex items-center justify-center rounded-md border px-2.5 py-[10px] shadow-sm transition-colors",
                                  active
                                    ? "border-transparent bg-[linear-gradient(145deg,rgba(113,84,255,0.94),rgba(82,56,170,0.92))] text-white"
                                    : "border-border bg-background/60 text-muted-foreground hover:bg-muted"
                                )}
                              >
                                <ChevronRight
                                  className={cn(
                                    "size-[14px] transition-transform",
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
                                "rounded-md border px-3.5 py-[10px] text-xs font-semibold transition-colors shadow-sm",
                                active
                                  ? "border-transparent bg-primary/10 text-primary"
                                  : "border-border/80 bg-background/40 text-muted-foreground hover:bg-muted hover:text-foreground"
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

              <div className="flex items-center justify-between rounded-lg border border-border/60 bg-background/70 px-4 py-3 dark:bg-white/6 shadow-sm">
                <div>
                  <p className="text-[10px] font-semibold tracking-[0.18em] text-muted-foreground uppercase">
                    Signed in
                  </p>
                  <p className="text-sm font-semibold text-foreground">
                    {userEmail}
                  </p>
                </div>
                <LogoutButton className="h-8 rounded-lg px-3 text-[11px] font-semibold" />
              </div>
            </div>

            <main className="min-w-0">{children}</main>
          </div>
        </div>
      </div>
    </div>
  )
}
