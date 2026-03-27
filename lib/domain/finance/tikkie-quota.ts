import { api } from "@/lib/convex/api"
import { convexQuery } from "@/lib/convex/server"

const DEFAULT_MONTHLY_TIKKIE_CREATION_LIMIT = 5

type TikkieLinkRecord = {
  _creationTime?: number
}

export type TikkieMonthlyCreationQuota = {
  limit: number
  used: number
  remaining: number
  monthStartIso: string
  monthEndIso: string
}

export class TikkieMonthlyQuotaExceededError extends Error {
  readonly quota: TikkieMonthlyCreationQuota

  constructor(quota: TikkieMonthlyCreationQuota) {
    super(
      `Monthly Tikkie quota reached (${quota.used}/${quota.limit}). Wait until next month or increase the quota.`
    )
    this.name = "TikkieMonthlyQuotaExceededError"
    this.quota = quota
  }
}

function resolveMonthlyLimit() {
  const fromEnv = Number.parseInt(
    process.env.TIKKIE_MONTHLY_CREATION_LIMIT ?? "",
    10
  )

  if (Number.isInteger(fromEnv) && fromEnv > 0) {
    return fromEnv
  }

  return DEFAULT_MONTHLY_TIKKIE_CREATION_LIMIT
}

function getUtcMonthBounds(nowMs: number) {
  const now = new Date(nowMs)
  const start = new Date(
    Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), 1, 0, 0, 0, 0)
  )
  const nextMonth = new Date(
    Date.UTC(now.getUTCFullYear(), now.getUTCMonth() + 1, 1, 0, 0, 0, 0)
  )

  return {
    startMs: start.getTime(),
    nextMonthMs: nextMonth.getTime(),
    startIso: start.toISOString(),
    nextMonthIso: nextMonth.toISOString(),
  }
}

export async function getTikkieMonthlyCreationQuotaStatus(
  nowMs = Date.now()
): Promise<TikkieMonthlyCreationQuota> {
  const { startMs, nextMonthMs, startIso, nextMonthIso } =
    getUtcMonthBounds(nowMs)
  const limit = resolveMonthlyLimit()

  const links = (await convexQuery(
    api.tikkie.getPaymentLinks,
    {}
  )) as TikkieLinkRecord[]

  const used = links.reduce((count, link) => {
    if (typeof link._creationTime !== "number") {
      return count
    }

    if (link._creationTime >= startMs && link._creationTime < nextMonthMs) {
      return count + 1
    }

    return count
  }, 0)

  return {
    limit,
    used,
    remaining: Math.max(0, limit - used),
    monthStartIso: startIso,
    monthEndIso: nextMonthIso,
  }
}

export async function enforceTikkieMonthlyCreationQuota(
  nowMs = Date.now()
): Promise<TikkieMonthlyCreationQuota> {
  const quota = await getTikkieMonthlyCreationQuotaStatus(nowMs)
  if (quota.remaining <= 0) {
    throw new TikkieMonthlyQuotaExceededError(quota)
  }

  return quota
}
