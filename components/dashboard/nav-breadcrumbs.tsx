"use client"

import { usePathname } from "next/navigation"
import { Breadcrumb, BreadcrumbItem } from "@/components/ui/breadcrumb"
import { useOptionalEventDashboard } from "@/components/dashboard/event-dashboard-context"

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

/**
 * Navigation labels are for humans (D-08): a dynamic path segment renders as a
 * plain descriptor, never as an identifier. The event segment is the one label
 * that can do better — the shell's EventDashboardProvider already carries the
 * event, so its title is used with no extra read. Without that provider the
 * segment is omitted rather than rendered as slug noise.
 */
export function NavBreadcrumbs() {
  const pathname = usePathname()
  const segments = pathname.split("/").filter(Boolean)
  const eventDashboard = useOptionalEventDashboard()

  // Skip rendering if we're just at /dashboard
  if (segments.length <= 1) return null

  const crumbs = segments.flatMap((segment, index) => {
    const href = `/${segments.slice(0, index + 1).join("/")}`
    const previousSegment = segments[index - 1]

    // The segment after 'events' is the event slug — except on the static
    // /dashboard/events/new route, which is a label in its own right.
    const isEventSlug = previousSegment === "events" && segment !== "new"

    let label: string | undefined = routeMap[segment]
    if (!label) {
      if (isEventSlug) {
        label = eventDashboard?.event.title
      } else if (previousSegment === "attendees") {
        label = "Attendee detail"
      } else if (
        previousSegment === "orders" ||
        previousSegment === "manage-orders"
      ) {
        label = "Order detail"
      } else if (previousSegment === "donations") {
        label = "Donation detail"
      } else if (previousSegment === "rooms") {
        label = "Room detail"
      } else {
        label = segment.charAt(0).toUpperCase() + segment.slice(1)
      }
    }

    return label ? [{ href, label }] : []
  })

  if (crumbs.length === 0) return null

  return (
    <Breadcrumb>
      {crumbs.map((crumb, index) => {
        const isLast = index === crumbs.length - 1

        return (
          <BreadcrumbItem
            key={crumb.href}
            href={isLast ? undefined : crumb.href}
            isLast={isLast}
          >
            {crumb.label}
          </BreadcrumbItem>
        )
      })}
    </Breadcrumb>
  )
}
