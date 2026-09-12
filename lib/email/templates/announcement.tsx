import { Section, Text } from "@react-email/components"
import {
  EmailBookingReference,
  EmailButton,
  EmailCard,
  EmailContent,
  EmailFooter,
  EmailHeader,
  EmailKicker,
  EmailLayout,
  EmailOptionCard,
} from "./email-design"

export interface AnnouncementEmailProps {
  title: string
  message: string
  eventName: string
  eventDate: string
  bookingRef?: string | null
  manageBookingUrl: string
  signupUrl: string
  paymentUrl?: string | null
  nightBeforeNote?: string | null
}

export default function AnnouncementEmail({
  title,
  message,
  eventName,
  eventDate,
  bookingRef,
  manageBookingUrl,
  signupUrl,
  paymentUrl,
  nightBeforeNote,
}: AnnouncementEmailProps) {
  return (
    <EmailLayout preview={title}>
      <EmailHeader
        eyebrow="Accommodation update"
        title={title}
        intro={message}
      />

      <EmailContent>
        <Text
          className="email-main-copy"
          style={{
            margin: 0,
            color: "#475569",
            fontSize: "14px",
            lineHeight: 1.65,
          }}
        >
          Your booking now has more ways to shape your stay. Review the
          available choices below, then manage your booking to select what you
          need.
        </Text>

        <EmailCard
          className="email-event-details"
          style={{ marginTop: "20px" }}
        >
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
            {eventName}
          </Text>
          <Text
            className="email-muted"
            style={{ margin: "8px 0 0", color: "#536174", fontSize: "14px" }}
          >
            <strong>Date:</strong> {eventDate}
          </Text>
        </EmailCard>
      </EmailContent>

      <EmailContent style={{ paddingTop: "22px" }}>
        <EmailKicker>What you can choose</EmailKicker>
        <Text
          className="email-main-copy"
          style={{
            margin: "7px 0 0",
            color: "#536174",
            fontSize: "14px",
            lineHeight: 1.55,
          }}
        >
          Options are subject to availability and are confirmed when you update
          your booking.
        </Text>
        <EmailOptionCard number="01" title="Included stay upgrade">
          Choose between the available Standard or Superior accommodation for
          your included stay.
        </EmailOptionCard>
        <EmailOptionCard number="02" title="Night-before accommodation">
          Arrive earlier and add a night before the conference where available.
        </EmailOptionCard>
        <EmailOptionCard number="03" title="Cot add-on">
          Add a cot to your room when your selected accommodation supports it.
        </EmailOptionCard>
      </EmailContent>

      {nightBeforeNote ? (
        <EmailContent style={{ paddingTop: "20px" }}>
          <Text
            className="email-callout"
            style={{
              margin: 0,
              padding: "15px 17px",
              color: "#334155",
              backgroundColor: "#f1f4ff",
              borderLeft: "3px solid #5b57e8",
              borderRadius: "0 10px 10px 0",
              fontSize: "14px",
              lineHeight: 1.6,
            }}
          >
            {nightBeforeNote}
          </Text>
        </EmailContent>
      ) : null}

      {paymentUrl ? (
        <EmailContent style={{ paddingTop: "24px", textAlign: "center" }}>
          <Text
            className="email-main-copy"
            style={{
              margin: "0 0 12px",
              color: "#536174",
              fontSize: "14px",
              lineHeight: 1.6,
            }}
          >
            Need to settle your balance first? Review your payment securely.
          </Text>
          <EmailButton href={paymentUrl}>Review Payment</EmailButton>
        </EmailContent>
      ) : null}

      <EmailContent style={{ paddingTop: "24px", textAlign: "center" }}>
        <Text
          className="email-main-copy"
          style={{
            margin: "0 0 12px",
            color: "#536174",
            fontSize: "14px",
            lineHeight: 1.6,
          }}
        >
          Review payment progress and update your accommodation preferences.
        </Text>
        {bookingRef ? (
          <Section style={{ margin: "0 0 14px" }}>
            <EmailBookingReference bookingRef={bookingRef} />
          </Section>
        ) : null}
        <EmailButton href={manageBookingUrl}>Manage Booking</EmailButton>
      </EmailContent>

      <EmailContent style={{ paddingTop: "24px", textAlign: "center" }}>
        <Text
          className="email-muted"
          style={{ margin: "0 0 12px", color: "#6b7280", fontSize: "14px" }}
        >
          Not registered yet? Create your booking below.
        </Text>
        <EmailButton href={signupUrl} variant="secondary">
          Register for the Conference
        </EmailButton>
      </EmailContent>

      <EmailFooter>
        This email was sent by DCLM NL Conference. If you have any questions,
        please contact us at it-support@deeperlife.nl.
      </EmailFooter>
    </EmailLayout>
  )
}
