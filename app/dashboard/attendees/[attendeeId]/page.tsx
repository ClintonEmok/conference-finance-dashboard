type AttendeeDetailPlaceholderPageProps = {
  params: Promise<{
    attendeeId: string
  }>
}

export default async function AttendeeDetailPlaceholderPage({
  params,
}: AttendeeDetailPlaceholderPageProps) {
  const { attendeeId } = await params

  return (
    <section className="space-y-4">
      <header>
        <h2 className="text-xl font-semibold">Attendee detail</h2>
        <p className="mt-1 text-sm text-muted-foreground">
          Detailed payment and accommodation workflow arrives in the next plan.
        </p>
      </header>

      <article className="rounded-lg border border-border bg-card p-5 shadow-sm">
        <p className="text-sm text-muted-foreground">
          Placeholder route ready for attendee <span className="font-mono">{attendeeId}</span>.
        </p>
      </article>
    </section>
  )
}
