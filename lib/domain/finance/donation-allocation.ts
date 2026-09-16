/**
 * Pure donation-allocation contract (Phase 55).
 *
 * Owns the allocation credit layer's money arithmetic and its refusal
 * contracts: the recorded-basis remainder derivation, scope-ceiling
 * resolution, plan validation (including the ONE order-capacity rule), the
 * staleness read projection, and the request digest used for retry
 * idempotency.
 *
 * This module owns money arithmetic only: it never reads the database and
 * never formats display values. Its ONE import is the shared `./amounts`
 * helper (`allocateMinorAmountByWeight`), reused for every distribution round
 * so the codebase keeps a single largest-remainder convention (D-05) rather
 * than inventing a second. `convex/donations.ts` bundles this file, and the
 * Convex bundler resolves relative paths only, so it must stay free of the
 * TypeScript path alias and of React.
 *
 * Locked rules (55-CONTEXT):
 *   - D-01: the remaining balance is derived from RECORDED rows, never stored.
 *   - D-05: every distribution round calls `allocateMinorAmountByWeight`.
 *   - D-06: the waterfall caps each attendee and redistributes the unabsorbed
 *     excess until the amount is exhausted or every ceiling is reached.
 *   - D-13: over-allocation is rejected, never clamped; the whole submission
 *     fails with a typed error and nothing is written.
 *   - D-14: scope is a closed union, always supplied, never inferred.
 *   - D-16/D-18: staleness is applied = min(recorded, current ceiling) and the
 *     unabsorbed excess is reported; nothing goes negative.
 *   - DON-03/D-05: an equal split is exactly equal as the minor unit allows,
 *     and the indivisible remainder is reported unit by unit.
 *   - DON-05: a distribution that cannot place the whole amount is SUCCESS —
 *     the unplaced part is returned as leftover for a later allocation.
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

import { allocateMinorAmountByWeight } from "./amounts"

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

// ---------------------------------------------------------------------------
// Distribution engine (DON-03/04/05, D-05..D-10, D-20)
//
// Every rounding decision funnels through `allocateMinorAmountByWeight`, so the
// whole app keeps ONE largest-remainder convention (D-05). The waterfall here
// composes AROUND that helper: it clamps each take against the target's own
// scope ceiling and against its order's LIVE shared pool, then re-offers the
// unplaced surplus in the next round (D-06). A surplus that no ceiling or pool
// can absorb is returned as leftover and is a SUCCESS, never a typed refusal
// (DON-05).
// ---------------------------------------------------------------------------

/**
 * One of the three operator-selectable distribution methods.
 *   - `manual` — explicit per-attendee amounts; those are operator inputs with
 *     their own validation path, so `buildDistributionPlan` never invents them.
 *   - `equal` — the amount is split as evenly as the minor unit allows.
 *   - `largest_balance_first` — targets fill in descending scope-balance order.
 */
export type DonationDistributionMethod =
  | "manual"
  | "equal"
  | "largest_balance_first"

/** One selected target: an attendee, its order, and the chosen scope. */
export type DonationDistributionTarget = {
  attendeeId: string
  orderId: string
  scope: DonationAllocationScope
}

/**
 * One target's outcome. `ceilingMinor` is the target's OWN scope ceiling — the
 * same number the ranking uses (D-08). `skipped` is set for BOTH skip reasons
 * (D-20): an already-cleared scope balance, or a distribution that ran out of
 * money before reaching the target. A skipped target is never a `rows` entry.
 */
export type DonationDistributionTargetResult = {
  attendeeId: string
  orderId: string
  scope: DonationAllocationScope
  ceilingMinor: number
  amountMinor: number
  extraMinorUnits: number
  skipped: boolean
  skipReason?: "zero_scope_balance" | "no_funds_remaining"
}

/**
 * The full server-computed distribution for one submission (D-07).
 *
 * TWO DIFFERENT NUMBERS, never conflated:
 *   - `remainderMinor` — the INDIVISIBLE rounding remainder handed out one
 *     minor unit at a time by `allocateMinorAmountByWeight`, reported together
 *     with the attendees that actually absorbed those units (DON-03/D-07). It
 *     is part of `totalAllocatedMinor`; it is NOT money left over.
 *   - `leftoverMinor` — the part of the donation no scope ceiling or order pool
 *     could absorb. It stays available for a later allocation (DON-05), and a
 *     non-zero leftover is SUCCESS.
 */
export type DonationDistributionPlan = {
  method: DonationDistributionMethod
  rows: DonationAllocationPlanRow[]
  breakdown: DonationDistributionTargetResult[]
  totalAllocatedMinor: number
  leftoverMinor: number
  remainderMinor: number
  remainderRecipientAttendeeIds: string[]
}

/**
 * The active-set strategy for one waterfall round. The default is every target
 * with headroom (the equal-split rule); largest-balance-first supplies a
 * strategy that names only the top-ranked target still carrying headroom.
 */
export type AllocationWaterfallActiveSelector = (
  headroom: ReadonlyArray<number>,
  round: number
) => number[]

export type AllocationWaterfallInput = {
  totalMinor: number
  targets: ReadonlyArray<DonationDistributionTarget>
  ceilings: ReadonlyMap<string, AllocationCeiling>
  /** TARGET-indexed weights; an equal split passes 1 for every target. */
  weights: ReadonlyArray<number>
  activeSelector?: AllocationWaterfallActiveSelector
}

export type AllocationWaterfallResult = {
  amountsByAttendeeId: Map<string, number>
  extraUnitsByAttendeeId: Map<string, number>
}

/** Every target with headroom — the equal-split active rule. */
function selectEveryTargetWithHeadroom(
  headroom: ReadonlyArray<number>
): number[] {
  const active: number[] = []
  for (let index = 0; index < headroom.length; index++) {
    if (headroom[index] > 0) {
      active.push(index)
    }
  }
  return active
}

/**
 * The D-06 waterfall, shared by every method (D-05 reuses the same rounding
 * helper for every round; D-06 reuses the same redistribution).
 *
 * Two constraints bound every take, and they are SEPARATE — never collapsed:
 *   1. the target's own scope ceiling (`event_charges` carries a per-attendee
 *      cap; a `whole_order` target is capped only by its order's pool), and
 *   2. its order's SHARED pool, one pool per order consumed by EVERY target of
 *      that order whatever the target's scope.
 *
 * `headroom[i]` is the ROUND-START snapshot of those two constraints, but the
 * `take` is additionally clamped against the order's LIVE pool and the pool is
 * debited IMMEDIATELY. That live clamp is load-bearing: on its own the snapshot
 * lets two or more targets of the SAME order each draw the full pool, which
 * would emit rows summing above the order's outstanding — a plan
 * `validateAllocationPlan` must reject, breaking preview/commit parity. With the
 * live debit, the engine's rows for an order can never exceed its outstanding.
 *
 * The helper always distributes the whole `roundRemainingMinor`, so a target
 * whose take was clamped leaves its surplus in `remaining` for the next round;
 * that IS the redistribution. The loop terminates because every round that does
 * not finish the amount permanently removes at least one target (its ceiling is
 * reached or its order's pool is exhausted); `maxRounds` is a belt-and-braces
 * bound, and any residual amount is left as leftover rather than looping.
 */
export function runAllocationWaterfall(
  input: AllocationWaterfallInput
): AllocationWaterfallResult {
  const targets = input.targets
  const targetCount = targets.length

  const amounts = new Array<number>(targetCount).fill(0)
  const extraUnits = new Array<number>(targetCount).fill(0)

  // TARGET-indexed weights, normalized exactly as the helper normalizes its
  // own, so the recomputed exact share below is the very number the helper used.
  const weights = new Array<number>(targetCount)
  for (let index = 0; index < targetCount; index++) {
    const raw = input.weights[index]
    weights[index] = Number.isFinite(raw) ? Math.max(0, Math.floor(raw)) : 0
  }

  // ONE shared per-order pool, initialised lazily to the attendee-agnostic
  // whole-order outstanding. EVERY target of an order draws on it, whatever
  // that target's scope, so it is counted once per round no matter how many
  // sibling rows the submission carries.
  const orderPoolRemaining = new Map<string, number>()

  const ensureOrderPool = (target: DonationDistributionTarget): number => {
    const existing = orderPoolRemaining.get(target.orderId)
    if (existing !== undefined) {
      return existing
    }
    const ceiling = input.ceilings.get(target.attendeeId)
    const initial = ceiling
      ? resolveScopeOutstandingMinor(ceiling, "whole_order")
      : 0
    orderPoolRemaining.set(target.orderId, initial)
    return initial
  }

  // TARGET-indexed per-attendee cap. `whole_order` has none of its own — the
  // shared order pool is its only cap (D-12, attendee-agnostic).
  const attendeeCapRemaining = new Array<number>(targetCount)
  for (let index = 0; index < targetCount; index++) {
    const target = targets[index]
    if (target.scope === "whole_order") {
      attendeeCapRemaining[index] = Number.POSITIVE_INFINITY
      continue
    }
    const ceiling = input.ceilings.get(target.attendeeId)
    attendeeCapRemaining[index] = ceiling
      ? resolveScopeOutstandingMinor(ceiling, "event_charges")
      : 0
  }

  let remaining = normalizeMinorAmount(input.totalMinor)
  const maxRounds = targetCount + 1

  for (let round = 0; round < maxRounds && remaining > 0; round++) {
    // ROUND-START headroom: the pool is re-read here, so an order exhausted by
    // an earlier round reports 0 and drops its targets out of the active set.
    const headroom = new Array<number>(targetCount)
    for (let index = 0; index < targetCount; index++) {
      const target = targets[index]
      headroom[index] = Math.min(
        ensureOrderPool(target),
        attendeeCapRemaining[index]
      )
    }

    const active = input.activeSelector
      ? input.activeSelector(headroom, round)
      : selectEveryTargetWithHeadroom(headroom)

    if (active.length === 0) {
      // No target can absorb anything; leave the rest as leftover (DON-05).
      break
    }

    // Summed over the ACTIVE subset only. Never index a compacted weight array
    // with a target index — that yields `undefined` and a NaN exact share.
    let activeWeightSum = 0
    for (const index of active) {
      activeWeightSum += weights[index]
    }

    // Round cap: each DISTINCT active order contributes its live pool ONCE,
    // because every row of this submission consumes that same pool.
    let roundCapacity = 0
    const activeOrderIds = new Set<string>()
    for (const index of active) {
      const orderId = targets[index].orderId
      if (activeOrderIds.has(orderId)) {
        continue
      }
      activeOrderIds.add(orderId)
      roundCapacity += orderPoolRemaining.get(orderId) ?? 0
    }

    // SNAPSHOT the round-start base the helper will use, BEFORE the loop below
    // mutates `remaining`.
    const roundRemainingMinor = Math.min(remaining, roundCapacity)
    if (roundRemainingMinor <= 0 || activeWeightSum <= 0) {
      break
    }

    const roundResult = allocateMinorAmountByWeight(
      roundRemainingMinor,
      active.map((index) => ({
        id: String(index),
        weightMinor: weights[index],
      }))
    )

    for (const index of active) {
      const target = targets[index]
      const take = Math.min(
        roundResult.get(String(index)) ?? 0,
        headroom[index],
        orderPoolRemaining.get(target.orderId) ?? 0
      )

      if (take <= 0) {
        continue
      }

      // The exact share is recomputed from the ROUND-START total, the
      // TARGET-indexed weight and the ACTIVE-only weight sum — the same numbers
      // the helper used. It is measured from the CLAMPED take, so a unit the
      // helper awarded to a target whose take was then capped never counts: it
      // did not land, it is still in `remaining`, and it is re-offered next
      // round. A capped target must never be reported as a remainder recipient.
      const exactShare =
        (roundRemainingMinor * weights[index]) / activeWeightSum
      extraUnits[index] += Math.max(0, take - Math.floor(exactShare))
      amounts[index] += take

      // Debit IMMEDIATELY, so the next target of this order sees the reduced
      // pool rather than a fresh round-start snapshot. EVERY accepted take
      // debits it, ANY scope.
      orderPoolRemaining.set(
        target.orderId,
        (orderPoolRemaining.get(target.orderId) ?? 0) - take
      )

      if (target.scope === "event_charges") {
        attendeeCapRemaining[index] -= take
      }

      remaining -= take
    }
  }

  const amountsByAttendeeId = new Map<string, number>()
  const extraUnitsByAttendeeId = new Map<string, number>()
  for (let index = 0; index < targetCount; index++) {
    const attendeeId = targets[index].attendeeId
    amountsByAttendeeId.set(attendeeId, amounts[index])
    extraUnitsByAttendeeId.set(attendeeId, extraUnits[index])
  }

  return { amountsByAttendeeId, extraUnitsByAttendeeId }
}

/**
 * Equal split (D-05): the same waterfall with a weight of 1 for every target.
 * Passing `headroom` as the weight would silently turn this into a proportional
 * split — the weights are deliberately uniform.
 */
export function distributeEqually(input: {
  totalMinor: number
  targets: ReadonlyArray<DonationDistributionTarget>
  ceilings: ReadonlyMap<string, AllocationCeiling>
}): AllocationWaterfallResult {
  return runAllocationWaterfall({
    totalMinor: input.totalMinor,
    targets: input.targets,
    ceilings: input.ceilings,
    weights: input.targets.map(() => 1),
  })
}

/**
 * The largest-balance-first active rule (D-10): only the highest-ranked target
 * that still carries headroom. Headroom is re-read every round, so a target
 * whose own ceiling was reached — or whose order's shared pool was exhausted by
 * an earlier target — drops out and the next one down the ranked list takes
 * over.
 */
function selectTopRankedTargetWithHeadroom(
  headroom: ReadonlyArray<number>
): number[] {
  for (let index = 0; index < headroom.length; index++) {
    if (headroom[index] > 0) {
      return [index]
    }
  }
  return []
}

/**
 * Ranks targets by each target's OWN selected-scope balance, descending
 * (D-08). The ranking basis and the enforced cap are the same number, so the
 * order always matches the ceiling that will actually bind — never the
 * attendee's due, the donation amount, or a single shared ceiling.
 *
 * Equal balances break by the target's index in the submitted array (stable
 * selection order, D-09) — the same stable-index convention
 * `allocateMinorAmountByWeight` uses for its remainder tie-break. The index
 * array sort is explicit rather than relying on the engine's sort stability.
 */
export function rankTargetsByScopeBalance(
  targets: ReadonlyArray<DonationDistributionTarget>,
  ceilings: ReadonlyMap<string, AllocationCeiling>
): DonationDistributionTarget[] {
  const ranked = targets.map((target, index) => {
    const ceiling = ceilings.get(target.attendeeId)
    return {
      target,
      index,
      balance: ceiling
        ? resolveScopeOutstandingMinor(ceiling, target.scope)
        : 0,
    }
  })

  ranked.sort((left, right) =>
    left.balance !== right.balance
      ? right.balance - left.balance
      : left.index - right.index
  )

  return ranked.map((entry) => entry.target)
}

/**
 * Largest-balance-first (DON-04, D-08, D-09, D-10): rank by each target's own
 * scope balance, fill the top-ranked target to its ceiling, then continue down
 * the ranked list until the amount is exhausted or every listed ceiling is
 * reached.
 *
 * A target whose scope balance is already zero ranks last, receives 0 and is
 * returned as skipped with no allocation row (D-20). Leftover after every
 * listed ceiling is reached is SUCCESS — the unplaced amount stays available
 * for a later allocation (DON-05) and is never an error.
 */
export function distributeLargestBalanceFirst(input: {
  totalMinor: number
  targets: ReadonlyArray<DonationDistributionTarget>
  ceilings: ReadonlyMap<string, AllocationCeiling>
}): AllocationWaterfallResult {
  const ranked = rankTargetsByScopeBalance(input.targets, input.ceilings)

  return runAllocationWaterfall({
    totalMinor: input.totalMinor,
    targets: ranked,
    ceilings: input.ceilings,
    weights: ranked.map(() => 1),
    activeSelector: selectTopRankedTargetWithHeadroom,
  })
}

/**
 * The ONE pure entry point every distribution call goes through: turn a method
 * + the operator's selected targets + the server-owned ceilings into validated
 * plan rows plus a fully reported breakdown (D-07).
 *
 * Refusal order is fixed so the code a caller sees for a given bad request is
 * predictable, and the structural codes match `validateAllocationPlan`'s so the
 * two paths can never disagree:
 *
 *   empty -> plan-too-large -> duplicate -> unknown target -> unsupported method
 *
 * `manual` is refused here on purpose: manual amounts are explicit operator
 * inputs that have their own validation path, so this orchestrator — which
 * derives amounts — never invents them.
 *
 * A skipped target is reported in `breakdown` with `skipped: true` and one of
 * the two reasons, and never appears in `rows`. A distribution that cannot place
 * the whole amount returns the unplaced part as `leftoverMinor` (DON-05); that
 * is SUCCESS, so this function never throws for insufficient capacity.
 */
export function buildDistributionPlan(input: {
  method: DonationDistributionMethod
  availableMinor: number
  targets: ReadonlyArray<DonationDistributionTarget>
  ceilings: ReadonlyMap<string, AllocationCeiling>
}): DonationDistributionPlan {
  const targets = input.targets

  if (targets.length === 0) {
    throwAllocationError(
      DONATION_ALLOCATION_ERROR_CODES.DONATION_ALLOCATION_EMPTY_PLAN,
      "a distribution needs at least one selected target"
    )
  }

  if (targets.length > MAX_ALLOCATION_PLAN_ROWS) {
    throwAllocationError(
      DONATION_ALLOCATION_ERROR_CODES.DONATION_ALLOCATION_PLAN_TOO_LARGE,
      `a submission may carry at most ${MAX_ALLOCATION_PLAN_ROWS} targets`
    )
  }

  const seenAttendeeIds = new Set<string>()
  for (const target of targets) {
    if (seenAttendeeIds.has(target.attendeeId)) {
      throwAllocationError(
        DONATION_ALLOCATION_ERROR_CODES.DONATION_ALLOCATION_DUPLICATE_TARGET,
        `attendee ${target.attendeeId} appears more than once`
      )
    }
    seenAttendeeIds.add(target.attendeeId)
  }

  for (const target of targets) {
    const ceiling = input.ceilings.get(target.attendeeId)
    if (!ceiling || ceiling.orderId !== target.orderId) {
      throwAllocationError(
        DONATION_ALLOCATION_ERROR_CODES.DONATION_ALLOCATION_UNKNOWN_TARGET,
        `no ceiling for attendee ${target.attendeeId} on order ${target.orderId}`
      )
    }
  }

  const totalMinor = normalizeMinorAmount(input.availableMinor)

  if (input.method === "manual") {
    throwAllocationError(
      DONATION_ALLOCATION_ERROR_CODES.DONATION_ALLOCATION_UNSUPPORTED_METHOD,
      "manual distributions supply explicit per-attendee amounts"
    )
  }

  // Equal keeps the submitted order; largest-balance-first reports the ranked
  // order, so the breakdown (and therefore `rows`) mirrors the fill order.
  const orderedTargets =
    input.method === "largest_balance_first"
      ? rankTargetsByScopeBalance(targets, input.ceilings)
      : [...targets]

  const distribution =
    input.method === "largest_balance_first"
      ? distributeLargestBalanceFirst({
          totalMinor,
          targets: orderedTargets,
          ceilings: input.ceilings,
        })
      : distributeEqually({
          totalMinor,
          targets: orderedTargets,
          ceilings: input.ceilings,
        })

  const breakdown = orderedTargets.map<DonationDistributionTargetResult>(
    (target) => {
      const ceiling = input.ceilings.get(target.attendeeId) as AllocationCeiling
      const ceilingMinor = resolveScopeOutstandingMinor(ceiling, target.scope)
      const amountMinor =
        distribution.amountsByAttendeeId.get(target.attendeeId) ?? 0
      const extraMinorUnits =
        distribution.extraUnitsByAttendeeId.get(target.attendeeId) ?? 0

      const result: DonationDistributionTargetResult = {
        attendeeId: target.attendeeId,
        orderId: target.orderId,
        scope: target.scope,
        ceilingMinor,
        amountMinor,
        extraMinorUnits,
        skipped: false,
      }

      // `skipped` is set in EACH of the two branches; both fields stay unset
      // only when the target was actually funded.
      if (ceilingMinor <= 0) {
        result.skipped = true
        result.skipReason = "zero_scope_balance"
      } else if (amountMinor === 0) {
        result.skipped = true
        result.skipReason = "no_funds_remaining"
      }

      return result
    }
  )

  // A skipped target is never written as a row, and by construction no funded
  // entry is zero: a target is skipped whenever its amount is 0.
  const rows: DonationAllocationPlanRow[] = breakdown
    .filter((entry) => !entry.skipped)
    .map((entry) => ({
      attendeeId: entry.attendeeId,
      orderId: entry.orderId,
      amountMinor: entry.amountMinor,
      scope: entry.scope,
    }))

  const totalAllocatedMinor = breakdown.reduce(
    (sum, entry) => sum + entry.amountMinor,
    0
  )

  // INVARIANT (by construction, stated so it is never regressed): the engine
  // never places more than `totalMinor` — every take is clamped by the live
  // `remaining` — so `totalAllocatedMinor <= totalMinor`, no `rows` entry is
  // <= 0, and `totalAllocatedMinor + leftoverMinor === totalMinor` always
  // holds. That is why `validateAllocationPlan` can never reject the engine's
  // own output, and why preview and commit can share it.
  const leftoverMinor = Math.max(0, totalMinor - totalAllocatedMinor)

  const remainderMinor = breakdown.reduce(
    (sum, entry) => sum + entry.extraMinorUnits,
    0
  )

  // D-07/DON-03: name exactly who absorbed the extra minor unit(s) — only units
  // that actually landed count.
  const remainderRecipientAttendeeIds = breakdown
    .filter((entry) => entry.extraMinorUnits > 0)
    .map((entry) => entry.attendeeId)

  return {
    method: input.method,
    rows,
    breakdown,
    totalAllocatedMinor,
    leftoverMinor,
    remainderMinor,
    remainderRecipientAttendeeIds,
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
