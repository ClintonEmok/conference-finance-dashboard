function normalizeIdPart(value: string) {
  const normalized = value.trim().toLowerCase().replace(/[^a-z0-9_-]+/g, "-")
  return normalized.replace(/^-+|-+$/g, "") || "workspace"
}

export function workspaceTabId(workspaceId: string, tabValue: string) {
  return `${normalizeIdPart(workspaceId)}-tab-${normalizeIdPart(tabValue)}`
}

export function workspacePanelId(workspaceId: string) {
  return `${normalizeIdPart(workspaceId)}-tabpanel`
}
