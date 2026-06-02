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
import type { LocationGroup } from "@/lib/domain/finance/stakeholder-report"

export function ReportLocationDetail({
  groups,
  generatedAt,
}: {
  groups: LocationGroup[]
  generatedAt: string
}) {
  const totalAttendees = groups.reduce((sum, g) => sum + g.attendeeCount, 0)
  const totalDue = groups.reduce((sum, g) => sum + g.amountDueMinor, 0)
  const totalPaid = groups.reduce((sum, g) => sum + g.paidMinor, 0)
  const totalOutstanding = groups.reduce((sum, g) => sum + g.outstandingMinor, 0)
  const totalOverpaid = groups.reduce((sum, g) => sum + g.overpaidMinor, 0)

  return (
    <section className="grid gap-6">
      <Card className="border-border/60 bg-background/70 shadow-sm">
        <CardHeader className="space-y-1.5">
          <CardTitle className="text-base">Attendees by location</CardTitle>
          <CardDescription>
            All attendee entries grouped by location. Generated{" "}
            {format(new Date(generatedAt), "PP p")}
          </CardDescription>
          <p className="text-xs text-muted-foreground">
            Attendee amounts are allocated shares of the location total.
          </p>
        </CardHeader>
        <CardContent>
          <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-5">
            {[
              { label: "Attendees", value: totalAttendees.toLocaleString() },
              { label: "Due", value: formatMoney(totalDue) },
              { label: "Paid", value: formatMoney(totalPaid) },
              { label: "Outstanding", value: formatMoney(totalOutstanding) },
              { label: "Donation", value: formatMoney(totalOverpaid) },
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

      {groups.length === 0 ? (
        <p className="rounded-2xl border border-dashed border-border/60 bg-muted/20 p-5 text-sm text-muted-foreground">
          No attendees found.
        </p>
      ) : (
        <div className="grid gap-4">
          {groups.map((group) => (
            <Card
              key={group.location}
              className="border-border/60 bg-background/70 shadow-sm overflow-hidden"
            >
              <details className="group">
                <summary className="flex cursor-pointer list-none items-start justify-between gap-4 bg-muted/10 px-5 py-4 marker:hidden">
                  <div className="flex flex-col gap-2">
                    <span className="font-mono text-lg font-semibold tracking-tight text-foreground">
                      {group.location}
                    </span>
                    <span className="text-sm text-muted-foreground">
                      {group.attendeeCount} attendee
                      {group.attendeeCount !== 1 ? "s" : ""}
                    </span>
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
                        <TableHead className="text-right">Due</TableHead>
                        <TableHead className="text-right">Paid</TableHead>
                        <TableHead className="text-right">Left</TableHead>
                        <TableHead>Ticket</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {group.attendees.map((attendee, i) => (
                        <TableRow key={i}>
                          <TableCell className="font-medium text-foreground">
                            {attendee.name}
                          </TableCell>
                          <TableCell className="text-right tabular-nums text-muted-foreground">
                            {formatMoney(attendee.amountDueMinor)}
                          </TableCell>
                          <TableCell className="text-right tabular-nums text-emerald-600">
                            {formatMoney(attendee.paidMinor)}
                          </TableCell>
                          <TableCell className="text-right tabular-nums text-foreground">
                            {formatMoney(attendee.outstandingMinor)}
                          </TableCell>
                          <TableCell className="text-muted-foreground">
                            {attendee.ticketTypeLabel ?? "–"}
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
