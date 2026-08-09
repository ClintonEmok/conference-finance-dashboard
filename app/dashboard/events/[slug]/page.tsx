import EventOverviewSurface from "@/components/dashboard/event-overview-surface"

export default function EventOverviewPage({
  params,
}: {
  params: Promise<{ slug: string }>
}) {
  return <EventOverviewSurface params={params} />
}
