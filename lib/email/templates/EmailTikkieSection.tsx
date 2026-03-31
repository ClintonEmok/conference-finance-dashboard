import { Section, Heading, Text, Button } from "@react-email/components"

interface EmailTikkieSectionProps {
  tikkieUrl: string | null
  eventName: string
}

export function EmailTikkieSection({
  tikkieUrl,
  eventName,
}: EmailTikkieSectionProps) {
  if (!tikkieUrl) {
    return null
  }

  return (
    <Section style={{ margin: "24px 0" }}>
      <Heading
        as="h2"
        style={{
          fontSize: "18px",
          color: "#111827",
          marginBottom: "12px",
        }}
      >
        Complete Your Payment
      </Heading>
      <Text style={{ color: "#374151", fontSize: "14px" }}>
        Please complete your payment for {eventName} using the link below. You
        can pay any amount that covers your booking.
      </Text>
      <Button
        href={tikkieUrl}
        style={{
          backgroundColor: "#3b82f6",
          color: "#ffffff",
          padding: "12px 24px",
          textDecoration: "none",
          borderRadius: "6px",
          display: "inline-block",
          marginTop: "12px",
          fontSize: "14px",
          fontWeight: "600",
        }}
      >
        Pay Now
      </Button>
      <Text
        style={{
          marginTop: "12px",
          fontSize: "12px",
          color: "#6b7280",
        }}
      >
        Or copy this link: {tikkieUrl}
      </Text>
    </Section>
  )
}
