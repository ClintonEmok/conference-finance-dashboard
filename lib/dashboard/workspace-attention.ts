export type AttentionQueryState<T> =
  | { status: "pending" }
  | { status: "error"; message: string }
  | { status: "ready"; data: T }

export type AttentionItem = {
  id: string
  label: string
  detail: string
  href: string
  count?: number
  tone?: "urgent" | "neutral"
}

export type WorkspaceAttentionResult = {
  status: "pending" | "error" | "ready"
  items: AttentionItem[]
  message?: string
}

type ReconciliationRow = {
  outstandingAmountMinor?: number
}

type FinanceAttentionInput = {
  reconciliation: AttentionQueryState<ReadonlyArray<ReconciliationRow>>
  unassignedPayments: AttentionQueryState<ReadonlyArray<unknown>>
}

type FinanceAttentionLinks = {
  reconciliation: string
  payments: string
}

type AccommodationBoard = {
  hotels: ReadonlyArray<unknown>
  rooms: ReadonlyArray<unknown>
  summary: {
    unassignedAttendeesCount: number
  }
}

type AccommodationAttentionInput = {
  enabled: boolean
  board: AttentionQueryState<AccommodationBoard>
  /**
   * The active accommodation read-plan mode. The Upgrades & Options tab
   * (mode "upgrades-options") shows no Hotels/Allocation attention summary —
   * its configuration surface must not render allocation setup/loading
   * states that are unrelated to it.
   */
  mode?: string
}

type AccommodationAttentionLinks = {
  allocation: string
  hotels: string
}

function pendingResult(): WorkspaceAttentionResult {
  return { status: "pending", items: [] }
}

function errorResult(message: string): WorkspaceAttentionResult {
  return {
    status: "error",
    items: [],
    message: message || "Could not load current exceptions.",
  }
}

export function buildFinanceAttentionItems(
  input: FinanceAttentionInput,
  links: FinanceAttentionLinks
): WorkspaceAttentionResult {
  if (
    input.reconciliation.status === "error" ||
    input.unassignedPayments.status === "error"
  ) {
    const message =
      input.reconciliation.status === "error"
        ? input.reconciliation.message
        : input.unassignedPayments.status === "error"
          ? input.unassignedPayments.message
          : "Could not load current exceptions."
    return errorResult(message)
  }

  if (
    input.reconciliation.status === "pending" ||
    input.unassignedPayments.status === "pending"
  ) {
    return pendingResult()
  }

  const items: AttentionItem[] = []
  const outstandingCount = input.reconciliation.data.filter(
    (row) =>
      typeof row.outstandingAmountMinor === "number" &&
      row.outstandingAmountMinor > 0
  ).length
  const unassignedCount = input.unassignedPayments.data.length

  if (outstandingCount > 0) {
    items.push({
      id: "reconciliation",
      label: "Outstanding reconciliation",
      detail: `${outstandingCount} order${outstandingCount === 1 ? "" : "s"} with an outstanding balance.`,
      href: links.reconciliation,
      count: outstandingCount,
      tone: "urgent",
    })
  }

  if (unassignedCount > 0) {
    items.push({
      id: "payments",
      label: "Global unmatched payments",
      detail: `${unassignedCount} payment${unassignedCount === 1 ? "" : "s"} waiting in the global inbox; classify or match them.`,
      href: links.payments,
      count: unassignedCount,
      tone: "urgent",
    })
  }

  return { status: "ready", items }
}

export function buildAccommodationAttentionItems(
  input: AccommodationAttentionInput,
  links: AccommodationAttentionLinks
): WorkspaceAttentionResult {
  if (!input.enabled) return { status: "ready", items: [] }
  if (input.mode === "upgrades-options") return { status: "ready", items: [] }

  if (input.board.status === "error") {
    return errorResult(input.board.message)
  }

  if (input.board.status === "pending") {
    return pendingResult()
  }

  const items: AttentionItem[] = []
  const { data } = input.board
  const hasUsableInventory = data.hotels.length > 0 && data.rooms.length > 0

  if (!hasUsableInventory) {
    items.push({
      id: "hotels",
      label: "Accommodation setup",
      detail: "Link a hotel and configure usable rooms before placing attendees.",
      href: links.hotels,
      count: 1,
      tone: "urgent",
    })
  }

  const unassignedCount = data.summary.unassignedAttendeesCount
  if (unassignedCount > 0) {
    items.push({
      id: "allocation",
      label: "Unassigned attendees",
      detail: `${unassignedCount} attendee${unassignedCount === 1 ? "" : "s"} waiting for room placement.`,
      href: links.allocation,
      count: unassignedCount,
      tone: "urgent",
    })
  }

  return { status: "ready", items }
}
