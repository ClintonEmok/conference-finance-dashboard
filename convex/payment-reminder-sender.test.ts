import { expect, test, vi } from "vitest"

let sentEmail: { subject?: string; text?: string } | null = null

vi.mock("@convex-dev/resend", () => ({
  Resend: class {
    constructor(_component: unknown, _options: unknown) {}

    async sendEmail(
      _ctx: unknown,
      args: { subject?: string; text?: string }
    ) {
      sentEmail = args
      return "email-test-id"
    }
  },
}))

import { sendPaymentReminderEmail } from "./emailActions"
import { PAYMENT_REMINDER_COPY } from "../lib/email/payment-reminder-copy"

test("the shared sender uses the fixed subject and body for every reminder kind", async () => {
  for (const kind of ["unpaid", "partial", "overdue"] as const) {
    sentEmail = null
    const result = await sendPaymentReminderEmail({} as never, {
      to: "buyer@example.com",
      kind,
      eventName: "Spring Conference",
      eventDate: "12/09/2026",
      bookerName: "Ada",
      bookingRef: "BK-1",
      amountDueMinor: 10_000,
      paidAmountMinor: kind === "unpaid" ? 0 : 2_500,
      outstandingAmountMinor: kind === "unpaid" ? 10_000 : 7_500,
      currency: "EUR",
      managePaymentUrl: "https://example.test/booking/BK-1/manage",
    })

    expect(result).toEqual({ success: true, emailId: "email-test-id" })
    expect(sentEmail).not.toBeNull()
    expect(sentEmail!.subject).toBe(PAYMENT_REMINDER_COPY[kind].subject)
    expect(sentEmail!.text).toContain(PAYMENT_REMINDER_COPY[kind].message)
  }
})
