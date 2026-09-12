import { classifyPaymentReminder as classify } from "../payment-reminders"
export type PaymentReminderKind = "unpaid" | "partial" | "overdue"
export function classifyPaymentReminder(amountDueMinor: number, paidAmountMinor: number, dueAt?: number, now?: number) {
  const result = classify({ amountDueMinor, paidAmountMinor, dueAt, now })
  return result ? { ...result, kind: result.kind === "unpaid" ? "outstanding" : result.kind } : null
}
export { deriveBalanceAmounts } from "../finance/amounts"
