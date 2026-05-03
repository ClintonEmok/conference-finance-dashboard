import { format } from "date-fns"

import { api } from "@/convex/_generated/api"
import { convexQuery } from "@/lib/convex/server"
import type { StakeholderReport } from "@/lib/domain/finance/stakeholder-report"

import { ReportCharts } from "@/components/reporting/report-charts"
import { ReportSlices } from "@/components/reporting/report-slices"
import { ReportSummary } from "@/components/reporting/report-summary"

export function ReportUnavailableState() {
  return (
    <main className="min-h-svh bg-[radial-gradient(circle_at_top,rgba(113,84,255,0.08),transparent_36%),linear-gradient(180deg,rgba(2,6,23,0.03),transparent_24%)] px-4 py-12 md:px-8 md:py-16">
      <section className="mx-auto flex min-h-[50vh] w-full max-w-4xl items-center justify-center">
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

export function PublicReportView({ report }: { report: StakeholderReport | null }) {
  if (!report) {
    return <ReportUnavailableState />
  }

  return (
    <main className="min-h-svh bg-[radial-gradient(circle_at_top,rgba(113,84,255,0.08),transparent_36%),linear-gradient(180deg,rgba(2,6,23,0.03),transparent_24%)] px-4 py-12 md:px-8 md:py-16">
      <section className="flex w-full flex-col gap-6">
        <header className="rounded-3xl border border-border/60 bg-background/80 p-6 shadow-sm backdrop-blur md:p-8">
          <div className="flex flex-col gap-4">
            <div className="flex flex-wrap items-center justify-between gap-3">
              <div>
                <p className="text-[10px] font-black tracking-[0.24em] text-muted-foreground uppercase">
                  Shareable report
                </p>
                <p className="mt-2 text-sm text-muted-foreground">
                  {report.event.slug} · {report.event.currency} ·{' '}
                  {format(new Date(report.event.startsAt), "PP")}
                </p>
              </div>
              <p className="rounded-full border border-border/60 px-3 py-1 text-xs font-semibold text-muted-foreground">
                Generated {format(new Date(report.generatedAt), "PP p")}
              </p>
            </div>

            <ReportSummary report={report} />
          </div>
        </header>

        <ReportCharts report={report} />

        <ReportSlices report={report} />
      </section>
    </main>
  )
}

export default async function PublicReportPage({
  params,
}: {
  params: Promise<{ token: string }>
}) {
  const { token } = await params
  const report = await convexQuery(api.reports.getReportByToken, { token })

  return <PublicReportView report={report} />
}
