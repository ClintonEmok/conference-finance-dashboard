import { deriveBalanceAmounts } from "./finance/amounts"

export const paymentReminderKinds = ["unpaid", "partial", "overdue"] as const
export type PaymentReminderKind = (typeof paymentReminderKinds)[number]

export function classifyPaymentReminder(input: {
  amountDueMinor: number
  paidAmountMinor: number
  dueAt?: number | null
  now?: number
}): { kind: PaymentReminderKind; amountDueMinor: number; paidAmountMinor: number; outstandingAmountMinor: number } | null {
  if (!Number.isFinite(input.amountDueMinor) || !Number.isFinite(input.paidAmountMinor)) return null
  const balance = deriveBalanceAmounts(input.amountDueMinor, input.paidAmountMinor)
  if (balance.amountDueMinor <= 0 || balance.outstandingAmountMinor <= 0) return null
  const now = input.now ?? Date.now()
  const overdue = Number.isFinite(input.dueAt) && now >= (input.dueAt as number)
  return {
    kind: overdue ? "overdue" : balance.paidAmountMinor > 0 ? "partial" : "unpaid",
    amountDueMinor: balance.amountDueMinor,
    paidAmountMinor: balance.paidAmountMinor,
    outstandingAmountMinor: balance.outstandingAmountMinor,
  }
}

export function automaticPeriod(now: number, cadenceMinutes: number, repeatPolicy: "oncePerPeriod" | "onceEver") {
  if (repeatPolicy === "onceEver") return "ever"
  if (!Number.isFinite(cadenceMinutes) || cadenceMinutes <= 0) return null
  return String(Math.floor(now / (cadenceMinutes * 60_000)))
}
