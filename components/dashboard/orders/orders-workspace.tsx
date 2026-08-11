"use client"

import { useMemo } from "react"
import { useSearchParams } from "next/navigation"
import { WorkspaceFrame } from "@/components/dashboard/workspace-frame"
import { WorkspaceTabs } from "@/components/dashboard/workspace-tabs"
import {
  ordersHref,
  parseOrdersIntent,
  parseOrdersTab,
} from "@/lib/dashboard/workspace-routes"
import { useEventDashboard } from "@/components/dashboard/event-dashboard-context"
import { OrdersSurface } from "./orders-surface"
import { OrderDetailSurface } from "./order-detail-surface"

export function OrdersWorkspace({ slug }: { slug: string }) {
  const { event } = useEventDashboard()
  const searchParams = useSearchParams()
  const activeTab = parseOrdersTab(searchParams)
  const { orderId } = parseOrdersIntent(searchParams)
  const tabs = useMemo(() => [
    { value: "orders", label: "Orders", href: ordersHref(slug) },
  ], [slug])

  return <WorkspaceFrame
    title="Orders"
    description="Manage orders, attendees, and payments for this event."
     eventLabel={event.title}
     workspaceLabel="Orders"
     workspaceId="orders"
     activeTab={activeTab}
     tabs={<WorkspaceTabs workspaceId="orders" tabs={tabs} activeTab={activeTab} />}
  >
     {orderId
       ? <OrderDetailSurface slug={slug} orderId={orderId} event={event} />
       : <OrdersSurface slug={slug} event={event} />}
  </WorkspaceFrame>
}
