import { format } from "date-fns"

import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card"
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table"
import { formatMoney } from "@/lib/format"
import {
  getRegionOrderGroups,
  type RegionDetailReport,
} from "@/lib/domain/finance/stakeholder-report"

const STATUS_COLORS: Record<string, string> = {
  paid: "bg-emerald-500/15 text-emerald-600 dark:bg-emerald-500/20 dark:text-emerald-400",
  refunded: "bg-amber-500/15 text-amber-600 dark:bg-amber-500/20 dark:text-amber-400",
  cancelled: "bg-red-500/15 text-red-600 dark:bg-red-500/20 dark:text-red-400",
  pending: "bg-sky-500/15 text-sky-600 dark:bg-sky-500/20 dark:text-sky-400",
}

function StatusBadge({ status }: { status: string }) {
  return (
    <span
      className={`inline-block rounded-full px-2.5 py-0.5 text-[10px] font-black tracking-[0.12em] uppercase ${STATUS_COLORS[status] ?? "bg-muted text-muted-foreground"}`}
    >
      {status}
    </span>
  )
}

export function ReportRegionDetail({
  report,
  descriptionLabel,
}: {
  report: RegionDetailReport
  descriptionLabel?: string
}) {
  const orderGroups = getRegionOrderGroups(report)

  return (
    <section className="grid gap-6">
      <Card className="border-border/60 bg-background/70 shadow-sm">
        <CardHeader className="space-y-1.5">
          <CardTitle className="text-base">{report.region}</CardTitle>
          <CardDescription>
            {descriptionLabel ?? "Orders grouped with attendees for this region."} Generated{" "}
            {format(new Date(report.generatedAt), "PP p")}
          </CardDescription>
        </CardHeader>
        <CardContent>
          <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-5">
            {[
              { label: "Entries", value: report.totals.rows.toLocaleString() },
              { label: "Due", value: formatMoney(report.totals.amountDueMinor) },
              { label: "Paid", value: formatMoney(report.totals.paidMinor) },
              { label: "Outstanding", value: formatMoney(report.totals.outstandingMinor) },
              { label: "Donation", value: formatMoney(report.totals.overpaidMinor) },
            ].map((card) => (
              <div
                key={card.label}
                className="rounded-2xl border border-border/50 bg-muted/20 p-4"
              >
                <p className="text-[10px] font-black tracking-[0.22em] text-muted-foreground uppercase">
                  {card.label}
                </p>
                <p className="mt-2 text-2xl font-bold tracking-tight text-foreground">
                  {card.value}
                </p>
              </div>
            ))}
          </div>
        </CardContent>
      </Card>

      {orderGroups.length === 0 ? (
        <p className="rounded-2xl border border-dashed border-border/60 bg-muted/20 p-5 text-sm text-muted-foreground">
          No attendees found for this region.
        </p>
      ) : (
        <div className="grid gap-4">
          {orderGroups.map((group) => (
            <Card
              key={group.orderId}
              className="border-border/60 bg-background/70 shadow-sm overflow-hidden"
            >
              <details className="group">
                <summary className="flex cursor-pointer list-none items-start justify-between gap-4 bg-muted/10 px-5 py-4 marker:hidden">
                  <div className="flex flex-col gap-2">
                    <div className="flex items-center gap-3">
                      <StatusBadge status={group.orderStatus} />
                      <span className="font-mono text-lg font-semibold tracking-tight text-foreground">
                        {group.bookingRef ?? group.providerOrderId ?? group.orderId.slice(0, 12)}
                      </span>
                    </div>
                    <div className="flex flex-wrap items-center gap-x-3 gap-y-1 text-sm text-muted-foreground">
                      {group.bookerName && <span>{group.bookerName}</span>}
                      {group.bookerEmail && (
                        <span className="text-muted-foreground/70">{group.bookerEmail}</span>
                      )}
                      <span>{format(new Date(group.orderedAt), "PP")}</span>
                    </div>
                    {group.ticketTypeSummary && (
                      <p className="text-sm text-muted-foreground">
                        Tickets: {group.ticketTypeSummary}
                      </p>
                    )}
                  </div>
                  <svg
                    className="mt-1 h-5 w-5 shrink-0 text-muted-foreground transition-transform group-open:rotate-90"
                    viewBox="0 0 20 20"
                    fill="currentColor"
                  >
                    <path
                      fillRule="evenodd"
                      d="M7.21 14.77a.75.75 0 010-1.06L11.168 10 7.21 6.29a.75.75 0 111.08-1.04l4.5 4.25a.75.75 0 010 1.08l-4.5 4.25a.75.75 0 01-1.06-.02z"
                      clipRule="evenodd"
                    />
                  </svg>
                </summary>

                <div className="grid grid-cols-3 gap-4 border-b border-border/20 px-5 py-4">
                  <div>
                    <span className="text-sm text-muted-foreground">Due </span>
                    <span className="mt-1 block text-lg font-semibold tabular-nums text-foreground">
                      {formatMoney(group.amountDueMinor)}
                    </span>
                  </div>
                  <div>
                    <span className="text-sm text-muted-foreground">Paid </span>
                    <span className="mt-1 block text-lg font-semibold tabular-nums text-emerald-500">
                      {formatMoney(group.paidMinor)}
                    </span>
                  </div>
                  <div>
                    <span className="text-sm text-muted-foreground">Outstanding </span>
                    <span className="mt-1 block text-lg font-semibold tabular-nums text-foreground">
                      {formatMoney(group.outstandingMinor)}
                    </span>
                  </div>
                </div>

                <div className="overflow-x-auto">
                  <Table>
                    <TableHeader>
                      <TableRow>
                        <TableHead>Attendee</TableHead>
                        <TableHead>Email</TableHead>
                        <TableHead>Ticket</TableHead>
                        <TableHead>Location</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {group.attendees.map((attendee, i) => (
                        <TableRow key={i}>
                          <TableCell className="font-medium text-foreground">
                            {attendee.name}
                          </TableCell>
                          <TableCell className="text-muted-foreground">
                            {attendee.email ?? "–"}
                          </TableCell>
                          <TableCell className="text-muted-foreground">
                            {attendee.ticketTypeLabel ?? "–"}
                          </TableCell>
                          <TableCell className="text-muted-foreground">
                            {attendee.location ?? report.region}
                          </TableCell>
                        </TableRow>
                      ))}
                    </TableBody>
                  </Table>
                </div>
              </details>
            </Card>
          ))}
        </div>
      )}
    </section>
  )
}
