import { formatMoney } from "@/lib/format"
import type { StakeholderReport } from "@/lib/domain/finance/stakeholder-report"

export function ReportSummary({ report }: { report: StakeholderReport }) {
  const cards = [
    {
      label: "Amount Due",
      value: formatMoney(report.totals.amountDueMinor, report.event.currency),
    },
    {
      label: "Collected",
      value: formatMoney(report.totals.paidMinor, report.event.currency),
    },
    {
      label: "Outstanding",
      value: formatMoney(report.totals.outstandingMinor, report.event.currency),
    },
    {
      label: "Donation",
      value: formatMoney(report.totals.overpaidMinor, report.event.currency),
    },
  ]

  return (
    <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-5">
      {cards.map((card) => (
        <div
          key={card.label}
          className="rounded-2xl border border-border/50 bg-muted/20 p-5"
        >
          <p className="text-[10px] font-black tracking-[0.22em] text-muted-foreground uppercase">
            {card.label}
          </p>
          <p className="mt-2 text-3xl font-bold tracking-tight text-foreground">
            {card.value}
          </p>
        </div>
      ))}
    </div>
  )
}
