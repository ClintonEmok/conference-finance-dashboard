import Link from "next/link"
import { AlertCircle, ArrowRight, CheckCircle2 } from "lucide-react"
import { cn } from "@/lib/utils"
import type {
  AttentionItem,
  WorkspaceAttentionResult,
} from "@/lib/dashboard/workspace-attention"
import { DashboardQueryState } from "@/components/dashboard/dashboard-query-state"

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
  const presentationState =
    status === "pending"
      ? "loading"
      : status === "error"
        ? "error"
        : items.length === 0
          ? "empty"
          : "ready"

  return (
    <section aria-labelledby="workspace-attention" className="rounded-xl border border-border/70 bg-card">
      <div className="flex items-center justify-between gap-3 border-b border-border/60 px-4 py-3">
        <h2 id="workspace-attention" className="text-sm font-semibold">{title}</h2>
        {status === "pending" ? (
          <span className="text-xs text-muted-foreground">Checking…</span>
        ) : status === "error" ? (
          <span className="text-xs text-destructive">Unavailable</span>
        ) : null}
      </div>
      <DashboardQueryState
        state={presentationState}
        message={message}
        readyContent={
          <>
            {items.length === 0 ? (
              <div className="flex items-center gap-2 px-4 py-4 text-sm text-muted-foreground">
                <CheckCircle2 className="size-4 text-emerald-600" aria-hidden="true" />
                No unresolved exceptions.
              </div>
            ) : (
              <div className="divide-y divide-border/60">
                {items.map((item) => (
                  <div
                    key={item.id}
                    className={cn(
                      "flex min-w-0 items-center gap-3 border-l-2 px-4 py-4 sm:px-5",
                      item.tone === "urgent"
                        ? "border-amber-500/70 bg-amber-500/[0.04]"
                        : "border-transparent"
                    )}
                  >
                    <div
                      className={cn(
                        "flex size-9 shrink-0 items-center justify-center rounded-full",
                        item.tone === "urgent"
                          ? "bg-amber-500/10 text-amber-700 dark:text-amber-400"
                          : "bg-muted text-muted-foreground"
                      )}
                    >
                      <AlertCircle className="size-4" aria-hidden="true" />
                    </div>
                    <div className="min-w-0 flex-1">
                      <p className={cn("text-sm font-semibold", item.tone === "urgent" && "text-amber-700 dark:text-amber-400")}>
                        {item.label}
                      </p>
                      <p className="mt-1 text-sm text-muted-foreground">{item.detail}</p>
                    </div>
                    <Link href={item.href} className="inline-flex shrink-0 items-center gap-1.5 rounded-lg border border-border/70 px-3 py-2 text-xs font-semibold text-primary transition-colors hover:border-primary/40 hover:bg-primary/5 focus-visible:ring-2 focus-visible:ring-ring focus-visible:outline-none">
                      Review<ArrowRight className="size-3.5" aria-hidden="true" />
                    </Link>
                  </div>
                ))}
              </div>
            )}
          </>
        }
        className="px-4 py-4"
      />
    </section>
  )
}
