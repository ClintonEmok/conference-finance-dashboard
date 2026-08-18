import { describe, expect, it } from "vitest"
import { render } from "@react-email/render"
import AnnouncementEmail from "./announcement"
import {
  ANNOUNCEMENT_MESSAGE,
  ANNOUNCEMENT_NOTE,
  ANNOUNCEMENT_TITLE,
} from "../announcement-copy"

const baseProps = {
  title: "Upgrades and options are now available",
  message:
    "Accommodation upgrades and options are now available for your stay, including upgrades to your included accommodation, an optional night before the conference, and cots.",
  eventName: "Divine Conference",
  eventDate: "Sat 15 Aug 2026",
  manageBookingUrl: "https://conference.dclm-nl.org/booking/BK-EXAMPLE/manage",
  signupUrl: "https://conference.dclm-nl.org/signup",
  paymentUrl: "https://pay.example.com/example",
  nightBeforeNote:
    "Manage your booking to choose the available accommodation options for your stay, including Standard or Superior upgrades, night-before accommodation, and a cot.",
}

describe("announcement email (RUN-02)", () => {
  it("renders final event details, links, and support contact", async () => {
    const html = await render(AnnouncementEmail(baseProps))
    expect(html).toContain(baseProps.title)
    expect(html).toContain(baseProps.message)
    expect(html).toContain(baseProps.eventName)
    expect(html).toContain(baseProps.eventDate)
    expect(html).toContain(baseProps.nightBeforeNote!)
    expect(html).toContain(baseProps.manageBookingUrl)
    expect(html).toContain(baseProps.paymentUrl)
    expect(html).toContain(baseProps.signupUrl)
    expect(html).toContain("Review Payment")
    expect(html).toContain("it-support@deeperlife.nl")
    expect(html).not.toContain("Payments are handled separately via Tikkie.")
    expect(html).toContain("email-event-details")
    expect(html).toContain("email-callout")
    expect(html).toContain("width:100%")
    expect(html).toContain("box-sizing:border-box")
    expect(html).toContain("padding:24px 28px 0")
    expect(html).toContain("margin:0")
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
