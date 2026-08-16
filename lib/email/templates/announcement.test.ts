import { describe, expect, it } from "vitest"
import { render } from "@react-email/render"
import AnnouncementEmail from "./announcement"
import {
  ANNOUNCEMENT_MESSAGE,
  ANNOUNCEMENT_NOTE,
  ANNOUNCEMENT_TITLE,
} from "../announcement-copy"

const baseProps = {
  title: "Night-before accommodation is now available",
  message:
    "Add an optional night before the conference at a discounted rate.",
  eventName: "Divine Conference",
  eventDate: "Sat 15 Aug 2026",
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
    expect(html).toContain(baseProps.nightBeforeNote!)
    expect(html).toContain(baseProps.manageBookingUrl)
    expect(html).toContain(baseProps.paymentUrl)
    expect(html).toContain(baseProps.signupUrl)
  })

  it("renders the shared standard announcement copy without a venue/location", async () => {
    const html = await render(
      AnnouncementEmail({
        title: ANNOUNCEMENT_TITLE,
        message: ANNOUNCEMENT_MESSAGE,
        eventName: "Divine Conference",
        eventDate: "Sat 15 Aug 2026",
        manageBookingUrl:
          "https://conference.dclm-nl.org/booking/BK-EXAMPLE/manage",
        signupUrl: "https://conference.dclm-nl.org/signup",
        nightBeforeNote: ANNOUNCEMENT_NOTE,
      })
    )
    expect(html).toContain(ANNOUNCEMENT_TITLE)
    expect(html).toContain(ANNOUNCEMENT_MESSAGE)
    expect(html).toContain(ANNOUNCEMENT_NOTE)
    // No venue/location input is required or rendered.
    expect(html).not.toContain(">Location:</strong>")
    expect(html).not.toContain("eventLocation")
    // The manage-booking and register buttons stay present.
    expect(html).toContain("Manage Booking")
    expect(html).toContain("Register for the Conference")
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
