import { Section, Heading, Text, Button } from "@react-email/components"

interface EmailTikkieSectionProps {
  tikkieUrl: string | null
  eventName: string
  amountMinor?: number
  currency?: string
}

function formatCurrency(amountMinor: number, currency: string = "EUR"): string {
  const euros = amountMinor / 100
  return new Intl.NumberFormat("nl-NL", {
    style: "currency",
    currency,
  }).format(euros)
}

export function EmailTikkieSection({
  tikkieUrl,
  eventName,
  amountMinor,
  currency = "EUR",
}: EmailTikkieSectionProps) {
  if (!tikkieUrl) {
    return null
  }

  const hasFixedAmount = amountMinor && amountMinor > 0

  return (
    <Section
      style={{
        margin: "24px 0",
        padding: "20px",
        backgroundColor: "#eff6ff",
        border: "1px solid #dbeafe",
        borderRadius: "12px",
      }}
    >
      <Heading
        as="h2"
        style={{
          fontSize: "18px",
          color: "#0f172a",
          marginBottom: "10px",
        }}
      >
        Complete Your Payment
      </Heading>
      <Text style={{ color: "#334155", fontSize: "14px", margin: "0" }}>
        {hasFixedAmount
          ? `Please complete your payment of ${formatCurrency(amountMinor, currency)} for ${eventName} using the link below.`
          : `Please complete your payment for ${eventName} using the link below. You can pay any amount that covers your booking.`}
      </Text>
        <Button
          className="email-button-primary"
        href={tikkieUrl}
        style={{
          backgroundColor: "#0f172a",
          color: "#ffffff",
          padding: "12px 20px",
          textDecoration: "none",
          borderRadius: "10px",
          display: "inline-block",
          margin: "16px 8px 0",
          fontSize: "14px",
          fontWeight: "600",
        }}
      >
        Pay Now
      </Button>
    </Section>
  )
}
