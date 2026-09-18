"use client"

import { useMemo } from "react"
import Link from "next/link"
import { useQuery } from "convex/react"
import { ArrowRight } from "lucide-react"

import { Button } from "@/components/ui/button"
import { WorkspaceFrame } from "@/components/dashboard/workspace-frame"
import { WorkspaceAttentionQueue } from "@/components/dashboard/workspace-attention-queue"
import { useEventDashboard } from "@/components/dashboard/event-dashboard-context"
import EventPaymentsPage from "./legacy-payments-surface"
import { api } from "@/lib/convex/api"
import {
  buildFinanceAttentionItems,
  type AttentionQueryState,
} from "@/lib/dashboard/workspace-attention"
import {
  paymentsHref,
  reconciliationHref,
} from "@/lib/dashboard/workspace-routes"
import type { Doc } from "@/convex/_generated/dataModel"
import type { ReconciliationOrderRow } from "./legacy-reconciliation-surface"

function toQueryState<T>(value: T | Error | undefined): AttentionQueryState<T> {
  if (value instanceof Error) return { status: "error", message: value.message }
  if (value === undefined) return { status: "pending" }
  return { status: "ready", data: value }
}

export function PaymentsWorkspace({ slug }: { slug: string }) {
  const { event } = useEventDashboard()

  const reconciliationResult = useQuery(api.orders.getOrdersForReconciliation, {
    eventId: event._id,
    limit: 250,
  })
  const unassignedPaymentsResult = useQuery(api.payments.getUnassignedPayments, {})

  const reconciliationState = toQueryState(
    reconciliationResult as
      | ReadonlyArray<ReconciliationOrderRow>
      | Error
      | undefined
  )
  const unassignedPaymentsState = toQueryState(
    unassignedPaymentsResult as
      | ReadonlyArray<Doc<"payments">>
      | Error
      | undefined
  )

  const attention = useMemo(
    () =>
      buildFinanceAttentionItems(
        {
          reconciliation: reconciliationState,
          unassignedPayments: unassignedPaymentsState,
        },
        {
          reconciliation: reconciliationHref(slug),
          payments: paymentsHref(slug),
        }
      ),
    [reconciliationState, unassignedPaymentsState, slug]
  )

  return (
    <WorkspaceFrame
      title="Payments"
      description="Payments linked to this event, plus unassigned payments."
      eventLabel={event.title}
      workspaceLabel="Payments"
      workspaceId="payments"
      actions={
        <Button
          asChild
          variant="outline"
          size="sm"
          className="h-9 rounded-lg px-4 text-xs font-bold tracking-wider uppercase"
        >
          <Link href={reconciliationHref(slug)}>
            Match a payment
            <ArrowRight className="ml-2 size-3" aria-hidden="true" />
          </Link>
        </Button>
      }
      summary={<WorkspaceAttentionQueue {...attention} />}
    >
      <EventPaymentsPage slug={slug} event={event} unassignedPayments={unassignedPaymentsState} />
    </WorkspaceFrame>
  )
}
