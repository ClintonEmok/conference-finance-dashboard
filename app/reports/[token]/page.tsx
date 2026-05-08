import { api } from "@/convex/_generated/api"
import { convexQuery } from "@/lib/convex/server"
import { PublicReportView } from "@/components/reporting/public-report-view"

export default async function PublicReportPage({
  params,
}: {
  params: Promise<{ token: string }>
}) {
  const { token } = await params
  const report = await convexQuery(api.reports.getFullReportByToken, { token })

  return <PublicReportView report={report} token={token} />
}
