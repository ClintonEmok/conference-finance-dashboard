import { Section, Text } from "@react-email/components"
import type { PaymentReminderKind } from "../../domain/payment-reminders"
import { PAYMENT_REMINDER_COPY } from "../payment-reminder-copy"
import {
  EmailButton,
  EmailCard,
  EmailContent,
  EmailFooter,
  EmailHeader,
  EmailKicker,
  EmailLayout,
  EmailMetricSummary,
} from "./email-design"

export default function PaymentReminderEmail(props: {
  kind: PaymentReminderKind
  eventName: string
  eventDate: string
  bookerName: string
  bookingRef: string
  amountDueMinor: number
  paidAmountMinor: number
  outstandingAmountMinor: number
  currency: string
  managePaymentUrl: string
}) {
  const copy = PAYMENT_REMINDER_COPY[props.kind]

  return (
    <EmailLayout preview={copy.subject}>
      <EmailHeader
        eyebrow="Payment update"
        title={copy.subject}
        intro={copy.message}
      />

      <EmailContent>
        <Text
          className="email-main-copy"
          style={{
            margin: 0,
            color: "#334155",
            fontSize: "15px",
            lineHeight: 1.65,
          }}
        >
          Hi {props.bookerName},
        </Text>
        <Text
          className="email-main-copy"
          style={{
            margin: "10px 0 0",
            color: "#536174",
            fontSize: "14px",
            lineHeight: 1.6,
          }}
        >
          Here is the current payment status for your conference booking. You
          can review the details and continue payment securely from your booking
          page.
        </Text>

        <EmailCard style={{ marginTop: "22px" }}>
          <EmailKicker>Event details</EmailKicker>
          <Text
            className="email-value"
            style={{
              margin: "8px 0 0",
              color: "#172033",
              fontSize: "18px",
              fontWeight: 700,
            }}
          >
            {props.eventName}
          </Text>
          <Text
            className="email-muted"
            style={{ margin: "6px 0 0", color: "#536174", fontSize: "14px" }}
          >
            {props.eventDate}
            <br />
            Booking reference: <strong>{props.bookingRef}</strong>
          </Text>
        </EmailCard>

        <Section style={{ marginTop: "16px" }}>
          <EmailMetricSummary
            amountDueMinor={props.amountDueMinor}
            paidAmountMinor={props.paidAmountMinor}
            outstandingAmountMinor={props.outstandingAmountMinor}
            currency={props.currency}
          />
        </Section>

        <Section style={{ marginTop: "24px", textAlign: "center" }}>
          <Text
            className="email-main-copy"
            style={{
              margin: "0 0 12px",
              color: "#536174",
              fontSize: "14px",
              lineHeight: 1.6,
            }}
          >
            Manage your booking to review payment progress and complete the
            outstanding amount.
          </Text>
          <EmailButton href={props.managePaymentUrl}>
            Manage booking and payment
          </EmailButton>
        </Section>
      </EmailContent>

      <EmailFooter>
        This email was sent by DCLM NL Conference. If you have any questions,
        please contact the event organizers.
      </EmailFooter>
    </EmailLayout>
  )
}
