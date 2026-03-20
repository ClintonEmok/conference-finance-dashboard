"use client"

import { useMemo, useState } from "react"
import { ChevronDown, Copy, ExternalLink, RefreshCcw, TimerReset } from "lucide-react"

import { Button } from "@/components/ui/button"
import { cn } from "@/lib/utils"

export type TikkieLinkSummaryRecord = {
  id: string
  paymentRequestToken: string
  paymentRequestUrl: string
  status: "created" | "paid" | "expired"
  statusSource: "create" | "webhook" | "poll"
  amountMinor: number
  description: string
  expiryDate: string
  referenceId: string | null
  providerLastCheckedAt: string | null
  statusUpdatedAt: string
  createdAt: string
  updatedAt: string
  checkState: "fresh" | "stale" | null
}

type TikkieLinkSummaryProps = {
  latestLink: TikkieLinkSummaryRecord | null
  history: TikkieLinkSummaryRecord[]
  isLoading?: boolean
  isCopying?: boolean
  emptyState?: string
  compact?: boolean
  onCopy?: (url: string) => void
  onRefresh?: () => void
}

function formatMoney(minor: number) {
  return new Intl.NumberFormat("en-US", {
    style: "currency",
    currency: "EUR",
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  }).format(minor / 100)
}

function formatDateTime(value: string | null) {
  if (!value) {
    return "-"
  }

  const parsed = new Date(value)

  if (Number.isNaN(parsed.getTime())) {
    return "-"
  }

  return parsed.toLocaleString()
}

function statusLabel(status: TikkieLinkSummaryRecord["status"]) {
  if (status === "paid") {
    return "Paid"
  }

  if (status === "expired") {
    return "Expired"
  }

  return "Created"
}

function sourceLabel(source: TikkieLinkSummaryRecord["statusSource"]) {
  if (source === "webhook") {
    return "Webhook"
  }

  if (source === "poll") {
    return "Poll"
  }

  return "Create"
}

function statusClass(status: TikkieLinkSummaryRecord["status"]) {
  if (status === "paid") {
    return "border-emerald-200 bg-emerald-50 text-emerald-700 dark:border-emerald-900 dark:bg-emerald-950/30 dark:text-emerald-300"
  }

  if (status === "expired") {
    return "border-amber-200 bg-amber-50 text-amber-700 dark:border-amber-900 dark:bg-amber-950/30 dark:text-amber-300"
  }

  return "border-cyan-200 bg-cyan-50 text-cyan-700 dark:border-cyan-900 dark:bg-cyan-950/30 dark:text-cyan-300"
}

export function TikkieLinkSummary({
  latestLink,
  history,
  isLoading = false,
  isCopying = false,
  emptyState = "No Tikkie links generated yet.",
  compact = false,
  onCopy,
  onRefresh,
}: TikkieLinkSummaryProps) {
  const [showHistory, setShowHistory] = useState(false)
  const description = useMemo(() => latestLink?.description?.trim() || "Operator follow-up link", [latestLink])

  if (!latestLink) {
    return (
      <div className="rounded-2xl border border-dashed border-slate-300/80 bg-slate-50/70 px-4 py-3 text-sm text-slate-500 dark:border-slate-700 dark:bg-slate-900/40 dark:text-slate-400">
        {emptyState}
      </div>
    )
  }

  return (
    <div className="space-y-3">
      <div className="rounded-2xl border border-slate-200/80 bg-[linear-gradient(180deg,rgba(255,255,255,0.98),rgba(245,247,251,0.98))] p-4 shadow-sm dark:border-slate-800 dark:bg-[linear-gradient(180deg,rgba(15,23,42,0.9),rgba(17,24,39,0.9))]">
        <div className={cn("flex items-start justify-between gap-3", compact && "flex-col") }>
          <div className="space-y-2">
            <div className="flex flex-wrap items-center gap-2">
              <span className={cn("inline-flex rounded-full border px-2.5 py-1 text-[11px] font-semibold uppercase tracking-[0.16em]", statusClass(latestLink.status))}>
                {statusLabel(latestLink.status)}
              </span>
              {latestLink.checkState === "stale" && (
                <span className="inline-flex rounded-full border border-amber-200 bg-amber-50 px-2.5 py-1 text-[11px] font-semibold uppercase tracking-[0.16em] text-amber-700 dark:border-amber-900 dark:bg-amber-950/30 dark:text-amber-300">
                  Status check stale
                </span>
              )}
            </div>
            <div>
              <p className="text-sm font-semibold text-slate-900 dark:text-slate-100">{description}</p>
              <p className="mt-1 text-xs text-slate-500 dark:text-slate-400">
                {formatMoney(latestLink.amountMinor)} • Token {latestLink.paymentRequestToken}
              </p>
            </div>
          </div>

          <div className={cn("flex flex-wrap gap-2", compact && "w-full") }>
            <Button type="button" variant="secondary" size="sm" disabled={isCopying} onClick={() => onCopy?.(latestLink.paymentRequestUrl)}>
              <Copy className="size-3.5" />
              {isCopying ? "Copying..." : "Copy link"}
            </Button>
            <Button type="button" variant="outline" size="sm" asChild>
              <a href={latestLink.paymentRequestUrl} target="_blank" rel="noreferrer">
                <ExternalLink className="size-3.5" />
                Open link
              </a>
            </Button>
            <Button type="button" variant="ghost" size="sm" disabled={isLoading} onClick={onRefresh}>
              <RefreshCcw className="size-3.5" />
              {isLoading ? "Refreshing..." : "Refresh"}
            </Button>
          </div>
        </div>

        <div className={cn("mt-4 grid gap-3 text-xs text-slate-500 dark:text-slate-400", compact ? "md:grid-cols-2" : "md:grid-cols-4")}>
          <div>
            <p className="font-semibold uppercase tracking-[0.16em]">Last checked</p>
            <p className="mt-1 text-sm text-slate-700 dark:text-slate-200">{formatDateTime(latestLink.providerLastCheckedAt)}</p>
          </div>
          <div>
            <p className="font-semibold uppercase tracking-[0.16em]">Source</p>
            <p className="mt-1 text-sm text-slate-700 dark:text-slate-200">{sourceLabel(latestLink.statusSource)}</p>
          </div>
          <div>
            <p className="font-semibold uppercase tracking-[0.16em]">Expires</p>
            <p className="mt-1 text-sm text-slate-700 dark:text-slate-200">{formatDateTime(latestLink.expiryDate)}</p>
          </div>
          <div>
            <p className="font-semibold uppercase tracking-[0.16em]">Updated</p>
            <p className="mt-1 text-sm text-slate-700 dark:text-slate-200">{formatDateTime(latestLink.statusUpdatedAt)}</p>
          </div>
        </div>
      </div>

      {history.length > 0 && (
        <div className="rounded-2xl border border-slate-200/80 bg-white/75 dark:border-slate-800 dark:bg-slate-950/40">
          <button
            type="button"
            onClick={() => setShowHistory((current) => !current)}
            className="flex w-full items-center justify-between gap-3 px-4 py-3 text-left"
          >
            <div>
              <p className="text-sm font-semibold text-slate-900 dark:text-slate-100">Prior links</p>
              <p className="text-xs text-slate-500 dark:text-slate-400">Keep the latest link in view and expand older links only when needed.</p>
            </div>
            <span className="inline-flex items-center gap-2 text-xs font-semibold uppercase tracking-[0.16em] text-slate-500 dark:text-slate-400">
              {history.length} older
              <ChevronDown className={cn("size-4 transition-transform", showHistory && "rotate-180")} />
            </span>
          </button>

          {showHistory && (
            <div className="space-y-3 border-t border-slate-200/80 px-4 py-4 dark:border-slate-800">
              {history.map((link) => (
                <div key={link.id} className="rounded-xl border border-slate-200/80 bg-slate-50/70 px-3 py-3 dark:border-slate-800 dark:bg-slate-900/60">
                  <div className="flex flex-wrap items-center justify-between gap-2">
                    <div>
                      <p className="text-sm font-medium text-slate-900 dark:text-slate-100">{link.description}</p>
                      <p className="mt-1 text-xs text-slate-500 dark:text-slate-400">{formatMoney(link.amountMinor)} • Token {link.paymentRequestToken}</p>
                    </div>
                    <span className={cn("inline-flex rounded-full border px-2 py-0.5 text-[11px] font-semibold uppercase tracking-[0.16em]", statusClass(link.status))}>
                      {statusLabel(link.status)}
                    </span>
                  </div>

                  <div className="mt-3 flex flex-wrap items-center gap-x-5 gap-y-2 text-xs text-slate-500 dark:text-slate-400">
                    <span className="inline-flex items-center gap-1.5">
                      <TimerReset className="size-3.5" />
                      Last checked {formatDateTime(link.providerLastCheckedAt)}
                    </span>
                    <span>Updated {formatDateTime(link.statusUpdatedAt)}</span>
                    <a className="font-medium text-cyan-700 underline-offset-4 hover:underline dark:text-cyan-300" href={link.paymentRequestUrl} target="_blank" rel="noreferrer">
                      Open
                    </a>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      )}
    </div>
  )
}
