import Link from "next/link"
import { ArrowRight, CheckCircle2 } from "lucide-react"
import { cn } from "@/lib/utils"
import type {
  AttentionItem,
  WorkspaceAttentionResult,
} from "@/lib/dashboard/workspace-attention"

export type { AttentionItem } from "@/lib/dashboard/workspace-attention"

export function WorkspaceAttentionQueue({
  status = "ready",
  items,
  message,
  title = "Needs attention",
}: {
  status?: WorkspaceAttentionResult["status"]
  items: AttentionItem[]
  message?: string
  title?: string
}) {
  const openCount = items.reduce((total, item) => total + (item.count ?? 1), 0)

  return (
    <section aria-labelledby="workspace-attention" className="rounded-xl border border-border/70 bg-card">
      <div className="flex items-center justify-between gap-3 border-b border-border/60 px-4 py-3">
        <h2 id="workspace-attention" className="text-sm font-semibold">{title}</h2>
        {status === "pending" ? (
          <span className="text-xs text-muted-foreground">Checking…</span>
        ) : status === "error" ? (
          <span className="text-xs text-destructive">Unavailable</span>
        ) : items.length > 0 ? (
          <span className="text-xs text-muted-foreground">{openCount} open</span>
        ) : null}
      </div>
      {status === "pending" ? (
        <div className="px-4 py-4 text-sm text-muted-foreground">Checking current unresolved exceptions…</div>
      ) : status === "error" ? (
        <div className="px-4 py-4 text-sm text-destructive">
          {message ?? "Could not load current exceptions."}
        </div>
      ) : items.length === 0 ? (
        <div className="flex items-center gap-2 px-4 py-4 text-sm text-muted-foreground">
          <CheckCircle2 className="size-4 text-emerald-600" />
          No unresolved exceptions.
        </div>
      ) : (
        <div className="grid divide-y divide-border/60 md:grid-cols-3 md:divide-x md:divide-y-0">
          {items.map((item) => (
            <div key={item.id} className="flex items-center justify-between gap-4 px-4 py-4">
              <div className="min-w-0">
                <p className={cn("text-sm font-medium", item.tone === "urgent" && "text-amber-700 dark:text-amber-400")}>{item.label}</p>
                <p className="mt-1 text-xs text-muted-foreground">{item.detail}</p>
              </div>
              <Link href={item.href} className="inline-flex shrink-0 items-center gap-1 text-xs font-semibold text-primary underline-offset-4 hover:underline focus-visible:ring-2 focus-visible:ring-ring focus-visible:outline-none">
                Open<ArrowRight className="size-3" />
              </Link>
            </div>
          ))}
        </div>
      )}
    </section>
  )
}
