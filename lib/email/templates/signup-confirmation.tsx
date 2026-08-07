import {
  Body,
  Container,
  Head,
  Heading,
  Html,
  Img,
  Preview,
  Text,
  Section,
} from "@react-email/components"
import { EmailTikkieSection } from "./EmailTikkieSection"

const logoUrl = `${process.env.NEXT_PUBLIC_SITE_URL ?? "http://localhost:3000"}/dlbc-logo.png`

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
    <Html lang="en">
      <Head />
      <Preview>
        {bookerName}, your booking for {eventName} is confirmed
      </Preview>
      <Body
        style={{
          margin: 0,
          padding: "24px 0",
          fontFamily:
            'Inter, ui-sans-serif, system-ui, -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif',
          backgroundColor: "#f3f4f6",
        }}
      >
        <Container
          style={{
            maxWidth: "600px",
            margin: "0 auto",
            backgroundColor: "#ffffff",
            padding: "0",
            borderRadius: "16px",
            overflow: "hidden",
            border: "1px solid #e5e7eb",
          }}
        >
          <Section
            style={{
              backgroundColor: "#0f172a",
              padding: "24px 28px",
            }}
          >
            <Img
              src={logoUrl}
              alt="DCLM NL Conference logo"
              width="56"
              height="56"
              style={{
                display: "block",
                width: "56px",
                height: "56px",
                borderRadius: "14px",
                marginBottom: "14px",
              }}
            />
            <Text
              style={{
                margin: 0,
                color: "#93c5fd",
                fontSize: "12px",
                fontWeight: 700,
                letterSpacing: "0.12em",
                textTransform: "uppercase",
              }}
            >
              DCLM NL Conference
            </Text>
            <Heading
              style={{
                margin: "10px 0 0",
                color: "#ffffff",
                fontSize: "30px",
                lineHeight: "36px",
              }}
            >
              Booking Confirmed
            </Heading>
            <Text
              style={{
                margin: "10px 0 0",
                color: "#cbd5e1",
                fontSize: "15px",
              }}
            >
              Hi {bookerName}, your booking for <strong>{eventName}</strong> is
              confirmed.
            </Text>
          </Section>

          <Section style={{ padding: "24px 28px 8px" }}>
            <Text style={{ margin: 0, color: "#475569", fontSize: "14px" }}>
              Use the booking reference below whenever you need to manage your
              booking — review payment progress, view booking details, or
              update accommodation.
            </Text>
          </Section>

          <Section
            style={{
              backgroundColor: "#f8fafc",
              padding: "20px 28px",
              margin: "16px 28px 0",
              borderRadius: "14px",
              border: "1px solid #e2e8f0",
            }}
          >
            <Text
              style={{
                margin: "0 0 10px 0",
                color: "#64748b",
                fontSize: "12px",
                textTransform: "uppercase",
                letterSpacing: "0.08em",
              }}
            >
              Booking Reference
            </Text>
            <Text
              style={{
                margin: 0,
                color: "#0f172a",
                fontSize: "26px",
                fontWeight: 700,
                letterSpacing: "0.02em",
              }}
            >
              {bookingRef}
            </Text>
            <Text
              style={{ margin: "16px 0 0", color: "#334155", fontSize: "14px" }}
            >
              <strong>Date:</strong> {eventDate}
            </Text>
            <Text
              style={{ margin: "8px 0 0", color: "#334155", fontSize: "14px" }}
            >
              <strong>Location:</strong> {eventLocation}
            </Text>
            <Text
              style={{ margin: "8px 0 0", color: "#334155", fontSize: "14px" }}
            >
              <strong>Attendees:</strong> {attendeeCount}
            </Text>
          </Section>

          <EmailTikkieSection
            tikkieUrl={tikkieUrl}
            eventName={eventName}
            amountMinor={tikkieAmountMinor}
            currency={tikkieCurrency}
          />

          <Text
            style={{
              margin: "24px 28px 0",
              fontSize: "14px",
              color: "#334155",
            }}
          >
            You can manage your booking — review payment progress, update
            accommodation preferences, or make a payment — anytime at{" "}
            <a
              href={trackPaymentUrl}
              style={{ color: "#3b82f6", textDecoration: "none" }}
            >
              {trackPaymentUrl}
            </a>
            . Keep your booking reference <strong>{bookingRef}</strong> at
            hand.
          </Text>

          <Text
            style={{
              margin: "24px 28px 0",
              fontSize: "14px",
              color: "#6b7280",
            }}
          >
            View your full booking details:{" "}
            <a
              href={successPageUrl}
              style={{ color: "#3b82f6", textDecoration: "none" }}
            >
              {successPageUrl}
            </a>
          </Text>

          <Text
            style={{
              margin: "24px 28px 28px",
              fontSize: "12px",
              color: "#9ca3af",
            }}
          >
            This email was sent by DCLM NL Conference. If you have any
            questions, please contact the event organizers.
          </Text>
        </Container>
      </Body>
    </Html>
  )
}
