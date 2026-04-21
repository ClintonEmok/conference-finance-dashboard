"use client"

import { use } from "react"
import {
  Calendar,
  ChevronRight,
  CreditCard,
  ExternalLink,
  Link as LinkIcon,
  Settings,
  Users,
  Ticket,
  BedDouble,
} from "lucide-react"
import Link from "next/link"
import { usePathname } from "next/navigation"

import { useEventBySlug } from "@/lib/convex/hooks/events"
import { cn } from "@/lib/utils"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
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
          href="/dashboard/events"
          className="mt-6 text-primary hover:underline"
        >
          Back to events
        </Link>
      </div>
    )
  }

  const menuItems = [
    {
      label: "Event overview",
      icon: Calendar,
      href: `/dashboard/events/${slug}`,
    },
    {
      label: "Contact people",
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
    <div className="space-y-6">
      <div className="rounded-2xl border border-white/60 bg-white/50 p-5 shadow-sm backdrop-blur dark:border-white/10 dark:bg-black/20">
        <div className="flex flex-col gap-4 lg:flex-row lg:items-start lg:justify-between">
          <div className="space-y-3">
            <p className="text-[10px] font-black tracking-[0.22em] text-muted-foreground uppercase">
              Event scope
            </p>
            <h1 className="text-3xl font-bold tracking-tight">{event.title}</h1>
            <div className="flex flex-wrap gap-1.5">
              {getStatusBadge(event.isPublished, event.isSignupOpen)}
              <Badge variant="outline" className="h-5 text-[9px]">
                ID: {event.slug}
              </Badge>
            </div>
          </div>

          <div className="flex flex-wrap gap-2">
            <Button asChild variant="outline" className="rounded-xl">
              <Link href={`/events/${event.slug}`} target="_blank">
                <ExternalLink className="size-4" />
                View public page
              </Link>
            </Button>
            <Button asChild variant="ghost" className="rounded-xl">
              <Link href="/dashboard/events">Back to chooser</Link>
            </Button>
          </div>
        </div>

        <nav className="mt-5 flex flex-wrap gap-2">
          {menuItems.map((item) => {
            if (item.show === false) return null
            const isActive = item.href === pathname || pathname.startsWith(`${item.href}/`)
            const Icon = item.icon

            return (
              <Link
                key={item.href}
                href={item.href}
                className={cn(
                  "inline-flex items-center gap-2 rounded-full border px-3 py-1.5 text-xs font-bold transition-all duration-200",
                  isActive
                    ? "border-primary/30 bg-primary text-primary-foreground shadow-sm"
                    : "border-border/50 bg-background/60 text-muted-foreground hover:border-primary/30 hover:text-foreground"
                )}
              >
                <Icon className="size-3.5" />
                <span>{item.label}</span>
                {isActive && <ChevronRight className="size-3 opacity-60" />}
              </Link>
            )
          })}
        </nav>
      </div>
      <div className="min-w-0">
        <div className="animate-in duration-700 fade-in slide-in-from-bottom-2">
          {children}
        </div>
      </div>
    </div>
  )
}
