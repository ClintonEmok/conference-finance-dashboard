import type { ReactNode } from "react"

import { Button } from "@/components/ui/button"
import {
  getDashboardQueryStateMetadata,
  type DashboardQueryStatus,
} from "@/lib/dashboard/query-state"
import { cn } from "@/lib/utils"

type DashboardQueryStateProps = {
  state: DashboardQueryStatus
  title?: string
  message?: string
  onRetry?: () => void
  readyContent?: ReactNode
  className?: string
}

export function DashboardQueryState({
  state,
  title,
  message,
  onRetry,
  readyContent,
  className,
}: DashboardQueryStateProps) {
  if (state === "ready") return readyContent ?? null

  const metadata = getDashboardQueryStateMetadata(state, message)
  const isError = state === "error"

  return (
    <div
      role={isError ? "alert" : "status"}
      aria-live={isError ? "assertive" : "polite"}
      className={cn("space-y-2 text-sm", className)}
    >
      <p className="font-medium text-foreground">{title ?? metadata.title}</p>
      <p className="text-muted-foreground">{metadata.message}</p>
      {isError && onRetry ? (
        <Button type="button" variant="outline" size="sm" onClick={onRetry}>
          Try again
        </Button>
      ) : null}
    </div>
  )
}
