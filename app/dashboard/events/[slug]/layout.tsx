"use client"

import { use } from "react"
import {
  Calendar,
  ChevronRight,
  CreditCard,
  ExternalLink,
  Link2,
  Settings,
  Users,
  Ticket,
  BedDouble,
  ShoppingBag,
  HandCoins,
} from "lucide-react"
import { LogoutButton } from "@/app/dashboard/logout-button"
import Link from "next/link"
import { usePathname } from "next/navigation"

import { EventSwitcher } from "@/components/dashboard/event-switcher"
import { useEventBySlug } from "@/lib/convex/hooks/events"
import { cn } from "@/lib/utils"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { Skeleton } from "@/components/ui/skeleton"
import {
  Sidebar,
  SidebarContent,
  SidebarFooter,
  SidebarHeader,
  SidebarInset,
  SidebarProvider,
  SidebarSeparator,
  SidebarTrigger,
} from "@/components/ui/sidebar"

interface EventLayoutProps {
  children: React.ReactNode
  params: Promise<{ slug: string }>
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

export default function EventLayout({ children, params }: EventLayoutProps) {
  const { slug } = use(params)
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
      label: "Accommodation",
      icon: BedDouble,
      href: `/dashboard/events/${slug}/accommodation`,
      show: event.accommodationEnabled,
    },
    {
      label: "Finance",
      icon: CreditCard,
      href: `/dashboard/events/${slug}/payments`,
    },
    {
      label: "Orders",
      icon: ShoppingBag,
      href: `/dashboard/events/${slug}/orders`,
    },
    {
      label: "Reconciliation",
      icon: HandCoins,
      href: `/dashboard/events/${slug}/reconciliation`,
    },
    {
      label: "Share",
      icon: Link2,
      href: `/dashboard/events/${slug}/share`,
    },
    {
      label: "Settings",
      icon: Settings,
      href: `/dashboard/events/${slug}/settings`,
    },
  ]

  return (
    <SidebarProvider>
      <Sidebar
        collapsible="icon"
        className="border-r border-white/60 dark:border-white/10"
      >
        <SidebarHeader className="h-[64px] justify-center group-data-[collapsible=icon]:px-2">
          <EventSwitcher currentSlug={slug} />
        </SidebarHeader>

        <SidebarContent className="gap-0 px-3 pt-3">
          <nav className="space-y-2">
            {menuItems.map((item) => {
              if (item.show === false) return null
              const isActive =
                item.href === pathname || pathname.startsWith(`${item.href}/`)
              const Icon = item.icon

              return (
                <Link
                  key={item.href}
                  href={item.href}
                  className={cn(
                    "group flex items-start justify-between gap-3 rounded-2xl border px-4 py-3 transition-all duration-200",
                    isActive
                      ? "border-primary/25 bg-primary/10 text-foreground shadow-sm"
                      : "border-border/50 bg-background/60 text-muted-foreground hover:border-primary/20 hover:bg-muted/50 hover:text-foreground"
                  )}
                >
                  <span className="flex min-w-0 items-start gap-3">
                    <Icon className="mt-0.5 size-4 shrink-0" />
                    <span className="min-w-0">
                      <span className="block text-sm font-semibold leading-none">
                        {item.label}
                      </span>
                    </span>
                  </span>
                  {isActive && (
                    <ChevronRight className="mt-0.5 size-4 shrink-0 text-primary" />
                  )}
                </Link>
              )
            })}
          </nav>
        </SidebarContent>

        <SidebarFooter className="p-3">
          <LogoutButton
            className="h-8 w-full rounded-md border border-border/50 bg-background/60 px-3 text-[10px] font-black tracking-widest uppercase transition-colors hover:bg-background"
            showIconOnly={false}
          />
        </SidebarFooter>
      </Sidebar>

      <SidebarInset className="bg-black/5 dark:bg-white/2">
        <header className="sticky top-0 z-30 flex h-14 shrink-0 items-center justify-between gap-4 border-b border-white/60 bg-white/80 px-4 backdrop-blur-xl dark:border-white/10 dark:bg-black/40">
          <div className="flex items-center gap-4">
            <SidebarTrigger className="-ml-1" />
            <SidebarSeparator orientation="vertical" className="mr-2 h-4" />
            <div className="flex flex-col gap-0.5">
              <div className="flex items-center gap-2">
                <h1 className="text-base font-semibold text-foreground">
                  {event.title}
                </h1>
                {getStatusBadge(event.isPublished, event.isSignupOpen)}
              </div>
              <div className="flex items-center gap-3 text-xs text-muted-foreground">
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

        <div className="flex-1 overflow-x-hidden p-4 lg:p-6">
          <div className="mx-auto max-w-7xl">
            <div className="animate-in duration-700 fade-in slide-in-from-bottom-2">
              {children}
            </div>
          </div>
        </div>
      </SidebarInset>
    </SidebarProvider>
  )
}
