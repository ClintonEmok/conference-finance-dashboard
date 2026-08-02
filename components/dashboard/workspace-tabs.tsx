import Link from "next/link"
import type { ReactNode } from "react"
import { cn } from "@/lib/utils"

export function WorkspaceTabs({
  tabs,
  activeTab,
}: {
  tabs: Array<{ value: string; label: string; href: string; count?: number; icon?: ReactNode }>
  activeTab: string
}) {
  return (
    <div role="tablist" aria-label="Workspace tabs" className="flex gap-1 overflow-x-auto">
      {tabs.map((tab) => (
        <Link
          key={tab.value}
          href={tab.href}
          role="tab"
          aria-selected={activeTab === tab.value}
          tabIndex={activeTab === tab.value ? 0 : -1}
          className={cn(
            "inline-flex min-h-11 items-center gap-2 border-b-2 px-3 text-sm font-medium transition-colors focus-visible:ring-2 focus-visible:ring-ring focus-visible:outline-none",
            activeTab === tab.value ? "border-primary text-foreground" : "border-transparent text-muted-foreground hover:text-foreground"
          )}
        >
          {tab.icon}{tab.label}{tab.count !== undefined && <span className="rounded-full bg-muted px-1.5 text-xs tabular-nums">{tab.count}</span>}
        </Link>
      ))}
    </div>
  )
}
