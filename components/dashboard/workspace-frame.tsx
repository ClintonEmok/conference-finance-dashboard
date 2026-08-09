import type { ReactNode } from "react"
import { workspacePanelId, workspaceTabId } from "@/lib/dashboard/workspace-tabs"

export function WorkspaceFrame({
  title,
  description,
  eventLabel,
  workspaceLabel,
  summary,
  actions,
  tabs,
  workspaceId = "workspace",
  activeTab = "default",
  children,
}: {
  title: string
  description?: string
  eventLabel: string
  workspaceLabel: string
  summary?: ReactNode
  actions?: ReactNode
  tabs: ReactNode
  workspaceId?: string
  activeTab?: string
  children: ReactNode
}) {
  return (
    <main className="min-w-0 space-y-5">
      <header className="flex min-w-0 flex-col gap-4 border-b border-border/60 pb-5 lg:flex-row lg:items-end lg:justify-between">
        <div className="min-w-0 space-y-2">
          <p className="text-xs font-semibold tracking-[0.18em] text-muted-foreground uppercase">{eventLabel} · {workspaceLabel}</p>
          <h1 className="break-words text-3xl font-semibold tracking-tight">{title}</h1>
          {description && <p className="max-w-2xl text-sm text-muted-foreground">{description}</p>}
        </div>
        {actions && <div className="flex max-w-full min-w-0 shrink-0 flex-wrap gap-2">{actions}</div>}
      </header>
      <div className="min-w-0">{summary}</div>
      <nav aria-label={`${workspaceLabel} sections`} className="min-w-0 overflow-hidden border-b border-border/60">{tabs}</nav>
      <section
        id={workspacePanelId(workspaceId)}
        role="tabpanel"
        aria-labelledby={workspaceTabId(workspaceId, activeTab)}
        tabIndex={0}
        className="min-w-0 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2"
      >
        {children}
      </section>
    </main>
  )
}
