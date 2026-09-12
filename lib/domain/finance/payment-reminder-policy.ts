import { deriveBalanceAmounts } from "./amounts"

export type PaymentReminderKind = "partial" | "outstanding"

export function classifyPaymentReminder(amountDueMinor: number, paidAmountMinor: number) {
  const balance = deriveBalanceAmounts(amountDueMinor, paidAmountMinor)
  if (balance.outstandingAmountMinor <= 0) return null
  return {
    kind: (balance.paidAmountMinor > 0 ? "partial" : "outstanding") as PaymentReminderKind,
    ...balance,
  }
}

export { deriveBalanceAmounts }
