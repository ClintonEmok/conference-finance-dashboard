const BOOKER_AUTO_THRESHOLD = 80
const BOOKER_AMBIGUOUS_THRESHOLD = 60
const ATTENDEE_CONFIDENCE_THRESHOLD = 80

export type OrderPaymentMatchCandidate = {
  orderId: string
  bookerName?: string | null
  attendeeNames?: string[]
  amountDueMinor?: number | null
  payerAccountNumbers?: string[]
}

function normalizeAccountNumber(value: string | null | undefined): string {
  return (value ?? "").trim().toLowerCase().replace(/[^a-z0-9]/g, "")
}

export type BookerOnlyMatchCandidate = {
  orderId: string
  bookerName?: string | null
}

export type PaymentMatchDecision =
  | {
      status: "auto_matched"
      orderId: string
    }
  | {
      status: "ambiguous"
    }

function normalizeName(value: string | null | undefined): string {
  return (value ?? "")
    .normalize("NFKD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, " ")
    .replace(/\s+/g, " ")
    .trim()
}

function tokenizeName(value: string | null | undefined): string[] {
  const normalized = normalizeName(value)
  return normalized ? normalized.split(" ") : []
}

function uniqueTokenCount(tokens: string[]): number {
  return new Set(tokens).size
}

function sharedTokens(leftTokens: string[], rightTokens: string[]): string[] {
  const rightSet = new Set(rightTokens)
  return [...new Set(leftTokens.filter((token) => rightSet.has(token)))]
}

export function scoreNameMatch(
  left: string | null | undefined,
  right: string | null | undefined
): number {
  const normalizedLeft = normalizeName(left)
  const normalizedRight = normalizeName(right)

  if (!normalizedLeft || !normalizedRight) {
    return 0
  }

  if (normalizedLeft === normalizedRight) {
    return 100
  }

  const leftTokens = tokenizeName(left)
  const rightTokens = tokenizeName(right)
  const shared = sharedTokens(leftTokens, rightTokens)

  if (
    shared.length > 0 &&
    shared.length === uniqueTokenCount(leftTokens) &&
    shared.length === uniqueTokenCount(rightTokens)
  ) {
    return 98
  }

  const leftLastToken = leftTokens[leftTokens.length - 1]
  const rightLastToken = rightTokens[rightTokens.length - 1]
  const lastTokenMatches = Boolean(
    leftLastToken && rightLastToken && leftLastToken === rightLastToken
  )

  if (lastTokenMatches) {
    if (shared.length >= 2) {
      return 94
    }

    if (leftTokens.length === 1 || rightTokens.length === 1) {
      return 84
    }

    return 90
  }

  if (shared.length >= 2) {
    return 86
  }

  if (shared.length === 1) {
    return shared[0].length >= 4 ? 72 : 60
  }

  return 0
}

export function scoreAttendeeMatch(
  payerName: string,
  attendeeNames: string[]
): number {
  let bestScore = 0

  for (const attendeeName of attendeeNames) {
    bestScore = Math.max(bestScore, scoreNameMatch(payerName, attendeeName))
  }

  return bestScore
}

function hasCompetingStrongBookerMatch(
  candidates: Array<{ bookerScore: number }>,
  bestBookerScore: number
): boolean {
  return candidates.some(
    (candidate) =>
      candidate.bookerScore >= BOOKER_AUTO_THRESHOLD &&
      candidate.bookerScore >= bestBookerScore - 5
  )
}

export function selectBestBookerMatch(
  payerName: string,
  candidates: BookerOnlyMatchCandidate[]
): PaymentMatchDecision | null {
  const scoredCandidates = candidates
    .map((candidate) => ({
      ...candidate,
      bookerScore: scoreNameMatch(payerName, candidate.bookerName),
    }))
    .filter((candidate) => candidate.bookerScore > 0)

  if (scoredCandidates.length === 0) {
    return null
  }

  scoredCandidates.sort(
    (left, right) =>
      right.bookerScore - left.bookerScore ||
      left.orderId.localeCompare(right.orderId)
  )

  const best = scoredCandidates[0]

  if (
    best.bookerScore >= BOOKER_AUTO_THRESHOLD &&
    !hasCompetingStrongBookerMatch(scoredCandidates.slice(1), best.bookerScore)
  ) {
    return {
      status: "auto_matched",
      orderId: best.orderId,
    }
  }

  if (best.bookerScore >= BOOKER_AMBIGUOUS_THRESHOLD) {
    return { status: "ambiguous" }
  }

  return null
}

export function evaluateOrderPaymentMatch(
  payerName: string,
  amountMinor: number,
  candidates: OrderPaymentMatchCandidate[],
  payerAccountNumber?: string | null
): PaymentMatchDecision | null {
  const scoredCandidates = candidates
    .map((candidate) => {
      const amountDueMinor =
        typeof candidate.amountDueMinor === "number" &&
        Number.isFinite(candidate.amountDueMinor)
          ? candidate.amountDueMinor
          : 0

      return {
        ...candidate,
        amountDueMinor,
        bookerScore: scoreNameMatch(payerName, candidate.bookerName),
        attendeeScore: scoreAttendeeMatch(
          payerName,
          candidate.attendeeNames ?? []
        ),
        amountCompatible:
          amountDueMinor > 0 &&
          amountMinor > 0 &&
          amountMinor <= amountDueMinor,
      }
    })
    .filter(
      (candidate) => candidate.bookerScore > 0 || candidate.attendeeScore > 0
    )

  if (scoredCandidates.length === 0) {
    return null
  }

  scoredCandidates.sort(
    (left, right) =>
      right.bookerScore - left.bookerScore ||
      right.attendeeScore - left.attendeeScore ||
      left.orderId.localeCompare(right.orderId)
  )

  const best = scoredCandidates[0]

  // An account is only a tie-breaker between otherwise strong, amount-compatible
  // booker candidates. It cannot create confidence, bypass amount safety, or
  // resolve a shared account.
  const normalizedPayerAccount = normalizeAccountNumber(payerAccountNumber)
  if (
    normalizedPayerAccount &&
    best.bookerScore >= BOOKER_AUTO_THRESHOLD &&
    best.amountCompatible
  ) {
    const competingStrong = scoredCandidates.filter(
      (candidate) =>
        candidate.bookerScore >= BOOKER_AUTO_THRESHOLD &&
        candidate.bookerScore >= best.bookerScore - 5 &&
        candidate.amountCompatible
    )
    const accountMatches = competingStrong.filter((candidate) =>
      (candidate.payerAccountNumbers ?? []).some(
        (account) => normalizeAccountNumber(account) === normalizedPayerAccount
      )
    )
    if (competingStrong.length > 1 && accountMatches.length === 1) {
      return { status: "auto_matched", orderId: accountMatches[0].orderId }
    }
  }

  if (
    best.bookerScore >= BOOKER_AUTO_THRESHOLD &&
    best.amountCompatible &&
    !hasCompetingStrongBookerMatch(scoredCandidates.slice(1), best.bookerScore)
  ) {
    return {
      status: "auto_matched",
      orderId: best.orderId,
    }
  }

  if (
    best.bookerScore >= BOOKER_AMBIGUOUS_THRESHOLD ||
    best.attendeeScore >= ATTENDEE_CONFIDENCE_THRESHOLD
  ) {
    return { status: "ambiguous" }
  }

  return null
}
