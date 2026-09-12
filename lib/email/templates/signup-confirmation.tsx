import { Section, Text } from "@react-email/components"
import { EmailTikkieSection } from "./EmailTikkieSection"
import {
  EmailBookingReference,
  EmailButton,
  EmailCard,
  EmailContent,
  EmailFooter,
  EmailHeader,
  EmailKicker,
  EmailLayout,
} from "./email-design"

interface SignupConfirmationEmailProps {
  bookerName: string
  bookingRef: string
  eventName: string
  eventDate: string
  eventLocation: string
  tikkieUrl: string | null
  tikkieAmountMinor?: number
  tikkieCurrency?: string
  attendeeCount: number
  trackPaymentUrl: string
  successPageUrl: string
}

export default function SignupConfirmationEmail({
  bookerName,
  bookingRef,
  eventName,
  eventDate,
  eventLocation,
  tikkieUrl,
  tikkieAmountMinor,
  tikkieCurrency,
  attendeeCount,
  trackPaymentUrl,
  successPageUrl,
}: SignupConfirmationEmailProps) {
  return (
    <EmailLayout
      preview={`${bookerName}, your booking for ${eventName} is confirmed`}
    >
      <EmailHeader
        title="Booking Confirmed"
        intro={
          <>
            Hi {bookerName}, your booking for <strong>{eventName}</strong> is
            confirmed.
          </>
        }
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
          Keep your booking reference nearby. You can use it to review payment
          progress, view your booking details, or update accommodation.
        </Text>

        <Section style={{ marginTop: "18px" }}>
          <EmailBookingReference bookingRef={bookingRef} />
        </Section>

        <EmailCard style={{ marginTop: "16px" }}>
          <EmailKicker>Booking at a glance</EmailKicker>
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
            style={{
              margin: "8px 0 0",
              color: "#536174",
              fontSize: "14px",
              lineHeight: 1.6,
            }}
          >
            <strong>Date:</strong> {eventDate}
            <br />
            <strong>Location:</strong> {eventLocation}
            <br />
            <strong>Attendees:</strong> {attendeeCount}
          </Text>
        </EmailCard>
      </EmailContent>

      <EmailTikkieSection
        tikkieUrl={tikkieUrl}
        eventName={eventName}
        amountMinor={tikkieAmountMinor}
        currency={tikkieCurrency}
      />

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
          Review payment progress, update accommodation preferences, or make a
          payment at any time.
        </Text>
        <EmailButton href={trackPaymentUrl}>Manage Booking</EmailButton>
      </EmailContent>

      <EmailContent style={{ paddingTop: "24px", textAlign: "center" }}>
        <Text
          className="email-muted"
          style={{ margin: "0 0 12px", color: "#6b7280", fontSize: "14px" }}
        >
          View your full booking details.
        </Text>
        <EmailButton href={successPageUrl} variant="secondary">
          View Booking Details
        </EmailButton>
      </EmailContent>

      <EmailFooter>
        This email was sent by DCLM NL Conference. If you have any questions,
        please contact the event organizers.
      </EmailFooter>
    </EmailLayout>
  )
}
