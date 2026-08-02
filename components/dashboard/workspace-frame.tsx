import type { ReactNode } from "react"

export function WorkspaceFrame({
  title,
  description,
  eventLabel,
  workspaceLabel,
  summary,
  actions,
  tabs,
  children,
}: {
  title: string
  description?: string
  eventLabel: string
  workspaceLabel: string
  summary?: ReactNode
  actions?: ReactNode
  tabs: ReactNode
  children: ReactNode
}) {
  return (
    <main className="space-y-5">
      <header className="flex flex-col gap-4 border-b border-border/60 pb-5 lg:flex-row lg:items-end lg:justify-between">
        <div className="space-y-2">
          <p className="text-xs font-semibold tracking-[0.18em] text-muted-foreground uppercase">{eventLabel} · {workspaceLabel}</p>
          <h1 className="text-3xl font-semibold tracking-tight">{title}</h1>
          {description && <p className="max-w-2xl text-sm text-muted-foreground">{description}</p>}
        </div>
        {actions && <div className="shrink-0">{actions}</div>}
      </header>
      {summary}
      <nav aria-label={`${workspaceLabel} sections`} className="border-b border-border/60">{tabs}</nav>
      <section>{children}</section>
    </main>
  )
}
