"use client"

import Link from "next/link"
import { format } from "date-fns"
import { useState } from "react"

import type { FullReportView } from "@/convex/reports"

import { Button } from "@/components/ui/button"
import { ReportCharts } from "@/components/reporting/report-charts"
import { ReportLocationDetail } from "@/components/reporting/report-location-detail"
import { ReportRegionDetail } from "@/components/reporting/report-region-detail"
import { ReportSlices } from "@/components/reporting/report-slices"
import { ReportSummary } from "@/components/reporting/report-summary"

export function ReportUnavailableState() {
  return (
    <main className="min-h-svh bg-[radial-gradient(circle_at_top,rgba(113,84,255,0.08),transparent_36%),linear-gradient(180deg,rgba(2,6,23,0.03),transparent_24%)] px-4 py-12 md:px-8 md:py-16">
      <section className="flex min-h-[50vh] w-full items-center justify-center">
        <div className="w-full rounded-3xl border border-border/60 bg-background/80 p-8 shadow-sm backdrop-blur md:p-10">
          <p className="text-[10px] font-black tracking-[0.24em] text-muted-foreground uppercase">
            Report unavailable
          </p>
          <h1 className="mt-3 text-3xl font-bold tracking-tight text-foreground">
            This stakeholder link is invalid or has been revoked.
          </h1>
          <p className="mt-4 max-w-2xl text-sm leading-6 text-muted-foreground">
            Ask the event organizer for a fresh reporting link. No private finance
            data is shown on this page.
          </p>
        </div>
      </section>
    </main>
  )
}

function TabButton({
  active,
  onClick,
  children,
}: {
  active: boolean
  onClick: () => void
  children: React.ReactNode
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={`rounded-lg px-4 py-2 text-sm font-semibold transition-colors ${
        active
          ? "bg-primary/10 text-primary"
          : "text-muted-foreground hover:text-foreground"
      }`}
    >
      {children}
    </button>
  )
}

export function PublicReportView({
  report,
  token,
}: {
  report: FullReportView | null
  token: string
}) {
  const [tab, setTab] = useState<"summary" | "details">("summary")
  const [detailView, setDetailView] = useState<"attendees" | "locations">("attendees")

  if (!report) {
    return <ReportUnavailableState />
  }

  const hasSummary = !!(report.aggregate ?? report.regionAggregate)
  const hasLocations = !!(report.locationGroups?.length)

  const effectiveTab =
    tab === "summary" && !hasSummary
      ? "details"
      : tab === "details" && !hasLocations
        ? "details"
        : tab

  const summaryReport = report.aggregate ?? report.regionAggregate
  const effectiveDetailView =
    detailView === "locations" && !hasLocations ? "attendees" : detailView

  return (
    <main className="min-h-svh bg-[radial-gradient(circle_at_top,rgba(113,84,255,0.08),transparent_36%),linear-gradient(180deg,rgba(2,6,23,0.03),transparent_24%)] px-4 py-12 md:px-8 md:py-16">
      <section className="flex w-full flex-col gap-6">
        <header className="flex items-center justify-between gap-4 rounded-3xl border border-border/60 bg-background/80 px-6 py-4 shadow-sm backdrop-blur md:px-8">
          <div className="flex items-center gap-4">
            <h1 className="text-lg font-semibold tracking-tight text-foreground">
              {report.event.title}
            </h1>
            <span className="hidden text-xs text-muted-foreground sm:inline">
              {format(new Date(report.event.startsAt), "PP")}
            </span>
            <p className="rounded-full border border-border/50 px-2.5 py-0.5 text-[10px] font-semibold text-muted-foreground">
              Generated {format(new Date(report.attendees?.generatedAt ?? summaryReport?.generatedAt ?? ""), "PP p")}
            </p>
          </div>

          <div className="flex items-center gap-3">
            <div className="flex gap-1 rounded-xl bg-muted/50 p-1">
              <TabButton active={effectiveTab === "summary"} onClick={() => setTab("summary")}>
                Summary
              </TabButton>
              <TabButton active={effectiveTab === "details"} onClick={() => setTab("details")}>
                Details
              </TabButton>
            </div>
            <Button asChild variant="outline" className="rounded-full px-3 py-1 text-xs">
              <Link href={`/api/reports/export?token=${encodeURIComponent(token)}`}>
                Download CSV
              </Link>
            </Button>
          </div>
        </header>

        {effectiveTab === "summary" && summaryReport && (
          <div className="flex flex-col gap-6">
            <ReportSummary report={summaryReport} />
            <ReportCharts report={summaryReport} hideLocation={!!report.regionAggregate} />
            <ReportSlices report={summaryReport} hideLocation={!!report.regionAggregate} />
          </div>
        )}

        {effectiveTab === "details" && (
          <div className="flex flex-col gap-4">
            <div className="flex flex-wrap gap-1 rounded-2xl border border-border/60 bg-background/80 p-1 shadow-sm backdrop-blur">
              <TabButton active={effectiveDetailView === "attendees"} onClick={() => setDetailView("attendees")}>
                Grouped by order
              </TabButton>
              {hasLocations && (
                <TabButton active={effectiveDetailView === "locations"} onClick={() => setDetailView("locations")}>
                  By Location
                </TabButton>
              )}
            </div>

            {effectiveDetailView === "attendees" && report.attendees && (
              <ReportRegionDetail report={report.attendees} descriptionLabel="All attendee entries grouped by order." />
            )}

            {effectiveDetailView === "locations" && report.locationGroups && (
              <ReportLocationDetail
                groups={report.locationGroups}
                generatedAt={report.attendees?.generatedAt ?? report.aggregate?.generatedAt ?? report.regionAggregate?.generatedAt ?? ""}
              />
            )}
          </div>
        )}
      </section>
    </main>
  )
}
