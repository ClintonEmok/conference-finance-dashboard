import type { PaymentReminderKind } from "../domain/payment-reminders"

export const paymentReminderKinds = ["unpaid", "partial", "overdue"] as const
export const PAYMENT_REMINDER_COPY: Record<PaymentReminderKind, { subject: string; message: string }> = {
  unpaid: { subject: "Complete your conference payment", message: "Your conference booking has an outstanding balance. Please complete your payment before the due date." },
  partial: { subject: "Complete your remaining conference payment", message: "We received part of your conference payment. Please review your booking and complete the remaining balance." },
  overdue: { subject: "Your conference payment is overdue", message: "Your conference booking still has an outstanding balance and the payment due date has passed. Please complete your payment." },
}
export const PAYMENT_REMINDER_TITLE = "Payment reminder"
export const PAYMENT_REMINDER_MESSAGE = PAYMENT_REMINDER_COPY.unpaid.message
export const PAYMENT_REMINDER_NOTE = "Review your booking to see the current balance and payment options."
