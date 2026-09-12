import { expect, it } from "vitest"
import { render } from "@react-email/render"
import PaymentReminderEmail from "./payment-reminder"

it("renders each fixed kind with canonical values and supplied link", async () => {
  for (const kind of ["unpaid", "partial", "overdue"] as const) {
    const html = await render(PaymentReminderEmail({ kind, eventName: "Spring Conference", eventDate: "12/09/2026", bookerName: "Ada", bookingRef: "BK-1", amountDueMinor: 10000, paidAmountMinor: 2500, outstandingAmountMinor: 7500, currency: "EUR", managePaymentUrl: "https://example.test/booking/BK-1/manage" }))
    expect(html).toContain("Spring Conference"); expect(html).toContain("BK-1"); expect(html).toContain("https://example.test/booking/BK-1/manage")
  }
})
