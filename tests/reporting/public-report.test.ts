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
} from "@/app/reports/[token]/page"
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
      createElement(PublicReportView, { report })
    )

    expect(html).toContain("Conference 2026")
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

  it("fails closed with a safe unavailable state", () => {
    const html = renderToStaticMarkup(createElement(ReportUnavailableState))

    expect(html).toContain("invalid or has been revoked")
    expect(html).not.toContain("Alice Brown")
    expect(html).not.toContain("ORD-")
  })
})
