import { Badge } from "@/components/ui/badge"
import { Card, CardContent } from "@/components/ui/card"
import { formatMoney } from "@/lib/format"
import type { StakeholderReport } from "@/lib/domain/finance/stakeholder-report"

export function ReportSummary({ report }: { report: StakeholderReport }) {
  const cards = [
    {
      label: "Collected",
      value: formatMoney(report.totals.paidMinor),
      note: "Canonical payments applied to this report scope.",
    },
    {
      label: "Outstanding",
      value: formatMoney(report.totals.outstandingMinor),
      note: "Amounts still due after allocation.",
    },
    {
      label: "Donation",
      value: formatMoney(report.totals.overpaidMinor),
      note: "Visible donations remaining in the scope.",
    },
    {
      label: "Entries",
      value: report.totals.rows.toLocaleString(),
      note: "Aggregate attendee or fallback rows in the summary.",
    },
  ] as const

  return (
    <section className="space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <p className="text-[10px] font-black tracking-[0.24em] text-muted-foreground uppercase">
            Stakeholder report
          </p>
          <h1 className="mt-2 text-3xl font-bold tracking-tight text-foreground sm:text-4xl">
            {report.event.title}
          </h1>
          <p className="mt-2 max-w-2xl text-sm leading-6 text-muted-foreground">
            Read-only aggregate slices for sharing outside the dashboard shell.
          </p>
        </div>

        <Badge variant="outline" className="rounded-full px-3 py-1">
          Read only
        </Badge>
      </div>

      <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-4">
        {cards.map((card) => (
          <Card key={card.label} className="border-border/60 bg-background/70 shadow-sm">
            <CardContent className="space-y-2 p-5">
              <p className="text-[10px] font-black tracking-[0.22em] text-muted-foreground uppercase">
                {card.label}
              </p>
              <p className="text-3xl font-bold tracking-tight text-foreground">
                {card.value}
              </p>
              <p className="text-xs leading-5 text-muted-foreground">{card.note}</p>
            </CardContent>
          </Card>
        ))}
      </div>
    </section>
  )
}
