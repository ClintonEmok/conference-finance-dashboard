import { expect, it } from "vitest"
import { render } from "@react-email/render"
import SignupConfirmationEmail from "./signup-confirmation"

it("renders the confirmation email with the shared visual system", async () => {
  const html = await render(
    SignupConfirmationEmail({
      bookerName: "Jordan",
      bookingRef: "BK-1",
      eventName: "Spring Conference",
      eventDate: "12/09/2026",
      eventLocation: "Amsterdam",
      tikkieUrl: "https://example.test/pay/BK-1",
      tikkieAmountMinor: 42900,
      tikkieCurrency: "EUR",
      attendeeCount: 2,
      trackPaymentUrl: "https://example.test/booking/BK-1/manage",
      successPageUrl: "https://example.test/signup/success/BK-1",
    })
  )

  expect(html).toContain("Booking Confirmed")
  expect(html).toContain("Booking at a glance")
  expect(html).toContain("BK-1")
  expect(html).toContain("Complete Your Payment")
  expect(html).toContain("https://example.test/booking/BK-1/manage")
  expect(html).toContain("email-button-primary")
  expect(html).toContain("email-button-secondary")
})
