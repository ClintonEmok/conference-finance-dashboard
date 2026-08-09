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
import type { StakeholderReport } from "@/lib/domain/finance/stakeholder-report"

function SliceTable({
  title,
  description,
  rows,
}: {
  title: string
  description: string
  rows: Array<{
    label: string
    count: number
    amountDueMinor: number
    paidMinor: number
    outstandingMinor: number
    overpaidMinor: number
    state?: string
  }>
}) {
  const totals = rows.reduce(
    (acc, row) => {
      acc.count += row.count
      acc.amountDueMinor += row.amountDueMinor
      acc.paidMinor += row.paidMinor
      acc.outstandingMinor += row.outstandingMinor
      acc.overpaidMinor += row.overpaidMinor
      return acc
    },
    {
      count: 0,
      amountDueMinor: 0,
      paidMinor: 0,
      outstandingMinor: 0,
      overpaidMinor: 0,
    }
  )

  return (
    <Card className="border-border/60 bg-background/70 shadow-sm">
      <CardHeader className="space-y-1.5">
        <CardTitle className="text-base">{title}</CardTitle>
        <CardDescription>{description}</CardDescription>
      </CardHeader>
      <CardContent>
        {rows.length === 0 ? (
          <p className="rounded-2xl border border-dashed border-border/60 bg-muted/20 p-5 text-sm text-muted-foreground">
            No aggregate data available.
          </p>
        ) : (
          <div className="overflow-hidden rounded-2xl border border-border/60">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>{title}</TableHead>
                  <TableHead className="text-right">Count</TableHead>
                  <TableHead className="text-right">Due</TableHead>
                  <TableHead className="text-right">Paid</TableHead>
                  <TableHead className="text-right">Outstanding</TableHead>
                  <TableHead className="text-right">Donation</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {rows.map((row) => (
                  <TableRow key={row.state ?? row.label}>
                    <TableCell className="font-medium text-foreground">{row.label}</TableCell>
                    <TableCell className="text-right tabular-nums text-muted-foreground">
                      {row.count}
                    </TableCell>
                    <TableCell className="text-right tabular-nums text-foreground">
                      {formatMoney(row.amountDueMinor)}
                    </TableCell>
                    <TableCell className="text-right tabular-nums text-foreground">
                      {formatMoney(row.paidMinor)}
                    </TableCell>
                    <TableCell className="text-right tabular-nums text-foreground">
                      {formatMoney(row.outstandingMinor)}
                    </TableCell>
                    <TableCell className="text-right tabular-nums text-foreground">
                      {formatMoney(row.overpaidMinor)}
                    </TableCell>
                  </TableRow>
                ))}
                <TableRow className="border-t border-border/20 bg-muted/30 font-semibold">
                  <TableCell className="text-foreground">Total</TableCell>
                  <TableCell className="text-right tabular-nums text-foreground">
                    {totals.count}
                  </TableCell>
                  <TableCell className="text-right tabular-nums text-foreground">
                    {formatMoney(totals.amountDueMinor)}
                  </TableCell>
                  <TableCell className="text-right tabular-nums text-foreground">
                    {formatMoney(totals.paidMinor)}
                  </TableCell>
                  <TableCell className="text-right tabular-nums text-foreground">
                    {formatMoney(totals.outstandingMinor)}
                  </TableCell>
                  <TableCell className="text-right tabular-nums text-foreground">
                    {formatMoney(totals.overpaidMinor)}
                  </TableCell>
                </TableRow>
              </TableBody>
            </Table>
          </div>
        )}
      </CardContent>
    </Card>
  )
}

export function ReportSlices({ report, hideLocation }: { report: StakeholderReport; hideLocation?: boolean }) {
  return (
    <section className="grid gap-6">
      {!hideLocation && (
        <SliceTable
          title="Location"
          description="Where the aggregate participants in this scope come from."
          rows={report.slices.byLocation}
        />
      )}
      <SliceTable
        title="Gender"
        description="A stakeholder-friendly split without exposing individual records."
        rows={report.slices.byGender}
      />
    </section>
  )
}
