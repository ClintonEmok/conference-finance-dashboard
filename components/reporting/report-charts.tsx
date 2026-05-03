import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import type { StakeholderReport } from "@/lib/domain/finance/stakeholder-report"

const PIE_COLORS = ["#7c3aed", "#0f766e", "#f59e0b", "#ef4444", "#64748b", "#14b8a6"]

function DonutChart({
  slices,
  total,
  centerLabel,
  formatValue,
}: {
  slices: Array<{ label: string; value: number; color: string }>
  total: number
  centerLabel: string
  formatValue: (value: number) => string
}) {
  const size = 180
  const strokeWidth = 22
  const radius = (size - strokeWidth) / 2
  const circumference = 2 * Math.PI * radius
  let cursor = 0

  return (
    <div className="flex flex-col gap-4 lg:flex-row lg:items-center">
      <svg viewBox={`0 0 ${size} ${size}`} className="mx-auto size-44 shrink-0">
        <circle
          cx={size / 2}
          cy={size / 2}
          r={radius}
          fill="none"
          stroke="currentColor"
          strokeOpacity="0.08"
          strokeWidth={strokeWidth}
        />
        {slices.map((slice) => {
          const segment = total === 0 ? 0 : (slice.value / total) * circumference
          const offset = circumference - cursor
          cursor += segment

          return (
            <circle
              key={slice.label}
              cx={size / 2}
              cy={size / 2}
              r={radius}
              fill="none"
              stroke={slice.color}
              strokeWidth={strokeWidth}
              strokeDasharray={`${Math.max(segment, 0)} ${circumference - Math.max(segment, 0)}`}
              strokeDashoffset={offset}
              transform={`rotate(-90 ${size / 2} ${size / 2})`}
              strokeLinecap="butt"
            />
          )
        })}
        <text x="50%" y="48%" textAnchor="middle" className="fill-foreground text-[18px] font-bold">
          {formatValue(total)}
        </text>
        <text x="50%" y="60%" textAnchor="middle" className="fill-muted-foreground text-[9px] font-bold tracking-[0.24em] uppercase">
          {centerLabel}
        </text>
      </svg>

      <div className="min-w-0 flex-1 space-y-2">
        {slices.map((slice, index) => (
          <div key={slice.label} className="flex items-center justify-between gap-3 rounded-2xl border border-border/50 bg-muted/20 px-3 py-2">
            <div className="flex min-w-0 items-center gap-3">
              <span className="size-2.5 shrink-0 rounded-full" style={{ backgroundColor: slice.color }} />
              <span className="truncate text-sm font-medium text-foreground">{slice.label}</span>
            </div>
            <div className="text-right text-xs text-muted-foreground">
              <span className="block font-semibold text-foreground">{formatValue(slice.value)}</span>
              <span>{total === 0 ? 0 : Math.round((slice.value / total) * 100)}%</span>
            </div>
          </div>
        ))}
      </div>
    </div>
  )
}

function PieCard({
  title,
  description,
  slices,
  centerLabel,
  formatValue,
}: {
  title: string
  description: string
  slices: Array<{ label: string; value: number }>
  centerLabel: string
  formatValue: (value: number) => string
}) {
  const normalizedSlices = slices.filter((slice) => slice.value > 0)
  const total = normalizedSlices.reduce((sum, slice) => sum + slice.value, 0)
  const visualSlices = normalizedSlices.map((slice, index) => ({
    ...slice,
    color: PIE_COLORS[index % PIE_COLORS.length],
  }))

  return (
    <Card className="border-border/60 bg-background/70 shadow-sm">
      <CardHeader className="space-y-1.5">
        <CardTitle className="text-base">{title}</CardTitle>
        <CardDescription>{description}</CardDescription>
      </CardHeader>
      <CardContent>
        {visualSlices.length === 0 ? (
          <p className="rounded-2xl border border-dashed border-border/60 bg-muted/20 p-5 text-sm text-muted-foreground">
            No aggregate data available.
          </p>
        ) : (
          <DonutChart
            slices={visualSlices}
            total={total}
            centerLabel={centerLabel}
            formatValue={formatValue}
          />
        )}
      </CardContent>
    </Card>
  )
}

export function ReportCharts({ report }: { report: StakeholderReport }) {
  const byLocation = report.slices.byLocation ?? []
  const byGender = report.slices.byGender ?? []
  const byTicketType = report.slices.byTicketType ?? []
  const topLocations = byLocation.slice(0, 5)
  const otherLocations = byLocation.slice(5)
  const locationSlices = [
    ...topLocations.map((row) => ({ label: row.label, value: row.count })),
    ...(otherLocations.length
      ? [
          {
            label: "Other",
            value: otherLocations.reduce((sum, row) => sum + row.count, 0),
          },
        ]
      : []),
  ]

  return (
    <section className="space-y-6">
      <div className="grid gap-6 xl:grid-cols-3">
        <PieCard
          title="Gender mix"
          description="Distribution of individual counts by reported gender."
          slices={byGender.map((row) => ({
            label: row.label,
            value: row.count,
          }))}
          centerLabel="PEOPLE"
          formatValue={(value) => value.toLocaleString()}
        />
        <PieCard
          title="Location mix"
          description="Top locations by individual count, with the remainder grouped into other."
          slices={locationSlices}
          centerLabel="PEOPLE"
          formatValue={(value) => value.toLocaleString()}
        />
        <PieCard
          title="Ticket types"
          description="Distribution of attendee counts by ticket type label."
          slices={byTicketType.map((row) => ({
            label: row.label,
            value: row.count,
          }))}
          centerLabel="PEOPLE"
          formatValue={(value) => value.toLocaleString()}
        />
      </div>
    </section>
  )
}
