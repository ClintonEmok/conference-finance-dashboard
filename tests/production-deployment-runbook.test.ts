import { describe, expect, it } from "vitest"
import { readFileSync } from "node:fs"
import { resolve } from "node:path"

const RUNBOOK_PATH = resolve(__dirname, "../docs/production-deployment-runbook.md")
const EMAIL_ACTIONS_PATH = resolve(__dirname, "../convex/emailActions.ts")

const runbook = readFileSync(RUNBOOK_PATH, "utf8")
const emailActions = readFileSync(EMAIL_ACTIONS_PATH, "utf8")

describe("production-deployment-runbook (RUN-03)", () => {
  it("documents every required section", () => {
    for (const section of [
      "Preflight & Environment Inventory",
      "Sanitized Preview Rehearsal",
      "Production Cutover",
      "Announcement Broadcast",
      "Rollback & Stop Conditions",
      "Non-Execution Statement",
    ]) {
      expect(runbook).toContain(section)
    }
  })

  it("covers secret rollout on BOTH runtimes, Turnstile/Resend, and the legacy backfill", () => {
    expect(runbook).toContain("SIGNUP_SUBMISSION_SECRET")
    expect(runbook).toContain("BOTH")
    expect(runbook).toContain("TURNSTILE_SECRET_KEY")
    expect(runbook).toContain("RESEND_API_KEY")
    expect(runbook).toContain("backfillLegacyAccommodationPreferences")
  })

  it("uses the preview selector/guard and expected simulation/backfill counts", () => {
    expect(runbook).toContain("dev:acoustic-tiger-876")
    expect(runbook).toContain("allowedDeploymentUrl")
    expect(runbook).toContain("38")
    expect(runbook).toContain("72")
    expect(runbook).toContain("51 orders")
    expect(runbook).toContain("116 attendees")
  })

  it("documents the guarded Step 0-3 accommodation migration commands and read-only verification with explicit authorization", () => {
    expect(runbook).toContain("applySimplifiedDivineConferenceAccommodation")
    expect(runbook).toContain("backfillLegacyAccommodationPreferences")
    expect(runbook).toContain("applyKoningshofAccommodationInventory")
    expect(runbook).toContain("verifyDivineRedesignAccommodationMigration")
    expect(runbook).toContain("authorize: true")
    expect(runbook).toContain("https://grateful-pelican-605.convex.cloud")
    expect(runbook).toContain("OLD_SLOT_REFERENCED")
    expect(runbook).toContain("done: true")
  })

  it("explicitly states that this task performs no production execution and never auto-invokes a migration", () => {
    expect(runbook).toContain("no production execution")
    expect(runbook).toContain("NOT EXECUTED")
    expect(runbook).toContain("no production deploy")
    // The guarded commands are operator-run only; no automatic invocation.
    expect(runbook).toContain("reports `done: true`")
  })

  it("gates every production operation behind explicit operator authorization", () => {
    const gates = runbook.match(/OPERATOR AUTHORIZATION REQUIRED/g) ?? []
    // Gates A (secrets), B (backfill), C (frontend), D (broadcast).
    expect(gates.length).toBeGreaterThanOrEqual(4)
    expect(runbook).toContain("authorization gate A")
    expect(runbook).toContain("authorization gate B")
    expect(runbook).toContain("authorization gate C")
    expect(runbook).toContain("authorization gate D")
  })

  it("explicitly prohibits execution and broadcast in Phase 49", () => {
    expect(runbook).toContain("NOT EXECUTED")
    expect(runbook).toContain("no production deploy")
    expect(runbook).toContain("broadcast")
  })

  it("email action source has no broadcast, scheduler, queue, or recipient-list path", () => {
    expect(emailActions).toContain("sendAnnouncementTest")
    for (const forbidden of [
      "cron",
      "scheduleAfter",
      "crons",
      "recipientList",
      "recipients:",
      "fan-out",
    ]) {
      expect(emailActions.toLowerCase()).not.toContain(forbidden.toLowerCase())
    }
    // Single controlled recipient only.
    expect(emailActions).toMatch(/args\.to/)
  })
})
