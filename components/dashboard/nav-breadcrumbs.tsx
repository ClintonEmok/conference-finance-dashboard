"use client"

import { usePathname } from "next/navigation"
import { Breadcrumb, BreadcrumbItem } from "@/components/ui/breadcrumb"

const routeMap: Record<string, string> = {
  dashboard: "Overview",
  events: "Events",
  financial: "Financial",
  reconciliation: "Reconciliation",
  payments: "Payments",
  orders: "Orders",
  "manage-orders": "Manage Orders",
  attendees: "Attendees",
  accommodation: "Accommodation",
  inventory: "Inventory",
  integrations: "Integrations",
  "ticket-types": "Payment Templates",
  sources: "Sources",
  tickets: "Tickets",
  settings: "Settings",
}

function shortId(segment: string) {
  return segment.length > 12 ? segment.slice(0, 12) : segment
}

export function NavBreadcrumbs() {
  const pathname = usePathname()
  const segments = pathname.split("/").filter(Boolean)

  // Skip rendering if we're just at /dashboard
  if (segments.length <= 1) return null

  return (
    <Breadcrumb>
      {segments.map((segment, index) => {
        const href = `/${segments.slice(0, index + 1).join("/")}`
        const isLast = index === segments.length - 1
        const previousSegment = segments[index - 1]

        // Handle dynamic slug (usually a UUID or conference-slug)
        // If it's not in our map and it's after 'events', it's likely a slug
        const isEventSlug = previousSegment === "events"

        let label = routeMap[segment]
        if (!label) {
          if (isEventSlug) {
            label = segment.toUpperCase()
          } else if (previousSegment === "attendees") {
            label = `Attendee ${shortId(segment)}`
          } else if (previousSegment === "orders" || previousSegment === "manage-orders") {
            label = `Order ${shortId(segment)}`
          } else {
            label = segment.charAt(0).toUpperCase() + segment.slice(1)
          }
        }

        return (
          <BreadcrumbItem
            key={href}
            href={isLast ? undefined : href}
            isLast={isLast}
          >
            {label}
          </BreadcrumbItem>
        )
      })}
    </Breadcrumb>
  )
}
