import { NextResponse } from "next/server"

import { api } from "@/convex/_generated/api"
import { convexQuery } from "@/lib/convex/server"
import { buildReportCsv, type ReportView } from "@/lib/domain/finance/stakeholder-report"

function buildFilename(report: ReportView) {
  const datePart = new Date().toISOString().slice(0, 10)

  if (report.kind === "region") {
    const regionPart = report.report.region.toLowerCase().replace(/[^a-z0-9]+/g, "-")
    return `report-${report.report.event.slug}-${regionPart}-${datePart}.csv`
  }

  return `report-${report.report.event.slug}-all-${datePart}.csv`
}

export async function GET(request: Request) {
  const url = new URL(request.url)
  const token = url.searchParams.get("token")?.trim()

  if (!token) {
    return NextResponse.json(
      { error: { code: "BAD_REQUEST", message: "Missing 'token' query param." } },
      { status: 400 }
    )
  }

  try {
    const report = await convexQuery(api.reports.getReportByToken, { token })

    if (!report) {
      return NextResponse.json(
        { error: { code: "NOT_FOUND", message: "Report not found." } },
        { status: 404 }
      )
    }

    const csv = buildReportCsv(report)
    const filename = buildFilename(report)

    return new NextResponse(csv, {
      status: 200,
      headers: {
        "Content-Type": "text/csv; charset=utf-8",
        "Content-Disposition": `attachment; filename="${filename}"`,
      },
    })
  } catch (error) {
    const message = error instanceof Error ? error.message : "Invalid request"

    return NextResponse.json(
      {
        error: {
          code: "INTERNAL_ERROR",
          message: message || "Failed to export report CSV",
        },
      },
      { status: 500 }
    )
  }
}
