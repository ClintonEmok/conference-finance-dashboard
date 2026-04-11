"use client"

import { use } from "react"
import {
  Calendar,
  Users,
  Ticket,
  CreditCard,
  Settings,
  Link as LinkIcon,
  BedDouble,
  ChevronRight,
  ExternalLink,
} from "lucide-react"
import Link from "next/link"
import { usePathname } from "next/navigation"

import { useEventBySlug } from "@/lib/convex/hooks/events"
import { cn } from "@/lib/utils"
import { Badge } from "@/components/ui/badge"
import { Skeleton } from "@/components/ui/skeleton"

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
        <Skeleton className="h-24 w-full rounded-2xl" />
        <div className="grid grid-cols-[240px_1fr] gap-6">
          <Skeleton className="h-[400px] rounded-xl" />
          <Skeleton className="h-[600px] rounded-xl" />
        </div>
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
          href="/dashboard/events"
          className="mt-6 text-primary hover:underline"
        >
          Back to events
        </Link>
      </div>
    )
  }

  const menuItems = [
    { label: "Overview", icon: Calendar, href: `/dashboard/events/${slug}` },
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
      label: "Sources",
      icon: LinkIcon,
      href: `/dashboard/events/${slug}/sources`,
    },
    {
      label: "Settings",
      icon: Settings,
      href: `/dashboard/events/${slug}/settings`,
    },
  ]

  return (
    <div className="flex flex-col gap-6 lg:flex-row">
      {/* Secondary Sidebar (Sub-nav) */}
      <aside className="w-full shrink-0 lg:w-64">
        <div className="sticky top-20 space-y-4">
          <div className="flex flex-col gap-4 rounded-2xl border border-white/60 bg-white/40 p-5 shadow-sm backdrop-blur dark:border-white/10 dark:bg-black/20">
            <div className="space-y-1">
              <h2 className="text-xs font-black tracking-[0.2em] text-muted-foreground/50 uppercase">
                Active Event
              </h2>
              <div className="flex flex-col gap-2">
                <h3 className="text-lg leading-tight font-bold tracking-tight">
                  {event.title}
                </h3>
                <div className="flex flex-wrap gap-1.5">
                  {getStatusBadge(event.isPublished, event.isSignupOpen)}
                  <Badge variant="outline" className="h-4 text-[9px]">
                    ID: {event.slug}
                  </Badge>
                </div>
              </div>
            </div>

            <div className="flex flex-col gap-2 border-t border-border/40 pt-4">
              <Link
                href={`/events/${event.slug}`}
                target="_blank"
                className="group flex items-center justify-between rounded-lg px-2 py-1.5 transition-colors hover:bg-primary/10"
              >
                <span className="text-[10px] font-bold text-muted-foreground group-hover:text-primary">
                  View public page
                </span>
                <ExternalLink className="size-3 text-muted-foreground/50 group-hover:text-primary" />
              </Link>
            </div>
          </div>

          <nav className="rounded-2xl border border-white/60 bg-white/40 p-2 shadow-sm backdrop-blur dark:border-white/10 dark:bg-black/20">
            <div className="flex flex-col gap-1">
              {menuItems.map((item) => {
                if (item.show === false) return null
                const isActive = item.href === pathname
                const Icon = item.icon

                return (
                  <Link
                    key={item.href}
                    href={item.href}
                    className={cn(
                      "flex items-center gap-3 rounded-xl px-4 py-2.5 text-sm font-bold transition-all duration-200",
                      isActive
                        ? "bg-primary text-white shadow-lg shadow-primary/20"
                        : "text-muted-foreground hover:bg-muted/50 hover:text-foreground"
                    )}
                  >
                    <Icon
                      className={cn(
                        "size-4",
                        isActive ? "text-white" : "text-primary"
                      )}
                    />
                    <span className="flex-1">{item.label}</span>
                    {isActive && <ChevronRight className="size-3 opacity-50" />}
                  </Link>
                )
              })}
            </div>
          </nav>
        </div>
      </aside>

      {/* Main Context Area */}
      <div className="min-w-0 flex-1">
        <div className="animate-in duration-700 fade-in slide-in-from-bottom-2">
          {children}
        </div>
      </div>
    </div>
  )
}
