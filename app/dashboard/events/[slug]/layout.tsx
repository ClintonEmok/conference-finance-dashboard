"use client"

import { useParams, usePathname } from "next/navigation"
import {
  Calendar,
  ChevronRight,
  CreditCard,
  ExternalLink,
  Settings,
  Users,
  Ticket,
  BedDouble,
} from "lucide-react"
import { LogoutButton } from "@/app/dashboard/logout-button"
import Link from "next/link"

import { useEventBySlug } from "@/lib/convex/hooks/events"
import { cn } from "@/lib/utils"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { Skeleton } from "@/components/ui/skeleton"
import { EventSwitcher } from "@/components/dashboard/event-switcher"
import { EventDashboardProvider } from "@/components/dashboard/event-dashboard-context"
import {
  Sidebar,
  SidebarContent,
  SidebarFooter,
  SidebarHeader,
  SidebarInset,
  SidebarProvider,
  SidebarSeparator,
  SidebarTrigger,
  useSidebar,
} from "@/components/ui/sidebar"
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from "@/components/ui/tooltip"

interface EventLayoutProps {
  children: React.ReactNode
}

function getStatusBadge(isPublished: boolean, isSignupOpen: boolean) {
  if (!isPublished) return <Badge variant="outline">Draft</Badge>
  if (isSignupOpen)
    return (
      <Badge className="border-none bg-emerald-500/10 text-emerald-600">
        Live
      </Badge>
    )
  return <Badge variant="secondary">Published</Badge>
}

export default function EventLayout({ children }: EventLayoutProps) {
  const { slug } = useParams<{ slug: string }>()
  const event = useEventBySlug(slug)
  const pathname = usePathname()

  if (event === undefined) {
    return (
      <div className="space-y-6">
        <Skeleton className="h-44 w-full rounded-2xl" />
        <Skeleton className="h-[600px] w-full rounded-2xl" />
      </div>
    )
  }

  if (event === null) {
    return (
      <div className="flex flex-col items-center justify-center py-20 text-center">
        <h1 className="text-2xl font-bold">Event not found</h1>
        <p className="mt-2 text-muted-foreground">
          The event with slug "{slug}" does not exist.
        </p>
        <Link
          href="/dashboard"
          className="mt-6 text-primary hover:underline"
        >
          Back to picker
        </Link>
      </div>
    )
  }

  return (
    <EventDashboardProvider key={slug} slug={slug} event={event}>
      <SidebarProvider>
        <Sidebar
          collapsible="icon"
          className="border-r border-white/60 dark:border-white/10 group-data-[collapsible=icon]:border-none"
        >
          <SidebarContentInner slug={slug} pathname={pathname} event={event} />
        </Sidebar>

        <SidebarInset className="min-w-0 overflow-x-hidden bg-black/5 dark:bg-white/2">
          <header className="sticky top-0 z-30 flex min-w-0 h-14 shrink-0 items-center justify-between gap-4 border-b border-white/60 bg-white/80 px-4 backdrop-blur-xl dark:border-white/10 dark:bg-black/40">
            <div className="flex min-w-0 items-center gap-4">
              <SidebarTrigger className="-ml-1" />
              <SidebarSeparator orientation="vertical" className="mr-2 h-4" />
              <div className="flex min-w-0 flex-col gap-0.5">
                <div className="flex min-w-0 items-center gap-2">
                  <h1 className="min-w-0 truncate text-base font-semibold text-foreground">
                    {event.title}
                  </h1>
                  {getStatusBadge(event.isPublished, event.isSignupOpen)}
                </div>
                <div className="flex min-w-0 flex-wrap items-center gap-3 text-xs text-muted-foreground">
                  <span className="font-mono">/{event.slug}</span>
                  <Button asChild variant="link" className="h-auto p-0 text-xs font-medium text-muted-foreground underline-offset-2 hover:text-foreground">
                    <Link href={`/events/${event.slug}`} target="_blank">
                      <ExternalLink className="size-3" />
                      Public page
                    </Link>
                  </Button>
                  <Button asChild variant="link" className="h-auto p-0 text-xs font-medium text-muted-foreground underline-offset-2 hover:text-foreground">
                    <Link href="/dashboard">Go to home</Link>
                  </Button>
                </div>
              </div>
            </div>
          </header>

          <div className="min-w-0 flex-1 overflow-x-hidden p-4 lg:p-6">
            <div className="mx-auto min-w-0 max-w-7xl">
              <div className="animate-in duration-700 fade-in slide-in-from-bottom-2">
                {children}
              </div>
            </div>
          </div>
        </SidebarInset>
      </SidebarProvider>
    </EventDashboardProvider>
  )
}

function SidebarContentInner({
  slug,
  pathname,
  event,
}: {
  slug: string
  pathname: string
  event: NonNullable<ReturnType<typeof useEventBySlug>>
}) {
  const { state: sidebarState, isMobile, setOpenMobile } = useSidebar()

  const menuItems = [
    {
      label: "Overview",
      icon: Calendar,
      href: `/dashboard/events/${slug}`,
    },
    {
      label: "Attendees",
      icon: Users,
      href: `/dashboard/events/${slug}/attendees`,
    },
    {
      label: "Tickets",
      icon: Ticket,
      href: `/dashboard/events/${slug}/tickets`,
    },
    {
      label: "Finance",
      icon: CreditCard,
      href: `/dashboard/events/${slug}/finance`,
    },
    {
      label: "Accommodation",
      icon: BedDouble,
      href: `/dashboard/events/${slug}/accommodation`,
      show: event.accommodationEnabled,
    },
    {
      label: "Settings",
      icon: Settings,
      href: `/dashboard/events/${slug}/settings`,
    },
  ]

  return (
    <>
      <SidebarHeader className="h-[64px] justify-center pt-6 group-data-[collapsible=icon]:h-auto group-data-[collapsible=icon]:p-1 group-data-[collapsible=icon]:pt-4">
          <EventSwitcher
            currentSlug={slug}
            event={event}
            className="group-data-[collapsible=icon]:rounded-none group-data-[collapsible=icon]:border-none group-data-[collapsible=icon]:bg-transparent group-data-[collapsible=icon]:p-0 group-data-[collapsible=icon]:shadow-none group-data-[collapsible=icon]:[&>div]:hidden"
          />
      </SidebarHeader>

      <SidebarContent className="gap-0 px-3 pt-3 group-data-[collapsible=icon]:px-1 group-data-[collapsible=icon]:pt-1">
        <TooltipProvider>
          <nav aria-label="Event navigation" className="space-y-2">
            {menuItems.map((item) => {
              if (item.show === false) return null
              const isActive = getSectionActive(item.label, pathname, slug)
              const Icon = item.icon

              const subpage = pathname.startsWith(`${item.href}/`)
                ? pathname.slice(item.href.length + 1).split("/")[0]
                : null

              return (
                <Tooltip key={item.href}>
                  <TooltipTrigger asChild>
                    <Link
                      href={item.href}
                      aria-current={isActive ? "page" : undefined}
                      onClick={() => {
                        if (isMobile) setOpenMobile(false)
                      }}
                      className={cn(
                        "flex items-start justify-between gap-3 rounded-lg border px-4 py-3 transition-all duration-200",
                        "group-data-[collapsible=icon]:justify-center group-data-[collapsible=icon]:border-none group-data-[collapsible=icon]:bg-transparent group-data-[collapsible=icon]:p-1.5 group-data-[collapsible=icon]:shadow-none",
                        isActive
                          ? "border-primary/25 bg-primary/10 text-foreground shadow-sm"
                          : "border-border/50 bg-background/60 text-muted-foreground hover:border-primary/20 hover:bg-muted/50 hover:text-foreground"
                      )}
                    >
                      <span className="flex min-w-0 items-start gap-3 group-data-[collapsible=icon]:gap-0">
                        <Icon className="mt-0.5 size-4 shrink-0" />
                        <span className="min-w-0 group-data-[collapsible=icon]:hidden">
                          <span className="block text-sm font-semibold leading-none">
                            {item.label}
                          </span>
                          {subpage && (
                            <span className="mt-1 block text-[10px] font-black tracking-[0.2em] text-muted-foreground/50 uppercase">
                              {subpage}
                            </span>
                          )}
                        </span>
                      </span>
                      {isActive && (
                        <ChevronRight className="mt-0.5 size-4 shrink-0 text-primary group-data-[collapsible=icon]:hidden" />
                      )}
                    </Link>
                  </TooltipTrigger>
                  <TooltipContent side="right" className="flex items-center gap-2">
                    <Icon className="size-4 shrink-0" />
                    {item.label}
                    {subpage && (
                      <span className="text-[10px] font-black tracking-[0.2em] text-muted-foreground/70 uppercase">
                        /{subpage}
                      </span>
                    )}
                  </TooltipContent>
                </Tooltip>
              )
            })}
          </nav>
        </TooltipProvider>
      </SidebarContent>

      <SidebarFooter className="p-3 group-data-[collapsible=icon]:p-1">
        <LogoutButton
          className="h-8 w-full rounded-md border border-border/50 bg-background/60 text-[10px] font-black tracking-widest uppercase transition-colors hover:bg-background"
          showIconOnly={sidebarState === "collapsed"}
        />
      </SidebarFooter>
    </>
  )
}

function getSectionActive(label: string, pathname: string, slug: string) {
  const eventRoot = `/dashboard/events/${slug}`

  if (label === "Overview") return pathname === eventRoot
  if (label === "Finance") {
    return ["finance", "payments", "orders", "donation", "reconciliation"].some(
      (section) => pathname === `${eventRoot}/${section}` || pathname.startsWith(`${eventRoot}/${section}/`)
    )
  }
  if (label === "Accommodation") {
    return pathname === `${eventRoot}/accommodation` || pathname.startsWith(`${eventRoot}/accommodation/`)
  }

  return pathname === `/dashboard/events/${slug}/${label.toLowerCase()}` || pathname.startsWith(`/dashboard/events/${slug}/${label.toLowerCase()}/`)
}
