export type DashboardQueryStatus =
  | "loading"
  | "error"
  | "empty"
  | "unavailable"
  | "disabled"
  | "unconfigured"
  | "ready"

export type DashboardQueryState<T> =
  | { status: "loading" }
  | { status: "error"; message?: string }
  | { status: "empty" }
  | { status: "unavailable"; message?: string }
  | { status: "disabled"; message?: string }
  | { status: "unconfigured"; message?: string }
  | { status: "ready"; data: T }

export type DashboardQueryStateMetadata = {
  status: DashboardQueryStatus
  title: string
  message: string
}

const DEFAULT_MESSAGES: Record<DashboardQueryStatus, string> = {
  loading: "Loading dashboard data…",
  error: "This dashboard data could not be loaded. Try again.",
  empty: "No matching dashboard data yet.",
  unavailable: "This dashboard information is currently unavailable.",
  disabled: "This module is disabled for this event.",
  unconfigured: "Complete setup to start using this module.",
  ready: "Dashboard data is ready.",
}

const DEFAULT_TITLES: Record<DashboardQueryStatus, string> = {
  loading: "Loading",
  error: "Unable to load",
  empty: "Nothing to show",
  unavailable: "Unavailable",
  disabled: "Disabled",
  unconfigured: "Setup required",
  ready: "Ready",
}

export function getDashboardQueryStateMetadata(
  status: DashboardQueryStatus,
  message?: string
): DashboardQueryStateMetadata {
  return {
    status,
    title: DEFAULT_TITLES[status],
    message: message?.trim() || DEFAULT_MESSAGES[status],
  }
}

export function isReadyDashboardQueryState<T>(
  state: DashboardQueryState<T>
): state is { status: "ready"; data: T } {
  return state.status === "ready"
}

export function getDashboardQueryData<T>(
  state: DashboardQueryState<T>
): T | undefined {
  return isReadyDashboardQueryState(state) ? state.data : undefined
}
