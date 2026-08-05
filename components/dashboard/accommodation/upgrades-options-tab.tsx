"use client"

import { useMemo } from "react"
import type { ReactNode } from "react"
import { Settings2 } from "lucide-react"

import { DashboardQueryState } from "@/components/dashboard/dashboard-query-state"
import type { EventDashboardEvent } from "@/components/dashboard/event-dashboard-context"
import { useAccommodationCatalog, useEventAccommodationConfig } from "@/lib/convex/hooks/accommodation"
import type { Id } from "@/convex/_generated/dataModel"
import { UpgradesOptionsPendingOrders } from "./upgrades-options-pending-orders"
import { UpgradesOptionsConfigForm } from "./upgrades-options-config-form"
import { UpgradesOptionsCatalog } from "./upgrades-options-catalog"

type ConfigState =
  | { status: "loading" }
  | { status: "error"; message: string }
  | { status: "ready" }

function toConfigState(value: unknown): ConfigState {
  if (value instanceof Error) {
    return { status: "error", message: value.message }
  }
  if (value === undefined) return { status: "loading" }
  return { status: "ready" }
}

export function AccommodationUpgradesOptionsTab({
  event,
}: {
  event: EventDashboardEvent
}) {
  const eventId = event._id as Id<"events">
  const configResult = useEventAccommodationConfig(eventId)
  const catalogResult = useAccommodationCatalog()

  const configState = toConfigState(configResult)
  const catalogState = toConfigState(catalogResult)

  const retry = useMemo(
    () => () => {
      window.location.reload()
    },
    []
  )

  let content: ReactNode

  if (configState.status === "loading") {
    content = (
      <DashboardQueryState state="loading" className="py-10" />
    )
  } else if (configState.status === "error") {
    content = (
      <DashboardQueryState
        state="error"
        title="Upgrades & Options could not be loaded"
        message={configState.message}
        onRetry={retry}
        className="py-10"
      />
    )
  } else {
    const data = configResult as NonNullable<typeof configResult>
    const catalogData =
      catalogResult instanceof Error
        ? null
        : (catalogResult ?? null)
    const catalogAgeBands = (catalogData as {
      ageBands?: Array<{
        _id: Id<"accommodationAgeBands">
        code: string
        label: string
        minAge: number
        maxAge?: number
      }>
    } | null)?.ageBands ?? []
    content = (
      <div className="min-w-0 space-y-5">
        <UpgradesOptionsPendingOrders
          pendingOrders={data.pendingOrders ?? []}
          pendingOrderCount={data.pendingOrderCount ?? 0}
          hasAccommodationSelections={data.hasAccommodationSelections ?? false}
        />
        <UpgradesOptionsConfigForm eventId={eventId} config={data} catalogAgeBands={catalogAgeBands} />
        <UpgradesOptionsCatalog
          catalogState={
            catalogState.status === "error"
              ? { status: "error", message: catalogState.message, onRetry: retry }
              : catalogState.status === "ready"
                ? { status: "ready" as const }
                : { status: "loading" as const }
          }
          catalogResult={catalogResult}
        />
      </div>
    )
  }

  return (
    <div className="min-w-0 space-y-5">
      <div className="flex min-w-0 items-start justify-between gap-3">
        <div className="min-w-0 space-y-1">
          <h2 className="flex items-center gap-2 text-lg font-semibold">
            <Settings2 className="size-4 text-muted-foreground" aria-hidden="true" />
            Upgrades &amp; Options
          </h2>
          <p className="max-w-2xl text-sm text-muted-foreground">
            Configure accommodation pricing and availability for this event. Money and
            availability values are always server-derived; saving never rewrites existing
            orders. Unconfirmed buyer configurations use current rates, while confirmed
            selections keep their snapshot.
          </p>
        </div>
      </div>
      {content}
    </div>
  )
}
