import {
  Body,
  Container,
  Head,
  Heading,
  Html,
  Preview,
  Text,
  Section,
} from "@react-email/components"
import { EmailTikkieSection } from "./EmailTikkieSection"

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
  roomAssignments: Array<{
    roomType: string
    hotelName: string
    bedCount: number
  }>
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
  roomAssignments,
  successPageUrl,
}: SignupConfirmationEmailProps) {
  return (
    <Html>
      <Head />
      <Preview>Your booking for {eventName} is confirmed</Preview>
      <Body style={{ fontFamily: "sans-serif", backgroundColor: "#f6f6f6" }}>
        <Container
          style={{
            maxWidth: "600px",
            margin: "0 auto",
            backgroundColor: "#ffffff",
            padding: "20px",
          }}
        >
          <Heading style={{ color: "#111827", fontSize: "24px" }}>
            Booking Confirmed!
          </Heading>
          <Text style={{ color: "#374151", fontSize: "16px" }}>
            Hi {bookerName},
          </Text>
          <Text style={{ color: "#374151", fontSize: "16px" }}>
            Your booking for <strong>{eventName}</strong> is confirmed.
          </Text>

          <Section
            style={{
              backgroundColor: "#f3f4f6",
              padding: "15px",
              borderRadius: "8px",
              margin: "20px 0",
            }}
          >
            <Text style={{ margin: "0 0 8px 0", color: "#111827" }}>
              <strong>Booking Reference:</strong> {bookingRef}
            </Text>
            <Text style={{ margin: "0 0 8px 0", color: "#111827" }}>
              <strong>Date:</strong> {eventDate}
            </Text>
            <Text style={{ margin: "0 0 8px 0", color: "#111827" }}>
              <strong>Location:</strong> {eventLocation}
            </Text>
            <Text style={{ margin: "0", color: "#111827" }}>
              <strong>Attendees:</strong> {attendeeCount}
            </Text>
          </Section>

          {roomAssignments.length > 0 && (
            <Section style={{ margin: "20px 0" }}>
              <Heading
                as="h2"
                style={{
                  fontSize: "18px",
                  color: "#111827",
                  marginBottom: "12px",
                }}
              >
                Room Assignments
              </Heading>
              {roomAssignments.map((room, index) => (
                <Text
                  key={index}
                  style={{
                    margin: "4px 0",
                    color: "#374151",
                    fontSize: "14px",
                  }}
                >
                  {room.roomType} at {room.hotelName} ({room.bedCount} bed
                  {room.bedCount > 1 ? "s" : ""})
                </Text>
              ))}
            </Section>
          )}

          <EmailTikkieSection
            tikkieUrl={tikkieUrl}
            eventName={eventName}
            amountMinor={tikkieAmountMinor}
            currency={tikkieCurrency}
          />

          <Text
            style={{
              marginTop: "32px",
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
              marginTop: "24px",
              fontSize: "12px",
              color: "#9ca3af",
            }}
          >
            This email was sent by Conference Finance. If you have any
            questions, please contact the event organizers.
          </Text>
        </Container>
      </Body>
    </Html>
  )
}
