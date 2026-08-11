import { describe, expect, it } from "vitest"
import { readFileSync } from "node:fs"
import { resolve } from "node:path"

const ROOT = resolve(import.meta.dirname, "../..")

function readSource(relativePath: string): string {
  return readFileSync(resolve(ROOT, relativePath), "utf8")
}

const WORKSPACE = "components/dashboard/communications/communications-workspace.tsx"

describe("Communications workspace structure", () => {
  it("exposes the CommunicationsWorkspace component", () => {
    const source = readSource(WORKSPACE)
    expect(source).toContain("export function CommunicationsWorkspace")
  })

  it("renders the four required areas: compose, audience, send, and history", () => {
    const source = readSource(WORKSPACE)
    expect(source).toContain("ComposeCard")
    expect(source).toContain("AudienceCard")
    expect(source).toContain("Send test email")
    expect(source).toContain("HistoryCard")
    expect(source).toContain("ActiveBroadcastCard")
  })

  it("covers all five audience filters", () => {
    const source = readSource(WORKSPACE)
    expect(source).toContain('value="paid"')
    expect(source).toContain("aud-location")
    expect(source).toContain("aud-from")
    expect(source).toContain("aud-to")
    expect(source).toContain("hasAccommodationSelection")
    expect(source).toContain("aud-ticket")
    expect(source).toContain("getTicketTypesForEvent")
  })

  it("reads the audience preview and history reactively via useQuery", () => {
    const source = readSource(WORKSPACE)
    expect(source).toContain("api.emailBroadcasts.previewAudience")
    expect(source).toContain("api.emailBroadcasts.getBroadcastHistory")
    expect(source).toContain("api.emailBroadcasts.getBroadcastById")
    expect(source).toContain("api.emailBroadcasts.getBroadcastRecipients")
  })
})

describe("no synchronous bulk send contract", () => {
  it("schedules broadcasts through the mutation and never loops client-side", () => {
    const source = readSource(WORKSPACE)
    expect(source).toContain("scheduleEmailBroadcast")
    expect(source).toContain("authorize: true")
    expect(source).not.toContain("window.confirm")
    expect(source).not.toContain("setInterval")
    expect(source).not.toContain("/api/dashboard/")
  })

  it("requires explicit confirmation before scheduling", () => {
    const source = readSource(WORKSPACE)
    expect(source).toContain("Confirm broadcast")
    expect(source).toContain('setConfirmOpen(true)')
    expect(source).toContain("handleConfirmSend")
  })

  it("uses the shared single-recipient diagnostic for test-sends", () => {
    const source = readSource(WORKSPACE)
    expect(source).toContain("sendAnnouncementTest")
    expect(source).toContain("api.emailActions.sendAnnouncementTest")
  })

  it("supports cancel and retry-failed against the live job", () => {
    const source = readSource(WORKSPACE)
    expect(source).toContain("cancelEmailBroadcast")
    expect(source).toContain("retryFailedEmailBroadcast")
    expect(source).toContain("Cancel broadcast")
    expect(source).toContain("Retry")
  })
})

describe("navigation wiring", () => {
  it("adds the Communications sidebar item with the Mail icon", () => {
    const layout = readSource("app/dashboard/events/[slug]/layout.tsx")
    expect(layout).toContain('label: "Communications"')
    expect(layout).toContain("icon: Mail")
    expect(layout).toContain("communications")
    expect(layout).toContain(`label === "Communications"`)
  })

  it("mounts the workspace from the canonical event route", () => {
    const page = readSource("app/dashboard/events/[slug]/communications/page.tsx")
    expect(page).toContain("CommunicationsWorkspace")
    expect(page).toContain('useParams<{ slug: string }>()')
  })

  it("builds the communications route via the workspace-routes helper", () => {
    const routes = readSource("lib/dashboard/workspace-routes.ts")
    expect(routes).toContain("export const communicationsHref")
    expect(routes).toContain("/communications")
  })
})
