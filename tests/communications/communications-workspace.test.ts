import { describe, expect, it } from "vitest"
import { readFileSync } from "node:fs"
import { resolve } from "node:path"

const ROOT = resolve(import.meta.dirname, "../..")

function readSource(relativePath: string): string {
  return readFileSync(resolve(ROOT, relativePath), "utf8")
}

const WORKSPACE = "components/dashboard/communications/communications-workspace.tsx"
const PANEL = "components/dashboard/communications/broadcasts-panel.tsx"

describe("Communications workspace structure", () => {
  it("exposes the CommunicationsWorkspace component inside the WorkspaceFrame", () => {
    const source = readSource(WORKSPACE)
    expect(source).toContain("export function CommunicationsWorkspace")
    expect(source).toContain("WorkspaceFrame")
    expect(source).toContain("WorkspaceTabs")
    expect(source).toContain("communicationsHref(slug)")
    expect(source).toContain('label: "Broadcast"')
    expect(source).toContain("useEventDashboard")
  })

  it("is audience-only and does not expose the compose/send surface", () => {
    const source = readSource(WORKSPACE)
    expect(source).toContain("AudienceCard")
    expect(source).toContain("BroadcastsPanel")
    expect(source).not.toContain("AnnouncementEmail")
    expect(source).not.toContain("ComposeCard")
    expect(source).not.toContain("TemplateCard")
    expect(source).not.toContain("Send test email")
    expect(source).not.toContain("Confirm broadcast")
  })

  it("finds the audience with a single search bar and no filter controls", () => {
    const source = readSource(WORKSPACE)
    expect(source).toContain("audience-search")
    expect(source).toContain("placeholder=\"Search by name, email, or booking reference\"")
    expect(source).toContain("search: audienceSearch")
    expect(source).not.toContain("aud-status")
    expect(source).not.toContain("aud-location")
    expect(source).not.toContain("aud-from")
    expect(source).not.toContain("aud-to")
    expect(source).not.toContain("aud-ticket")
  })

  it("reads the audience preview and history reactively via useQuery", () => {
    const source = readSource(WORKSPACE)
    expect(source).toContain("api.emailBroadcasts.previewAudience")
    expect(source).toContain("api.emailBroadcasts.getBroadcastHistory")
    expect(source).toContain("limit: MAX_PREVIEW_RECIPIENTS")
    expect(source).toContain("MAX_PREVIEW_RECIPIENTS = 200")
  })

  it("progressively reveals rows up to 200", () => {
    const source = readSource(WORKSPACE)
    expect(source).toContain("visibleCount")
    expect(source).toContain("AUDIENCE_PAGE")
    expect(source).toContain("Show more")
  })
})

describe("unified broadcast delivery-status panel", () => {
  it("keeps the broadcast queries wired across the workspace and panel", () => {
    const workspace = readSource(WORKSPACE)
    const panel = readSource(PANEL)
    expect(workspace).toContain("api.emailBroadcasts.previewAudience")
    expect(workspace).toContain("api.emailBroadcasts.getBroadcastHistory")
    expect(panel).toContain("api.emailBroadcasts.getBroadcastById")
    expect(panel).toContain("api.emailBroadcasts.getBroadcastRecipients")
  })

  it("renders a status-filterable history list with human-readable delivery labels", () => {
    const panel = readSource(PANEL)
    expect(panel).toContain("historyStatusFilter")
    expect(panel).toContain("Queued")
    expect(panel).toContain("Sending")
    expect(panel).toContain("Completed")
    expect(panel).toContain("Failed")
    expect(panel).toContain("Cancelled")
  })

  it("shows delivery progress, timestamps, stored filters, and recipient statuses", () => {
    const panel = readSource(PANEL)
    expect(panel).toContain("progress")
    expect(panel).toContain("sentCount")
    expect(panel).toContain("failedCount")
    expect(panel).toContain("pendingCount")
    expect(panel).toContain("Stored audience filters")
    expect(panel).toContain("recipientStatus")
    expect(panel).toContain("recipient-status-filter")
    expect(panel).toContain("Pending")
    expect(panel).toContain("Sent")
    expect(panel).toContain("Failed")
  })

  it("selects an initial history item without polling", () => {
    const source = readSource(WORKSPACE)
    expect(source).toContain("history[0]._id")
    expect(source).toContain("setSelectedBroadcastId")
  })

  it("supports cancel and retry-failed against the live job", () => {
    const workspace = readSource(WORKSPACE)
    const panel = readSource(PANEL)
    expect(workspace).toContain("cancelEmailBroadcast")
    expect(workspace).toContain("retryFailedEmailBroadcast")
    expect(panel).toContain("Cancel broadcast")
    expect(panel).toContain("Retry")
  })
})

describe("no synchronous bulk send contract", () => {
  it("never loops client-side or hits the dashboard API directly", () => {
    const workspace = readSource(WORKSPACE)
    const panel = readSource(PANEL)
    for (const source of [workspace, panel]) {
      expect(source).not.toContain("window.confirm")
      expect(source).not.toContain("setInterval")
      expect(source).not.toContain("/api/dashboard/")
    }
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
