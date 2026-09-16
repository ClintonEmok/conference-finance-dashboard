/**
 * Pure donation-allocation contract (Phase 55).
 *
 * Owns the allocation credit layer's money arithmetic and its refusal
 * contracts: the recorded-basis remainder derivation, scope-ceiling
 * resolution, plan validation (including the ONE order-capacity rule), the
 * staleness read projection, and the request digest used for retry
 * idempotency.
 *
 * This module is deliberately dependency-free: it never reads the database,
 * never formats display values, and imports nothing — not even the shared
 * `./amounts` helper (it does not need it). `convex/donations.ts` bundles this
 * file, and the Convex bundler resolves relative paths only, so it must stay
 * free of the `@/` alias and of React.
 *
 * Locked rules (55-CONTEXT):
 *   - D-01: the remaining balance is derived from RECORDED rows, never stored.
 *   - D-13: over-allocation is rejected, never clamped; the whole submission
 *     fails with a typed error and nothing is written.
 *   - D-14: scope is a closed union, always supplied, never inferred.
 *   - D-16/D-18: staleness is applied = min(recorded, current ceiling) and the
 *     unabsorbed excess is reported; nothing goes negative.
 *   - The aggregate bound is ONE order-capacity rule with three terms:
 *
 *       capacity(O, D) = orderOutstanding(O)
 *                      − Σ other donations' allocations to O (ANY scope)
 *                      − Σ D's OWN other recorded rows on O    (ANY scope)
 *       Σ (this submission's rows for O, ANY scope) ≤ capacity(O, D)
 *
 *     Term one lives inside `AllocationCeiling.wholeOrderOutstandingMinor`
 *     (the server projection subtracts every other donation's row for the
 *     order regardless of scope). Term two is supplied explicitly as
 *     `alreadyClaimedByOrder` because this module is pure and reads no
 *     database. Term three is the any-scope pool debit performed inside
 *     `validateAllocationPlan`. Together they make the bound true: no
 *     allocation, from this or any other donation, can push an order's total
 *     allocated amount above its outstanding.
 */

export type DonationAllocationScope = "event_charges" | "whole_order"

/**
 * Stable, assertable error codes. Each key equals its string literal so a
 * caller can throw `new Error(code)` and a test can match on the code alone.
 * The WHOLE set is declared here even where a later plan first throws it, so
 * this block is never edited by a later task.
 */
export const DONATION_ALLOCATION_ERROR_CODES = {
  DONATION_ALLOCATION_EXCEEDS_REMAINDER: "DONATION_ALLOCATION_EXCEEDS_REMAINDER",
  DONATION_ALLOCATION_EXCEEDS_CEILING: "DONATION_ALLOCATION_EXCEEDS_CEILING",
  DONATION_ALLOCATION_EXCEEDS_ORDER_CAPACITY:
    "DONATION_ALLOCATION_EXCEEDS_ORDER_CAPACITY",
  DONATION_ALLOCATION_DUPLICATE_TARGET: "DONATION_ALLOCATION_DUPLICATE_TARGET",
  DONATION_ALLOCATION_INVALID_AMOUNT: "DONATION_ALLOCATION_INVALID_AMOUNT",
  DONATION_ALLOCATION_INVALID_KEY: "DONATION_ALLOCATION_INVALID_KEY",
  DONATION_ALLOCATION_EMPTY_PLAN: "DONATION_ALLOCATION_EMPTY_PLAN",
  DONATION_ALLOCATION_PLAN_TOO_LARGE: "DONATION_ALLOCATION_PLAN_TOO_LARGE",
  DONATION_ALLOCATION_UNKNOWN_TARGET: "DONATION_ALLOCATION_UNKNOWN_TARGET",
  DONATION_ALLOCATION_CROSS_EVENT: "DONATION_ALLOCATION_CROSS_EVENT",
  DONATION_NOT_STANDALONE: "DONATION_NOT_STANDALONE",
  DONATION_ALLOCATION_NOT_FOUND: "DONATION_ALLOCATION_NOT_FOUND",
  DONATION_ALLOCATION_IDEMPOTENCY_CONFLICT:
    "DONATION_ALLOCATION_IDEMPOTENCY_CONFLICT",
  DONATION_ALLOCATION_UNSUPPORTED_METHOD:
    "DONATION_ALLOCATION_UNSUPPORTED_METHOD",
} as const

export type DonationAllocationErrorCode =
  keyof typeof DONATION_ALLOCATION_ERROR_CODES

/**
 * Throws with the code as a stable prefix so the code is assertable without
 * parsing the human detail. Mirrors `throwEditError` in
 * `convex/publicTracking.ts`.
 */
export function throwAllocationError(
  code: DonationAllocationErrorCode,
  detail?: string
): never {
  throw new Error(detail ? `${code}: ${detail}` : code)
}

/** Upper bound on a single submission's rows (DoS guard, T-55-05). */
export const MAX_ALLOCATION_PLAN_ROWS = 200

export type DonationAllocationPlanRow = {
  attendeeId: string
  orderId: string
  amountMinor: number
  scope: DonationAllocationScope
}

/**
 * The server-owned ceiling for one attendee. Produced exclusively by
 * `loadAllocationCeilings` in `convex/donations.ts` (never by a client) and
 * keyed by `attendeeId`.
 *
 * Both monetary fields are already net of OTHER donations' allocations:
 *   - `eventChargesOutstandingMinor` subtracts other donations'
 *     `event_charges` rows on the SAME attendee.
 *   - `wholeOrderOutstandingMinor` subtracts other donations' rows on the
 *     order of ANY scope (an `event_charges` claim on an attendee of the
 *     order is still a claim on the order's shared outstanding pool).
 */
export type AllocationCeiling = {
  attendeeId: string
  orderId: string
  eventChargesOutstandingMinor: number
  wholeOrderOutstandingMinor: number
}

/** The exact `normalizeMinorAmount` idiom used across the finance domain. */
export function normalizeMinorAmount(value: number | null | undefined): number {
  return Number.isFinite(value) ? Math.max(0, Math.floor(value ?? 0)) : 0
}

/** Sum of the RECORDED amounts, normalized to non-negative integers. */
export function sumRecordedAllocationMinor(
  rows: ReadonlyArray<{ amountMinor: number }>
): number {
  return rows.reduce(
    (sum, row) => sum + normalizeMinorAmount(row.amountMinor),
    0
  )
}

/**
 * Derives the donation's unallocated remainder from RECORDED rows only
 * (D-01, RESEARCH Pitfall 3). Never from APPLIED amounts: a stale row whose
 * ceiling later dropped must not free budget, or the same donation could be
 * spent twice.
 */
export function deriveAllocationRemainingMinor(input: {
  donationAmountMinor: number
  recordedRows: ReadonlyArray<{ amountMinor: number }>
}): {
  donationAmountMinor: number
  recordedAllocatedMinor: number
  remainingMinor: number
} {
  const donationAmountMinor = normalizeMinorAmount(input.donationAmountMinor)
  const recordedAllocatedMinor = sumRecordedAllocationMinor(input.recordedRows)

  return {
    donationAmountMinor,
    recordedAllocatedMinor,
    remainingMinor: Math.max(0, donationAmountMinor - recordedAllocatedMinor),
  }
}

/** Resolves the ceiling for the row's recorded scope, clamped at zero. */
export function resolveScopeOutstandingMinor(
  ceiling: AllocationCeiling,
  scope: DonationAllocationScope
): number {
  const raw =
    scope === "event_charges"
      ? ceiling.eventChargesOutstandingMinor
      : ceiling.wholeOrderOutstandingMinor

  return normalizeMinorAmount(raw)
}

/**
 * Validates one submission's plan against the donation's unallocated money
 * and the order-capacity rule, throwing on the FIRST failure in a fixed order
 * so the code a caller sees for a given bad plan is predictable:
 *
 *   plan-too-large -> duplicate -> invalid amount -> unknown target ->
 *   over-remainder -> per-row scope ceiling -> order capacity
 *
 * Over-remainder deliberately wins over over-ceiling: a donation smaller than
 * a single row can never reach the ceiling check.
 *
 * The two inputs bound different resources and neither is redundant:
 *   - `availableMinor` bounds the donation's unallocated money. The
 *     set-replace batch passes the donation's full amount (the submitted set
 *     replaces everything); the single-row additive path passes
 *     `remainingMinor + that row's own current recorded amount`.
 *   - `alreadyClaimedByOrder` bounds the ORDER's capacity: the donation's own
 *     other recorded rows on that order, ANY scope, already excluding the
 *     row(s) this submission replaces. The set-replace batch passes an EMPTY
 *     map (it replaces the donation's whole set, so the donation has no other
 *     rows on any order); the single-row additive path passes this donation's
 *     other rows for the order. It is an explicit input because this function
 *     is pure and reads no database.
 *
 * The per-attendee `event_charges` ceiling is a separate, narrower bound for
 * attendee targeting. The order-capacity check is the order-level bound across
 * scopes: every row of the submission for an order — `event_charges`
 * included — is debited against that order's pool in array order, so a
 * sibling `whole_order` pair and a scope-mixed pair are both rejected. Nothing
 * is clamped and nothing is partially accepted (D-13): the first offending row
 * throws and the caller's transaction writes nothing. An empty `rows` array is
 * valid — under set-replace semantics it clears the donation's allocations.
 */
export function validateAllocationPlan(input: {
  availableMinor: number
  rows: ReadonlyArray<DonationAllocationPlanRow>
  ceilings: ReadonlyMap<string, AllocationCeiling>
  alreadyClaimedByOrder: ReadonlyMap<string, number>
}): void {
  const availableMinor = normalizeMinorAmount(input.availableMinor)
  const rows = input.rows

  if (rows.length > MAX_ALLOCATION_PLAN_ROWS) {
    throwAllocationError(
      DONATION_ALLOCATION_ERROR_CODES.DONATION_ALLOCATION_PLAN_TOO_LARGE,
      `a submission may carry at most ${MAX_ALLOCATION_PLAN_ROWS} rows`
    )
  }

  // The largest-remainder helper is keyed by id, so duplicate targets would
  // collapse silently (RESEARCH Pattern 2).
  const seenAttendeeIds = new Set<string>()
  for (const row of rows) {
    if (seenAttendeeIds.has(row.attendeeId)) {
      throwAllocationError(
        DONATION_ALLOCATION_ERROR_CODES.DONATION_ALLOCATION_DUPLICATE_TARGET,
        `attendee ${row.attendeeId} appears more than once`
      )
    }
    seenAttendeeIds.add(row.attendeeId)
  }

  for (const row of rows) {
    if (
      !Number.isFinite(row.amountMinor) ||
      !Number.isInteger(row.amountMinor) ||
      row.amountMinor <= 0
    ) {
      throwAllocationError(
        DONATION_ALLOCATION_ERROR_CODES.DONATION_ALLOCATION_INVALID_AMOUNT,
        `attendee ${row.attendeeId} must be a positive integer minor amount`
      )
    }
  }

  for (const row of rows) {
    const ceiling = input.ceilings.get(row.attendeeId)
    if (!ceiling || ceiling.orderId !== row.orderId) {
      throwAllocationError(
        DONATION_ALLOCATION_ERROR_CODES.DONATION_ALLOCATION_UNKNOWN_TARGET,
        `no ceiling for attendee ${row.attendeeId} on order ${row.orderId}`
      )
    }
  }

  const requestedMinor = sumRecordedAllocationMinor(rows)
  if (requestedMinor > availableMinor) {
    throwAllocationError(
      DONATION_ALLOCATION_ERROR_CODES.DONATION_ALLOCATION_EXCEEDS_REMAINDER,
      `requested ${requestedMinor} exceeds the available ${availableMinor}`
    )
  }

  for (const row of rows) {
    const ceiling = input.ceilings.get(row.attendeeId) as AllocationCeiling
    const scopeOutstandingMinor = resolveScopeOutstandingMinor(
      ceiling,
      row.scope
    )
    if (row.amountMinor > scopeOutstandingMinor) {
      throwAllocationError(
        DONATION_ALLOCATION_ERROR_CODES.DONATION_ALLOCATION_EXCEEDS_CEILING,
        `attendee ${row.attendeeId} (${row.scope}) ${row.amountMinor} ` +
          `exceeds the attendee ceiling ${scopeOutstandingMinor}`
      )
    }
  }

  // ONE order-capacity rule. Walks the submission's rows grouped by orderId in
  // array order, ANY scope, against a local pool initialised to
  // `wholeOrderOutstandingMinor - alreadyClaimedByOrder`. The pool is local to
  // this call — never persisted, never returned, never placed on
  // `AllocationCeiling`. Distinct from the per-row ceiling code on purpose:
  // the operator must be told WHICH bound stopped them (their own
  // attendee-charge ceiling, or the order's remaining capacity across all
  // scopes).
  const poolRemainingByOrderId = new Map<string, number>()
  for (const row of rows) {
    let poolRemaining = poolRemainingByOrderId.get(row.orderId)
    if (poolRemaining === undefined) {
      const ceiling = input.ceilings.get(row.attendeeId) as AllocationCeiling
      poolRemaining = Math.max(
        0,
        ceiling.wholeOrderOutstandingMinor -
          (input.alreadyClaimedByOrder.get(row.orderId) ?? 0)
      )
    }

    if (row.amountMinor > poolRemaining) {
      throwAllocationError(
        DONATION_ALLOCATION_ERROR_CODES.DONATION_ALLOCATION_EXCEEDS_ORDER_CAPACITY,
        `order ${row.orderId} has only ${poolRemaining} of writable capacity ` +
          `left and was asked for ${row.amountMinor}`
      )
    }

    poolRemainingByOrderId.set(row.orderId, poolRemaining - row.amountMinor)
  }
}

/** One row of the staleness read projection (D-16/D-18). */
export type DonationAllocationReadRow = {
  attendeeId: string
  orderId: string
  amountMinor: number
  scope: DonationAllocationScope
  scopeOutstandingMinor: number
  effectiveCapacityMinor: number
  appliedMinor: number
  unappliedMinor: number
  exceedsCeiling: boolean
  exceedsCapacity: boolean
}

/**
 * Read-side staleness projection. FAILS SAFE where the writer fails closed:
 * `validateAllocationPlan` throws on a missing ceiling, this function does not
 * — a dangling row (order deleted, attendee removed) reports
 * `scopeOutstandingMinor = 0` (fully unapplied) instead of throwing, so a
 * donations list never breaks because of one orphan row.
 *
 * `effectiveCapacityMinor` is the WRITABLE amount for the row:
 *   min(scopeOutstandingMinor, orderRemainingCapacity(orderId))
 * where
 *   orderRemainingCapacity(orderId) =
 *     wholeOrderOutstandingMinor(order) − Σ(this donation's OTHER rows on
 *     that order, ANY scope).
 *
 * It exists because the two bounds subtract different things and can disagree:
 * `scopeOutstandingMinor` subtracts only other `event_charges` rows on that
 * attendee, while order capacity subtracts every claim on the order. After a
 * `whole_order` allocation has claimed part of an order, a later
 * `event_charges` row still displays the attendee's full own outstanding while
 * only the order's remaining headroom fits — without `effectiveCapacityMinor`
 * the UI shows a ceiling a write cannot actually fit.
 *
 * `exceedsCeiling` and `exceedsCapacity` are DISTINCT and can differ: the
 * former names the attendee-charge bound, the latter the writable bound. The
 * cap-and-report shape mirrors `deriveBalanceAmounts`. No value is ever
 * negative, and a ceiling that has since dropped leaves the recorded amount
 * untouched (D-16).
 *
 * `appliedMinor` / `unappliedMinor` are a per-row STALENESS signal against the
 * scope ceiling. They are NOT the authoritative economic figure for an
 * attendee — Phase 56 owns per-attendee application (including the
 * `whole_order` order-pool distribution).
 */
export function deriveAllocationReadProjection(input: {
  rows: ReadonlyArray<{
    attendeeId: string
    orderId: string
    amountMinor: number
    scope: DonationAllocationScope
  }>
  ceilings: ReadonlyMap<string, AllocationCeiling>
}): DonationAllocationReadRow[] {
  // Single pass over `rows` to build, per touched order, the order's
  // whole-order ceiling and the sum of every row of this projection for it
  // (ANY scope). Each row's remaining capacity then excludes only its own
  // amount, which mirrors the writer's `alreadyClaimedByOrder` term.
  const wholeOrderOutstandingByOrderId = new Map<string, number>()
  const orderRowTotalMinor = new Map<string, number>()

  for (const row of input.rows) {
    if (!wholeOrderOutstandingByOrderId.has(row.orderId)) {
      const ceiling = input.ceilings.get(row.attendeeId)
      wholeOrderOutstandingByOrderId.set(
        row.orderId,
        ceiling ? normalizeMinorAmount(ceiling.wholeOrderOutstandingMinor) : 0
      )
    }
    orderRowTotalMinor.set(
      row.orderId,
      (orderRowTotalMinor.get(row.orderId) ?? 0) +
        normalizeMinorAmount(row.amountMinor)
    )
  }

  return input.rows.map((row) => {
    const amountMinor = normalizeMinorAmount(row.amountMinor)
    const ceiling = input.ceilings.get(row.attendeeId)
    const scopeOutstandingMinor = ceiling
      ? resolveScopeOutstandingMinor(ceiling, row.scope)
      : 0

    const otherRowsOnOrderMinor =
      (orderRowTotalMinor.get(row.orderId) ?? 0) - amountMinor
    const orderRemainingCapacityMinor = Math.max(
      0,
      (wholeOrderOutstandingByOrderId.get(row.orderId) ?? 0) -
        otherRowsOnOrderMinor
    )

    const effectiveCapacityMinor = Math.min(
      scopeOutstandingMinor,
      orderRemainingCapacityMinor
    )
    const appliedMinor = Math.min(amountMinor, effectiveCapacityMinor)

    return {
      attendeeId: row.attendeeId,
      orderId: row.orderId,
      amountMinor,
      scope: row.scope,
      scopeOutstandingMinor,
      effectiveCapacityMinor,
      appliedMinor,
      unappliedMinor: Math.max(0, amountMinor - appliedMinor),
      exceedsCeiling: amountMinor > scopeOutstandingMinor,
      exceedsCapacity: amountMinor > effectiveCapacityMinor,
    }
  })
}

/**
 * Deterministic JSON with object keys sorted at every level. A local
 * implementation keeps the module dependency-free.
 */
function stableStringify(value: unknown): string {
  if (value === null || typeof value !== "object") {
    return JSON.stringify(value) ?? "null"
  }

  if (Array.isArray(value)) {
    return `[${value.map((item) => stableStringify(item)).join(",")}]`
  }

  const record = value as Record<string, unknown>
  const keys = Object.keys(record).sort()
  return `{${keys
    .map((key) => `${JSON.stringify(key)}:${stableStringify(record[key])}`)
    .join(",")}}`
}

/**
 * Sorts any `rows` / `targets` array by `attendeeId` so a retried request with
 * reordered rows produces the SAME digest, while any changed amount, scope,
 * target or operation produces a DIFFERENT one.
 */
function normalizeAllocationPayloadForDigest(payload: unknown): unknown {
  if (payload === null || typeof payload !== "object") {
    return payload
  }

  const record = payload as Record<string, unknown>
  const normalized: Record<string, unknown> = { ...record }

  for (const key of ["rows", "targets"]) {
    const value = record[key]
    if (Array.isArray(value)) {
      normalized[key] = [...value].sort((left, right) => {
        const leftId = (left as { attendeeId?: unknown } | null)?.attendeeId
        const rightId = (right as { attendeeId?: unknown } | null)?.attendeeId
        return String(leftId).localeCompare(String(rightId))
      })
    }
  }

  return normalized
}

/** Canonical, order-insensitive string form of an allocation request. */
export function canonicalizeAllocationRequest(input: {
  donationId: string
  eventId: string
  operation: string
  payload: unknown
}): string {
  return stableStringify({
    donationId: input.donationId,
    eventId: input.eventId,
    operation: input.operation,
    payload: normalizeAllocationPayloadForDigest(input.payload),
  })
}

/** SHA-256 hex digest of the canonical request (mirrors the signup envelope). */
export async function digestAllocationEnvelope(input: {
  donationId: string
  eventId: string
  operation: string
  payload: unknown
}): Promise<string> {
  const canonical = canonicalizeAllocationRequest(input)
  const digest = await crypto.subtle.digest(
    "SHA-256",
    new TextEncoder().encode(canonical)
  )

  return Array.from(new Uint8Array(digest))
    .map((byte) => byte.toString(16).padStart(2, "0"))
    .join("")
}
