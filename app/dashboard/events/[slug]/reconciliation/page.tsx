"use client"

import { useParams } from "next/navigation"

import { WorkspaceFrame } from "@/components/dashboard/workspace-frame"
import { useEventDashboard } from "@/components/dashboard/event-dashboard-context"
import EventReconciliationPage from "@/components/dashboard/finance/legacy-reconciliation-surface"

export default function ReconciliationPage() {
  const { slug } = useParams<{ slug: string }>()
  const { event } = useEventDashboard()

  return (
    <WorkspaceFrame
      title="Reconciliation"
      eventLabel={event.title}
      workspaceLabel="Reconciliation"
      workspaceId="reconciliation"
    >
      <EventReconciliationPage slug={slug} event={event} />
    </WorkspaceFrame>
  )
}
