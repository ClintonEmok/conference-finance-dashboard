"use client"

import Link from "next/link"
import Image from "next/image"
import { usePathname } from "next/navigation"
import { useMemo, useState } from "react"
import { Calendar, ShieldEllipsis, type LucideIcon } from "lucide-react"

import { LogoutButton } from "@/app/dashboard/logout-button"
import { cn } from "@/lib/utils"
import { NavBreadcrumbs } from "@/components/dashboard/nav-breadcrumbs"
import { EventSwitcher } from "@/components/dashboard/event-switcher"
import { TooltipProvider } from "@/components/ui/tooltip"
import {
  Sidebar,
  SidebarContent,
  SidebarFooter,
  SidebarGroup,
  SidebarGroupContent,
  SidebarGroupLabel,
  SidebarHeader,
  SidebarInset,
  SidebarMenu,
  SidebarMenuButton,
  SidebarMenuItem,
  SidebarProvider,
  SidebarTrigger,
  SidebarSeparator,
} from "@/components/ui/sidebar"

type DashboardShellProps = {
  userEmail: string
  children: React.ReactNode
}

type NavigationItem = {
  href: string
  label: string
  description: string
  icon: LucideIcon
}

type NavigationSection = {
  title: string
  items: NavigationItem[]
}

const navigationSections: NavigationSection[] = [
  {
    title: "Events",
    items: [
      {
        href: "/dashboard/events",
        label: "Choose event",
        description: "Return to the chooser",
        icon: Calendar,
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
      },
    ],
  },
]

function isPathActive(pathname: string, href: string) {
  return pathname === href || pathname.startsWith(`${href}/`)
}

function getEventSlugFromPath(pathname: string) {
  const match = pathname.match(
    /^\/dashboard\/events\/(?!new(?:\/|$))([^/]+)(?:\/|$)/
  )

  return match?.[1] ?? null
}

export function DashboardShell({ userEmail, children }: DashboardShellProps) {
  const pathname = usePathname()
  const [open, setOpen] = useState(true)
  const currentSlug = useMemo(() => getEventSlugFromPath(pathname), [pathname])

  return (
    <TooltipProvider>
      <SidebarProvider open={open} onOpenChange={setOpen}>
        <Sidebar collapsible="icon" className="border-r border-white/60 dark:border-white/10">
          <SidebarHeader className="h-[64px] justify-center group-data-[collapsible=icon]:px-2">
            <div className="flex items-center gap-3 group-data-[collapsible=icon]:justify-center">
              <Image
                src="/dlbc-logo.png"
                alt="DLBC"
                width={32}
                height={32}
                className="size-8 shrink-0 rounded-lg object-contain"
                priority
              />
              <div className="flex flex-col overflow-hidden group-data-[collapsible=icon]:hidden">
                <h1 className="text-[11px] font-black tracking-tight text-foreground uppercase">
                  DCLM Netherlands
                </h1>
                <p className="text-[9px] leading-none font-bold tracking-widest text-muted-foreground/50 uppercase">
                  Conference Dashboard
                </p>
              </div>
            </div>
          </SidebarHeader>

          <SidebarContent className="gap-0">
            <div className="px-3 pt-3 group-data-[collapsible=icon]:hidden">
              <EventSwitcher currentSlug={currentSlug} />
            </div>

            {navigationSections.map((section) => (
              <SidebarGroup key={section.title}>
                <SidebarGroupLabel className="group-data-[collapsible=icon]:hidden">
                  {section.title}
                </SidebarGroupLabel>
                <SidebarGroupContent>
                  <SidebarMenu>
                    {section.items.map((item) => {
                      const Icon = item.icon
                      const active = isPathActive(pathname, item.href)

                      return (
                        <SidebarMenuItem key={item.href}>
                          <SidebarMenuButton
                            asChild
                            isActive={active}
                            tooltip={item.label}
                            className={cn(
                              "transition-all duration-200",
                              active &&
                                "bg-primary text-primary-foreground hover:bg-primary/90 hover:text-primary-foreground shadow-sm"
                            )}
                          >
                            <Link href={item.href}>
                              <Icon />
                              <span className="font-bold tracking-tight uppercase group-data-[collapsible=icon]:hidden">
                                {item.label}
                              </span>
                            </Link>
                          </SidebarMenuButton>
                        </SidebarMenuItem>
                      )
                    })}
                  </SidebarMenu>
                </SidebarGroupContent>
              </SidebarGroup>
            ))}
          </SidebarContent>

          <SidebarFooter>
            <div
              className={cn(
                "flex items-center gap-3 rounded-xl border border-border/40 bg-white/40 p-2.5 shadow-sm backdrop-blur dark:bg-black/20 transition-all",
                !open && "border-transparent bg-transparent p-0 shadow-none justify-center"
              )}
            >
              <div className="flex-1 min-w-0 group-data-[collapsible=icon]:hidden">
                <p className="truncate text-[10px] font-black tracking-widest text-foreground uppercase">
                  {userEmail.split("@")[0]}
                </p>
                <p className="truncate text-[8px] font-bold tracking-[0.2em] text-muted-foreground/40 uppercase">
                  Conference OP
                </p>
              </div>
              <LogoutButton
                className={cn(
                  "h-6 rounded-md bg-muted/20 px-2 text-[8px] font-black tracking-widest uppercase transition-colors hover:bg-muted/40",
                  !open && "px-0 size-8 rounded-lg"
                )}
                showIconOnly={!open}
              />
            </div>
          </SidebarFooter>
        </Sidebar>

        <SidebarInset className="bg-black/5 dark:bg-white/2">
          <header className="sticky top-0 z-30 flex h-14 shrink-0 items-center justify-between gap-4 border-b border-white/60 bg-white/80 px-4 backdrop-blur-xl dark:border-white/10 dark:bg-black/40">
            <div className="flex items-center gap-4">
              <SidebarTrigger className="-ml-1" />
              <SidebarSeparator orientation="vertical" className="mr-2 h-4" />
              <NavBreadcrumbs />
            </div>
          </header>

          <div className="flex-1 overflow-x-hidden p-4 lg:p-6">
            <div className="mx-auto max-w-7xl">{children}</div>
          </div>
        </SidebarInset>
      </SidebarProvider>
    </TooltipProvider>
  )
}
