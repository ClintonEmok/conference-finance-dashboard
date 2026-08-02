import Link from "next/link"
import type { ReactNode } from "react"
import { cn } from "@/lib/utils"
import { workspacePanelId, workspaceTabId } from "@/lib/dashboard/workspace-tabs"

export function WorkspaceTabs({
  tabs,
  activeTab,
  workspaceId = "workspace",
}: {
  tabs: Array<{ value: string; label: string; href: string; count?: number; icon?: ReactNode }>
  activeTab: string
  workspaceId?: string
}) {
  return (
    <div role="tablist" aria-label="Workspace tabs" aria-orientation="horizontal" className="flex min-w-0 gap-1 overflow-x-auto">
      {tabs.map((tab) => (
        <Link
          key={tab.value}
          href={tab.href}
          role="tab"
          id={workspaceTabId(workspaceId, tab.value)}
          aria-selected={activeTab === tab.value}
          aria-current={activeTab === tab.value ? "page" : undefined}
          aria-controls={workspacePanelId(workspaceId)}
          aria-label={tab.count !== undefined ? `${tab.label}, ${tab.count}` : tab.label}
          className={cn(
            "inline-flex min-h-11 shrink-0 items-center gap-2 border-b-2 px-3 text-sm font-medium transition-colors focus-visible:ring-2 focus-visible:ring-ring focus-visible:outline-none",
            activeTab === tab.value ? "border-primary text-foreground" : "border-transparent text-muted-foreground hover:text-foreground"
          )}
        >
          {tab.icon ? <span aria-hidden="true">{tab.icon}</span> : null}
          <span>{tab.label}</span>
          {tab.count !== undefined && <span aria-hidden="true" className="rounded-full bg-muted px-1.5 text-xs tabular-nums">{tab.count}</span>}
        </Link>
      ))}
    </div>
  )
}
