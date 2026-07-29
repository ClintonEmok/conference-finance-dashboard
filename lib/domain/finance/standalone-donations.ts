import type { Id } from "@/convex/_generated/dataModel"
import { api } from "@/lib/convex/api"
import { convexQuery } from "@/lib/convex/server"

export type StandaloneDonation = {
  _id: string
  _creationTime: number
  source: "cash" | "bank_transfer" | "tikkie"
  payerName: string
  amountMinor: number
  paidAt: number
  eventId?: Id<"events">
  notes?: string
}

export async function listStandaloneDonations(params: {
  eventId?: Id<"events">
  from?: number
  to?: number
}): Promise<StandaloneDonation[]> {
  const donations: StandaloneDonation[] = []
  let cursor: string | null = null
  let isDone = false

  while (!isDone) {
    const result: {
      page: StandaloneDonation[]
      isDone: boolean
      continueCursor: string
    } = await convexQuery(api.payments.getStandaloneDonations, {
      ...params,
      paginationOpts: {
        numItems: 100,
        cursor,
      },
    })

    donations.push(...result.page)
    isDone = result.isDone
    cursor = result.continueCursor
  }

  return donations
}
