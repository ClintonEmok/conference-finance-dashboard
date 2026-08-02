import { describe, expect, it } from "vitest"

import {
  workspacePanelId,
  workspaceTabId,
} from "@/lib/dashboard/workspace-tabs"

describe("workspace tab semantics", () => {
  it("builds deterministic tab and shared panel IDs", () => {
    expect(workspacePanelId("finance")).toBe("finance-tabpanel")
    expect(workspacePanelId("accommodation")).toBe("accommodation-tabpanel")
    expect(workspaceTabId("finance", "orders")).toBe("finance-tab-orders")
    expect(workspaceTabId("accommodation", "allocation")).toBe("accommodation-tab-allocation")
  })

  it("maps every tab in a workspace to its shared active panel", () => {
    const panelId = workspacePanelId("finance")
    for (const tab of ["orders", "payments", "donations", "reconciliation"]) {
      expect(workspaceTabId("finance", tab)).toContain("finance-tab-")
      expect(panelId).toBe("finance-tabpanel")
    }
  })

  it("normalizes unsafe workspace and tab labels for stable DOM IDs", () => {
    expect(workspaceTabId("Finance workspace", "room/allocation")).toBe("finance-workspace-tab-room-allocation")
  })
})
