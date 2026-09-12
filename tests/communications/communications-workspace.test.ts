import { describe, expect, it } from "vitest"
import { readFileSync } from "node:fs"
import { resolve } from "node:path"

const ROOT = resolve(import.meta.dirname, "../..")

function readSource(relativePath: string): string {
  return readFileSync(resolve(ROOT, relativePath), "utf8")
}

const WORKSPACE =
  "components/dashboard/communications/communications-workspace.tsx"
const PANEL = "components/dashboard/communications/broadcasts-panel.tsx"
const REMINDER_CARD =
  "components/dashboard/communications/payment-reminder-card.tsx"
const TEMPLATES = "components/dashboard/communications/template-library.tsx"
const COPY = "lib/email/announcement-copy.ts"

describe("Communications workspace structure", () => {
  it("exposes the CommunicationsWorkspace component inside the WorkspaceFrame", () => {
    const source = readSource(WORKSPACE)
    expect(source).toContain("export function CommunicationsWorkspace")
    expect(source).toContain("WorkspaceFrame")
    expect(source).toContain("WorkspaceTabs")
    expect(source).toContain('communicationsHref(slug, "send")')
    for (const view of [
      "Send",
      "Templates",
      "Audience",
      "Reminders",
      "History",
    ]) {
      expect(source).toContain(`label: "${view}"`)
    }
    expect(source).toContain("useEventDashboard")
  })

  it("keeps template previews in a dedicated library", () => {
    const source = readSource(TEMPLATES)
    expect(source).toContain("TemplateLibrary")
    expect(source).toContain('from "@/lib/email/templates/announcement"')
    expect(source).toContain("AnnouncementEmail({")
    expect(source).toContain("render(")
    expect(source).toContain("srcDoc={props.html}")
    expect(source).toContain("title: ANNOUNCEMENT_TITLE")
    expect(source).toContain("setPreviewHtml(null)")
    expect(source).toContain("setPreviewError(null)")
    expect(source).toContain("setPreviewOpen(true)")
    expect(source).toContain("Preview")
  })

  it("shares one fixed standard copy module with no compose/venue/location controls", () => {
    const source = readSource(TEMPLATES)
    const copy = readSource(COPY)
    expect(copy).toContain("Upgrades and options are now available")
    expect(copy).toContain(
      "Accommodation upgrades and options are now available for your stay, including upgrades to your included accommodation, an optional night before the conference, and cots."
    )
    expect(copy).toContain(
      "Manage your booking to choose the available accommodation options for your stay, including Standard or Superior upgrades, night-before accommodation, and a cot."
    )
    // No manual compose fields, no template CRUD, no venue/location input.
    expect(source).not.toContain("ComposeCard")
    expect(source).not.toContain("Send test email")
    expect(source).not.toContain("eventLocation")
    expect(source).not.toContain('placeholder="Subject')
  })

  it("finds the audience with a single search bar and no filter controls", () => {
    const source = readSource(WORKSPACE)
    expect(source).toContain("audience-search")
    expect(source).toContain(
      'placeholder="Search by name, email, or booking reference"'
    )
    expect(source).toContain("search: audienceSearch.trim()")
    expect(source).not.toContain("aud-status")
    expect(source).not.toContain("aud-location")
    expect(source).not.toContain("aud-from")
    expect(source).not.toContain("aud-to")
    expect(source).not.toContain("aud-ticket")
  })

  it("reads the audience preview and history reactively via useQuery", () => {
    const source = readSource(WORKSPACE)
    expect(source).toContain("useConvexAuth")
    expect(source).toContain("const canQuery = isAuthenticated && !authLoading")
    expect(source).toContain("api.emailBroadcasts.previewAudience")
    expect(source).toContain("api.emailBroadcasts.getBroadcastHistory")
    expect(source).toContain("previewAudienceEnabled")
    expect(source).toContain("paymentPreviewEnabled")
    expect(source).toContain("historyEnabled")
    expect(source).toContain("limit: MAX_PREVIEW_RECIPIENTS")
    expect(source).toContain("MAX_PREVIEW_RECIPIENTS = 200")
  })

  it("renders dedicated views instead of one mixed communications stream", () => {
    const source = readSource(WORKSPACE)
    expect(source).toContain('activeView === "send"')
    expect(source).toContain('activeView === "templates"')
    expect(source).toContain('activeView === "audience"')
    expect(source).toContain('activeView === "reminders"')
    expect(source).toContain('activeView === "history"')
    expect(source).toContain("parseCommunicationsView")
    expect(source).toContain("activeTab={activeView}")
    expect(source).not.toContain('id="communications-tabpanel"')
  })

  it("progressively reveals rows up to 200", () => {
    const source = readSource(WORKSPACE)
    expect(source).toContain("visibleCount")
    expect(source).toContain("AUDIENCE_PAGE")
    expect(source).toContain("Show more")
  })
})

describe("guided email send flow", () => {
  it("asks for the email type before opening recipient selection", () => {
    const source = readSource(WORKSPACE)
    expect(source).toContain("Dialog")
    expect(source).toContain("What kind of email do you want to send?")
    expect(source).toContain("Choose recipients")
    expect(source).toContain("setComposerOpen(true)")
    expect(source).not.toContain("window.confirm")
  })

  it("schedules the selected email type with an explicit or all-matching server scope", () => {
    const source = readSource(WORKSPACE)
    expect(source).toContain("api.emailBroadcasts.scheduleEmailBroadcast")
    expect(source).toContain("selectionFor(selectedRecipientIds, allMatching)")
    expect(source).toContain('mode: "allMatching"')
    expect(source).toContain(
      "api.paymentReminders.scheduleManualPaymentReminders"
    )
    expect(source).toContain("authorize: true")
    expect(source).toContain(
      "setSelectedBroadcastId(String(result.broadcastId))"
    )
  })

  it("keeps recipient selection in the shared composer", () => {
    const source = readSource(WORKSPACE)
    expect(source).toContain("PaymentReminderCard")
    expect(source).toContain("selectedRecipientIds")
    expect(source).toContain("All eligible")
    expect(source).toContain("onToggle={(id) =>")
    expect(source).toContain('type="checkbox"')
    expect(source).not.toContain("selectedPaymentIds")
    expect(source).not.toContain("selectedAnnouncementIds")
  })

  it("never sends when the audience is empty", () => {
    const source = readSource(WORKSPACE)
    expect(source).toContain("selectedCount === 0")
    expect(source).toContain("disabled={props.audienceTotal === 0}")
    expect(source).toContain("audienceTotal === 0")
  })

  it("disables duplicate submissions while a send is pending", () => {
    const source = readSource(WORKSPACE)
    expect(source).toContain("sendPending")
    expect(source).toContain("disabled={!props.canSend || props.sendPending}")
    expect(source).toContain("function changeEmailKind")
    expect(source).toContain("setSelectedRecipientIds(new Set())")
    expect(source).toContain("setAllMatching(false)")
  })
})

describe("payment reminder card", () => {
  it("renders authenticated settings and per-delivery history without templates", () => {
    const source = readSource(REMINDER_CARD)
    expect(source).toContain("useConvexAuth")
    expect(source).toContain('("skip" as const)')
    expect(source).toContain("api.paymentReminders.getReminderDeliveryHistory")
    expect(source).toContain("Payment reminder automation")
    for (const status of ["queued", "sent", "failed", "skipped"]) {
      expect(source).toContain(status)
    }
    expect(source).toContain("STATUS_LABELS[delivery.status]")
    expect(source).toContain("parseUtcDateTimeLocal")
    expect(source).toContain("Date.UTC")
    expect(source).not.toContain("iframe")
  })

  it("keeps payment variants in the on-demand template library", () => {
    const source = readSource(TEMPLATES)
    expect(source).toContain("paymentReminderKinds")
    expect(source).toContain("Payment reminder templates")
    expect(source).toContain("setPreviewKind(kind)")
    expect(source).toContain("eventTimezone")
    expect(source).toContain("props.currency")
    expect(source).toContain("timeZone: timezone")
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

  it("explains the stored search scope of a standard announcement job", () => {
    const panel = readSource(PANEL)
    expect(panel).toContain("filters.search")
    expect(panel).toContain("search:")
    expect(panel).toContain('"selection" in filters')
    expect(panel).toContain("selected booker")
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

  it("guards cancel/retry against unhandled failures and races", () => {
    const workspace = readSource(WORKSPACE)
    const panel = readSource(PANEL)
    expect(workspace).toContain("broadcastActionPending")
    expect(workspace).toContain("broadcastActionError")
    expect(workspace).toContain("catch (error)")
    expect(workspace).toContain("finally")
    expect(panel).toContain("actionPending")
    expect(panel).toContain("actionError")
  })

  it("clears the selected broadcast when the event changes", () => {
    const source = readSource(WORKSPACE)
    expect(source).toContain("setSelectedBroadcastId(null)")
    expect(source).toContain("[event._id]")
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
    const page = readSource(
      "app/dashboard/events/[slug]/communications/page.tsx"
    )
    expect(page).toContain("CommunicationsWorkspace")
    expect(page).toContain("useParams<{ slug: string }>()")
  })

  it("builds the communications route via the workspace-routes helper", () => {
    const routes = readSource("lib/dashboard/workspace-routes.ts")
    expect(routes).toContain("export const communicationsHref")
    expect(routes).toContain("/communications")
  })
})
