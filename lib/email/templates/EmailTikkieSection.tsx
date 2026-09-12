import { Heading, Section, Text } from "@react-email/components"
import { EmailButton, EmailCard, EmailKicker } from "./email-design"

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
  if (!tikkieUrl) return null

  const hasFixedAmount = amountMinor && amountMinor > 0

  return (
    <EmailCard accent style={{ margin: "24px 28px 0" }}>
      <EmailKicker>Next step</EmailKicker>
      <Heading
        as="h2"
        style={{
          margin: "8px 0 0",
          color: "#172033",
          fontSize: "20px",
          lineHeight: 1.25,
        }}
      >
        Complete Your Payment
      </Heading>
      <Text
        className="email-main-copy"
        style={{
          margin: "9px 0 0",
          color: "#334155",
          fontSize: "14px",
          lineHeight: 1.6,
        }}
      >
        {hasFixedAmount
          ? `Please complete your payment of ${formatCurrency(amountMinor, currency)} for ${eventName} using the link below.`
          : `Please complete your payment for ${eventName} using the link below. You can pay any amount that covers your booking.`}
      </Text>
      <Section style={{ marginTop: "14px" }}>
        <EmailButton href={tikkieUrl}>Pay Now</EmailButton>
      </Section>
    </EmailCard>
  )
}
