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
  attendees: "Attendees",
  accommodation: "Accommodation",
  inventory: "Inventory",
  integrations: "Integrations",
  "ticket-types": "Payment Templates",
  sources: "Sources",
  tickets: "Tickets",
  settings: "Settings",
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
        
        // Handle dynamic slug (usually a UUID or conference-slug)
        // If it's not in our map and it's after 'events', it's likely a slug
        const isEventSlug = segments[index - 1] === "events"
        const label = routeMap[segment] || (isEventSlug ? segment.toUpperCase() : segment.charAt(0).toUpperCase() + segment.slice(1))

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
