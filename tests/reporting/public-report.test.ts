import { describe, expect, it, vi } from "vitest"
import { createElement } from "react"
import { renderToStaticMarkup } from "react-dom/server"

vi.hoisted(() => {
  process.env.NEXT_PUBLIC_CONVEX_URL = "http://convex.test"
  return {}
})

import {
  PublicReportView,
  ReportUnavailableState,
} from "@/components/reporting/public-report-view"
import { buildStakeholderReport } from "@/lib/domain/finance/stakeholder-report"

describe("public report page", () => {
  const report = buildStakeholderReport({
    generatedAt: "2026-04-25T17:00:00.000Z",
    event: {
      id: "event_1",
      slug: "conference-2026",
      title: "Conference 2026",
      startsAt: 1745606400000,
      currency: "EUR",
    },
      rows: [
        {
          location: "Nairobi",
          genderType: "MALE",
          ticketTypeLabel: "Standard",
          amountDueMinor: 2000,
          paidAmountMinor: 2000,
          createdAt: "2026-04-24T10:00:00.000Z",
        },
        {
          location: "Kampala",
          genderType: "FEMALE",
          ticketTypeLabel: "VIP",
          amountDueMinor: 1000,
          paidAmountMinor: 500,
          createdAt: "2026-04-25T11:00:00.000Z",
        },
        {
          location: null,
          genderType: null,
          ticketTypeLabel: null,
          amountDueMinor: 500,
          paidAmountMinor: 750,
          createdAt: "2026-04-25T12:00:00.000Z",
        },
      ],
    })

  it("renders aggregate-only slices", () => {
    const html = renderToStaticMarkup(
      createElement(PublicReportView, {
        report: {
          event: {
            id: "event_1",
            slug: "conference-2026",
            title: "Conference 2026",
            startsAt: 1745606400000,
            currency: "EUR",
          },
          aggregate: report,
          regionAggregate: null,
          attendees: null,
          locationGroups: null,
        },
        token: "report_token",
      })
    )

    expect(html).toContain("Collected")
    expect(html).toContain("Outstanding")
    expect(html).toContain("Donation")
    expect(html).toContain("Gender mix")
    expect(html).toContain("Ticket types")
    expect(html).toContain("Nairobi")
    expect(html).toContain("Kampala")
    expect(html).toContain("Male")
    expect(html).toContain("Female")
    expect(html).toContain("Unspecified")
    expect(html).not.toContain("Alice Brown")
    expect(html).not.toContain("ORD-")
    expect(html).not.toContain("attendeeId")
  })

  it("renders region details for region-scoped links", () => {
    const attendeesReport = {
      generatedAt: "2026-04-25T17:00:00.000Z",
      event: report.event,
      region: "All attendees",
      totals: { rows: 1, amountDueMinor: 2000, paidMinor: 2000, outstandingMinor: 0, overpaidMinor: 0 },
      orderGroups: [
        {
          orderId: "order_1",
          bookingRef: "ORD-1001",
          providerOrderId: "prov_1",
          orderStatus: "paid" as const,
          orderedAt: "2026-04-24T10:00:00.000Z",
          bookerName: "Alice Brown",
          bookerEmail: "alice@example.com",
          ticketTypeSummary: "Standard",
          amountDueMinor: 2000,
          paidMinor: 2000,
          outstandingMinor: 0,
          overpaidMinor: 0,
          attendeeCount: 1,
          attendees: [
            {
              name: "Alice Brown",
              email: "alice@example.com",
              ticketTypeLabel: "Standard",
              location: "Nairobi",
              amountDueMinor: 2000,
              paidMinor: 2000,
              outstandingMinor: 0,
              overpaidMinor: 0,
            },
          ],
        },
      ],
    }

    const html = renderToStaticMarkup(
      createElement(PublicReportView, {
        report: {
          event: {
            id: "event_1",
            slug: "conference-2026",
            title: "Conference 2026",
            startsAt: 1745606400000,
            currency: "EUR",
          },
          aggregate: null,
          regionAggregate: null,
          attendees: attendeesReport,
          locationGroups: null,
        },
        token: "report_token",
      })
    )

    expect(html).toContain("Conference 2026")
    expect(html).toContain("Alice Brown")
    expect(html).toContain("Register")
    expect(html).toContain("Breakdown")
    expect(html).toContain("Attendee register")
    expect(html).toContain("Search attendee")
    expect(html).toContain("Download CSV")
  })

  it("fails closed with a safe unavailable state", () => {
    const html = renderToStaticMarkup(createElement(ReportUnavailableState))

    expect(html).toContain("invalid or has been revoked")
    expect(html).not.toContain("Alice Brown")
    expect(html).not.toContain("ORD-")
  })
})
