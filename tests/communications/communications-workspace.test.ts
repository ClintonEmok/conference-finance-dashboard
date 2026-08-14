import { describe, expect, it } from "vitest"
import { readFileSync } from "node:fs"
import { resolve } from "node:path"

const ROOT = resolve(import.meta.dirname, "../..")

function readSource(relativePath: string): string {
  return readFileSync(resolve(ROOT, relativePath), "utf8")
}

const WORKSPACE = "components/dashboard/communications/communications-workspace.tsx"
const PANEL = "components/dashboard/communications/broadcasts-panel.tsx"
const DRAFTS = "lib/dashboard/communications/drafts.ts"

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

  it("renders the real AnnouncementEmail template in a debounced iframe preview", () => {
    const source = readSource(WORKSPACE)
    expect(source).toContain('import { render } from "@react-email/render"')
    expect(source).toContain("import AnnouncementEmail")
    expect(source).toContain("<iframe")
    expect(source).toContain("srcDoc={previewHtml}")
    expect(source).toContain("setTimeout")
    expect(source).toContain("BK-EXAMPLE/manage")
    expect(source).toContain("signup/${event.slug}")
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
    expect(source).toContain("limit: MAX_PREVIEW_RECIPIENTS")
    expect(source).toContain("MAX_PREVIEW_RECIPIENTS = 200")
  })

  it("searches the audience client-side and progressively reveals rows to 200", () => {
    const source = readSource(WORKSPACE)
    expect(source).toContain("audienceSearch")
    expect(source).toContain('bookerName ?? ""')
    expect(source).toContain("bookerEmail.toLowerCase()")
    expect(source).toContain('bookingRef ?? ""')
    expect(source).toContain("visibleCount")
    expect(source).toContain("AUDIENCE_PAGE")
    expect(source).toContain("Show more")
  })

  it("persists event-keyed compose drafts and restores them on mount", () => {
    const source = readSource(WORKSPACE)
    const drafts = readSource(DRAFTS)
    expect(source).toContain("readComposeDraft(String(event._id))")
    expect(source).toContain("writeComposeDraft(String(event._id)")
    expect(source).toContain("removeComposeDraft(String(event._id))")
    expect(drafts).toContain("localStorage")
    expect(drafts).toContain("export function readComposeDraft")
    expect(drafts).toContain("export function writeComposeDraft")
    expect(drafts).toContain("export function removeComposeDraft")
  })

  it("wires event-scoped saved announcement templates into compose", () => {
    const source = readSource(WORKSPACE)
    expect(source).toContain("api.emailTemplates.getTemplatesForEvent")
    expect(source).toContain("api.emailTemplates.saveTemplate")
    expect(source).toContain("api.emailTemplates.deleteTemplate")
    expect(source).toContain("Save as template")
    expect(source).toContain("Discard template")
  })

  it("summarizes the audience with human-readable ticket labels", () => {
    const workspace = readSource(WORKSPACE)
    const panel = readSource(PANEL)
    expect(workspace).toContain("describeFilters(filters, ticketTypes)")
    expect(panel).toContain("export function describeFilters")
    expect(panel).toContain("ticketTypeId")
    expect(panel).toContain("label ?? String(filters.ticketTypeId)")
  })
})

describe("unified broadcast master-detail panel", () => {
  it("keeps the four broadcast queries wired across the workspace and panel", () => {
    const workspace = readSource(WORKSPACE)
    const panel = readSource(PANEL)
    expect(workspace).toContain("api.emailBroadcasts.previewAudience")
    expect(workspace).toContain("api.emailBroadcasts.getBroadcastHistory")
    expect(panel).toContain("api.emailBroadcasts.getBroadcastById")
    expect(panel).toContain("api.emailBroadcasts.getBroadcastRecipients")
  })

  it("renders a status-filterable history list with human-readable labels", () => {
    const panel = readSource(PANEL)
    expect(panel).toContain("historyStatusFilter")
    expect(panel).toContain("Queued")
    expect(panel).toContain("Sending")
    expect(panel).toContain("Completed")
    expect(panel).toContain("Failed")
    expect(panel).toContain("Cancelled")
  })

  it("shows detail progress, timestamps, stored filters, and status-filtered recipients", () => {
    const panel = readSource(PANEL)
    expect(panel).toContain("progress")
    expect(panel).toContain("sentCount")
    expect(panel).toContain("failedCount")
    expect(panel).toContain("pendingCount")
    expect(panel).toContain("Stored audience filters")
    expect(panel).toContain("recipientStatus")
    expect(panel).toContain("recipient-status-filter")
  })

  it("selects an initial history item without polling", () => {
    const source = readSource(WORKSPACE)
    expect(source).toContain("history[0]._id")
    expect(source).toContain("setSelectedBroadcastId")
  })
})

describe("no synchronous bulk send contract", () => {
  it("schedules broadcasts through the mutation and never loops client-side", () => {
    const workspace = readSource(WORKSPACE)
    const panel = readSource(PANEL)
    expect(workspace).toContain("scheduleEmailBroadcast")
    expect(workspace).toContain("authorize: true")
    for (const source of [workspace, panel]) {
      expect(source).not.toContain("window.confirm")
      expect(source).not.toContain("setInterval")
      expect(source).not.toContain("/api/dashboard/")
    }
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
    const workspace = readSource(WORKSPACE)
    const panel = readSource(PANEL)
    expect(workspace).toContain("cancelEmailBroadcast")
    expect(workspace).toContain("retryFailedEmailBroadcast")
    expect(panel).toContain("Cancel broadcast")
    expect(panel).toContain("Retry")
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
