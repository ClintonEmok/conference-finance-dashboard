import { describe, expect, it } from "vitest"
import { render } from "@react-email/render"
import AnnouncementEmail from "./announcement"

const baseProps = {
  title: "Night-before accommodation is now available",
  message:
    "Add an optional night before the conference at a discounted rate.",
  eventName: "Divine Conference",
  eventDate: "Sat 15 Aug 2026",
  eventLocation: "Koningshof, Netherlands",
  manageBookingUrl: "https://conference.dclm-nl.org/booking/BK-EXAMPLE/manage",
  signupUrl: "https://conference.dclm-nl.org/signup",
  paymentUrl: "https://pay.example.com/example",
  nightBeforeNote:
    "Choose Standard or Superior for the night before when you manage your booking.",
}

describe("announcement email (RUN-02)", () => {
  it("renders final event details, night-before, manage-booking, and payment content", async () => {
    const html = await render(AnnouncementEmail(baseProps))
    expect(html).toContain(baseProps.title)
    expect(html).toContain(baseProps.message)
    expect(html).toContain(baseProps.eventName)
    expect(html).toContain(baseProps.eventDate)
    expect(html).toContain(baseProps.eventLocation)
    expect(html).toContain(baseProps.nightBeforeNote!)
    expect(html).toContain(baseProps.manageBookingUrl)
    expect(html).toContain(baseProps.paymentUrl)
    expect(html).toContain(baseProps.signupUrl)
  })

  it("omits the night-before and payment sections when not provided", async () => {
    const html = await render(
      AnnouncementEmail({
        ...baseProps,
        nightBeforeNote: null,
        paymentUrl: null,
      })
    )
    expect(html).not.toContain(baseProps.nightBeforeNote!)
    expect(html).not.toContain(baseProps.paymentUrl!)
  })
})
