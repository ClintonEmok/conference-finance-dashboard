import { performance } from "node:perf_hooks"
import { describe, expect, it } from "vitest"

import {
  evaluateOrderPaymentMatch,
  scoreAttendeeMatch,
  scoreNameMatch,
  type OrderPaymentMatchCandidate,
} from "@/lib/domain/finance/payment-matching"

type MockPayment = {
  eventId: string
  payerName: string
  payerAccountNumber: string
  amountMinor: number
  expectedOrderId: string
}

type BenchmarkResult = {
  elapsedMs: number
  candidateEvaluations: number
  matchedOrderIds: string[]
}

const EVENT_COUNT = 20
const ORDERS_PER_EVENT = 100
const PAYMENTS_PER_EVENT = 10
const MEASURED_RUNS = 3

function buildWorkload() {
  const candidates: OrderPaymentMatchCandidate[] = []
  const payments: MockPayment[] = []

  for (let eventIndex = 0; eventIndex < EVENT_COUNT; eventIndex++) {
    for (let orderIndex = 0; orderIndex < ORDERS_PER_EVENT; orderIndex++) {
      const orderId = `order-${eventIndex}-${orderIndex}`
      candidates.push({
        orderId,
        bookerName: `Payer${eventIndex}x${orderIndex} Last${eventIndex}y${orderIndex}`,
        attendeeNames: [],
        amountDueMinor: 10_000,
        payerAccountNumbers: [`NL00${eventIndex}ACCOUNT${orderIndex}`],
      })
    }

    for (let paymentIndex = 0; paymentIndex < PAYMENTS_PER_EVENT; paymentIndex++) {
      const orderIndex = paymentIndex
      payments.push({
        eventId: `event-${eventIndex}`,
        payerName: `Payer${eventIndex}x${orderIndex} Last${eventIndex}y${orderIndex}`,
        payerAccountNumber: `NL00${eventIndex}ACCOUNT${orderIndex}`,
        amountMinor: 5_000,
        expectedOrderId: `order-${eventIndex}-${orderIndex}`,
      })
    }
  }

  const candidatesByEvent = new Map<string, OrderPaymentMatchCandidate[]>()
  for (const candidate of candidates) {
    const [, eventIndex] = candidate.orderId.split("-")
    const eventId = `event-${eventIndex}`
    const eventCandidates = candidatesByEvent.get(eventId) ?? []
    eventCandidates.push(candidate)
    candidatesByEvent.set(eventId, eventCandidates)
  }

  return { candidates, candidatesByEvent, payments }
}

function measureMatcher(
  payments: MockPayment[],
  selectCandidates: (payment: MockPayment) => OrderPaymentMatchCandidate[]
): BenchmarkResult {
  let candidateEvaluations = 0
  const matchedOrderIds: string[] = []
  const startedAt = performance.now()

  for (const payment of payments) {
    const candidates = selectCandidates(payment)
    candidateEvaluations += candidates.length

    const decision = evaluateOrderPaymentMatch(
      payment.payerName,
      payment.amountMinor,
      candidates,
      payment.payerAccountNumber
    )

    if (decision?.status === "auto_matched") {
      matchedOrderIds.push(decision.orderId)
    }
  }

  return {
    elapsedMs: performance.now() - startedAt,
    candidateEvaluations,
    matchedOrderIds,
  }
}

function measureRepeatedly(
  payments: MockPayment[],
  selectCandidates: (payment: MockPayment) => OrderPaymentMatchCandidate[]
): BenchmarkResult {
  // Warm up the same code path before collecting the informational timing.
  measureMatcher(payments, selectCandidates)

  let totalElapsedMs = 0
  let result: BenchmarkResult | null = null
  for (let run = 0; run < MEASURED_RUNS; run++) {
    result = measureMatcher(payments, selectCandidates)
    totalElapsedMs += result.elapsedMs
  }

  return {
    ...result!,
    elapsedMs: totalElapsedMs / MEASURED_RUNS,
  }
}

function selectDeferredAmountDueOrderIds(
  payments: MockPayment[],
  candidatesByEvent: Map<string, OrderPaymentMatchCandidate[]>
) {
  const orderIds = new Set<string>()

  for (const payment of payments) {
    for (const candidate of candidatesByEvent.get(payment.eventId) ?? []) {
      if (
        scoreNameMatch(payment.payerName, candidate.bookerName) > 0 ||
        scoreAttendeeMatch(payment.payerName, candidate.attendeeNames ?? []) > 0
      ) {
        orderIds.add(candidate.orderId)
      }
    }
  }

  return orderIds
}

describe("Tikkie matching performance comparison", () => {
  it("keeps decisions identical while reducing event-local comparisons", () => {
    const { candidates, candidatesByEvent, payments } = buildWorkload()

    // Before: every payment was compared against the broad cross-event set.
    const before = measureRepeatedly(payments, () => candidates)

    // After: event-scoped sync supplies only the candidates for that payment's event.
    const after = measureRepeatedly(
      payments,
      (payment) => candidatesByEvent.get(payment.eventId) ?? []
    )

    expect(after.matchedOrderIds).toEqual(before.matchedOrderIds)
    expect(after.matchedOrderIds).toEqual(
      payments.map((payment) => payment.expectedOrderId)
    )
    expect(after.candidateEvaluations).toBeLessThan(before.candidateEvaluations)
    expect(after.candidateEvaluations).toBe(
      payments.length * ORDERS_PER_EVENT
    )

    const comparisonReduction =
      1 - after.candidateEvaluations / before.candidateEvaluations
    const measuredSpeedup = before.elapsedMs / Math.max(after.elapsedMs, 0.001)

    console.log(
      JSON.stringify({
        workload: {
          events: EVENT_COUNT,
          ordersPerEvent: ORDERS_PER_EVENT,
          payments: payments.length,
        },
        before: {
          averageMs: Number(before.elapsedMs.toFixed(3)),
          candidateEvaluations: before.candidateEvaluations,
        },
        after: {
          averageMs: Number(after.elapsedMs.toFixed(3)),
          candidateEvaluations: after.candidateEvaluations,
        },
        comparisonReductionPercent: Number(
          (comparisonReduction * 100).toFixed(2)
        ),
        measuredSpeedup: Number(measuredSpeedup.toFixed(2)),
      })
    )
  }, 60_000)

  it("quantifies deferred canonical amount-due work", () => {
    const { candidates, candidatesByEvent, payments } = buildWorkload()
    const startedAt = performance.now()
    const deferredOrderIds = selectDeferredAmountDueOrderIds(
      payments,
      candidatesByEvent
    )
    const prefilterElapsedMs = performance.now() - startedAt

    // Before: every active order was resolved through the canonical amount-due
    // loader before matching started. After: only orders that can score against
    // an incoming payment need that loader at all.
    const beforeOrdersResolved = candidates.length
    const afterOrdersResolved = deferredOrderIds.size
    const orderReduction =
      1 - afterOrdersResolved / Math.max(beforeOrdersResolved, 1)
    const estimatedWorkSpeedup =
      beforeOrdersResolved / Math.max(afterOrdersResolved, 1)

    expect(afterOrdersResolved).toBe(payments.length)
    expect(afterOrdersResolved).toBeLessThan(beforeOrdersResolved)
    expect(orderReduction).toBeCloseTo(0.9, 10)
    expect(estimatedWorkSpeedup).toBeCloseTo(10, 10)

    console.log(
      JSON.stringify({
        workload: {
          events: EVENT_COUNT,
          orders: candidates.length,
          payments: payments.length,
        },
        canonicalAmountDueLoad: {
          beforeOrdersResolved,
          afterOrdersResolved,
          orderReductionPercent: Number((orderReduction * 100).toFixed(2)),
          estimatedWorkSpeedupIfPerOrderCostIsEqual: Number(
            estimatedWorkSpeedup.toFixed(2)
          ),
          candidatePrefilterMs: Number(prefilterElapsedMs.toFixed(3)),
        },
      })
    )
  })
})
