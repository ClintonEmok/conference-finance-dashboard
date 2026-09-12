import {
  Body,
  Button,
  Column,
  Container,
  Head,
  Heading,
  Html,
  Img,
  Preview,
  Row,
  Section,
  Text,
} from "@react-email/components"
import type { CSSProperties, ReactNode } from "react"

const logoUrl = `${process.env.NEXT_PUBLIC_SITE_URL ?? "http://localhost:3000"}/dlbc-logo.png`

const sharedStyles = `
  :root { color-scheme: light; }
  @media (prefers-color-scheme: dark) {
    .email-body { background-color: #11131a !important; }
    .email-container { background-color: #1c1f29 !important; border-color: #343947 !important; }
    .email-header { background-color: #11131a !important; }
    .email-header-copy, .email-main-copy { color: #d9dfec !important; }
    .email-card { background-color: #282d3d !important; border-color: #454c5e !important; }
    .email-card-accent { background-color: #30304a !important; border-color: #7775f2 !important; }
    .email-callout { background-color: #282d3d !important; border-color: #7775f2 !important; color: #edf0ff !important; }
    .email-label, .email-kicker { color: #aeb5ff !important; }
    .email-value, .email-card h2, .email-card p { color: #f8faff !important; }
    .email-muted, .email-footer-copy { color: #aeb8c8 !important; }
    .email-divider, .email-footer { border-color: #343947 !important; }
    .email-button-primary { background-color: #5b57e8 !important; color: #ffffff !important; }
    .email-button-secondary { background-color: #282d3d !important; border-color: #8985f4 !important; color: #e5e7ff !important; }
    .email-metric-card { background-color: #242834 !important; border-color: #454c5e !important; }
    .email-metric-outstanding { background-color: #30304a !important; border-color: #7775f2 !important; }
  }
  @media only screen and (max-width: 600px) {
    .email-body { padding: 16px 8px !important; }
    .email-header, .email-header h1, .email-header p,
    .email-container p, .email-container h1 { text-align: center !important; }
    .email-header img { margin-left: auto !important; margin-right: auto !important; }
    .email-content { padding-left: 20px !important; padding-right: 20px !important; }
    .email-option-card { padding-left: 14px !important; padding-right: 14px !important; }
  }
`

const bodyStyle: CSSProperties = {
  margin: 0,
  padding: "24px 16px",
  backgroundColor: "#f4f5f7",
  fontFamily:
    'Inter, ui-sans-serif, system-ui, -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif',
}

const containerStyle: CSSProperties = {
  maxWidth: "600px",
  margin: "0 auto",
  backgroundColor: "#ffffff",
  border: "1px solid #e2e5ed",
  borderRadius: "18px",
  overflow: "hidden",
}

export function EmailLayout({
  preview,
  children,
}: {
  preview: string
  children: ReactNode
}) {
  return (
    <Html lang="en">
      <Head>
        <style>{sharedStyles}</style>
      </Head>
      <Preview>{preview}</Preview>
      <Body className="email-body" style={bodyStyle}>
        <Container className="email-container" style={containerStyle}>
          {children}
        </Container>
      </Body>
    </Html>
  )
}

export function EmailHeader({
  eyebrow = "DCLM NL Conference",
  title,
  intro,
}: {
  eyebrow?: string
  title: string
  intro?: ReactNode
}) {
  return (
    <Section
      className="email-header"
      style={{
        backgroundColor: "#111525",
        padding: "26px 28px 28px",
        borderBottom: "4px solid #7167e8",
      }}
    >
      <Img
        src={logoUrl}
        alt="DCLM NL Conference logo"
        width="54"
        height="54"
        style={{
          display: "block",
          width: "54px",
          height: "54px",
          borderRadius: "16px",
          marginBottom: "18px",
        }}
      />
      <Text
        className="email-kicker"
        style={{
          margin: 0,
          color: "#b8b4ff",
          fontSize: "11px",
          fontWeight: 700,
          letterSpacing: "0.14em",
          lineHeight: "16px",
          textTransform: "uppercase",
        }}
      >
        {eyebrow}
      </Text>
      <Heading
        as="h1"
        style={{
          margin: "10px 0 0",
          color: "#ffffff",
          fontSize: "30px",
          lineHeight: "36px",
          letterSpacing: "-0.02em",
        }}
      >
        {title}
      </Heading>
      {intro ? (
        <Text
          className="email-header-copy"
          style={{
            margin: "12px 0 0",
            color: "#c6ccda",
            fontSize: "15px",
            lineHeight: 1.55,
          }}
        >
          {intro}
        </Text>
      ) : null}
    </Section>
  )
}

export function EmailContent({
  children,
  style,
}: {
  children: ReactNode
  style?: CSSProperties
}) {
  return (
    <Section
      className="email-content"
      style={{ padding: "24px 28px 0", ...style }}
    >
      {children}
    </Section>
  )
}

export function EmailCard({
  children,
  accent = false,
  className = "",
  style,
}: {
  children: ReactNode
  accent?: boolean
  className?: string
  style?: CSSProperties
}) {
  return (
    <Section
      className={`email-card${accent ? "email-card-accent" : ""}${className ? ` ${className}` : ""}`}
      style={{
        margin: 0,
        padding: "18px 20px",
        backgroundColor: accent ? "#f0f1ff" : "#f7f8fb",
        border: accent ? "1px solid #c7c8f6" : "1px solid #e2e5ed",
        borderRadius: "14px",
        ...style,
      }}
    >
      {children}
    </Section>
  )
}

export function EmailKicker({ children }: { children: ReactNode }) {
  return (
    <Text
      className="email-label"
      style={{
        margin: 0,
        color: "#5b57e8",
        fontSize: "11px",
        fontWeight: 700,
        letterSpacing: "0.12em",
        lineHeight: "16px",
        textTransform: "uppercase",
      }}
    >
      {children}
    </Text>
  )
}

export function EmailButton({
  href,
  children,
  variant = "primary",
}: {
  href: string
  children: ReactNode
  variant?: "primary" | "secondary"
}) {
  const primary = variant === "primary"
  return (
    <Button
      className={`email-button-${variant}`}
      href={href}
      style={{
        display: "block",
        width: "100%",
        boxSizing: "border-box",
        padding: "13px 20px",
        backgroundColor: primary ? "#4f46e5" : "#f8f9ff",
        border: primary ? "1px solid #4f46e5" : "1px solid #a5b4fc",
        color: primary ? "#ffffff" : "#4338ca",
        borderRadius: "10px",
        textAlign: "center",
        textDecoration: "none",
        fontSize: "14px",
        fontWeight: 700,
        lineHeight: "20px",
      }}
    >
      {children}
    </Button>
  )
}

export function EmailFooter({
  children = "This email was sent by DCLM NL Conference.",
}: {
  children?: ReactNode
}) {
  return (
    <Section
      className="email-footer"
      style={{
        padding: "24px 28px 28px",
        marginTop: "24px",
        borderTop: "1px solid #e2e5ed",
      }}
    >
      <Text
        className="email-footer-copy"
        style={{
          margin: 0,
          color: "#8a94a6",
          fontSize: "12px",
          lineHeight: 1.55,
        }}
      >
        {children}
      </Text>
    </Section>
  )
}

export function EmailBookingReference({ bookingRef }: { bookingRef: string }) {
  return (
    <EmailCard
      accent
      className="email-booking-ref"
      style={{ textAlign: "center" }}
    >
      <EmailKicker>Booking reference</EmailKicker>
      <Text
        className="email-value"
        style={{
          margin: "7px 0 0",
          color: "#29256f",
          fontFamily: "ui-monospace, SFMono-Regular, Menlo, monospace",
          fontSize: "25px",
          fontWeight: 700,
          letterSpacing: "0.04em",
          lineHeight: 1.2,
          wordBreak: "break-all",
        }}
      >
        {bookingRef}
      </Text>
      <Text
        className="email-muted"
        style={{ margin: "7px 0 0", color: "#64748b", fontSize: "12px" }}
      >
        Keep this reference handy when managing your booking.
      </Text>
    </EmailCard>
  )
}

export function EmailOptionCard({
  number,
  title,
  children,
}: {
  number: string
  title: string
  children: ReactNode
}) {
  return (
    <Section
      className="email-card email-option-card"
      style={{
        margin: "10px 0 0",
        padding: "14px 16px",
        backgroundColor: "#f8f9fd",
        border: "1px solid #e2e5ed",
        borderLeft: "4px solid #7167e8",
        borderRadius: "0 12px 12px 0",
      }}
    >
      <Row>
        <Column style={{ width: "34px", verticalAlign: "top" }}>
          <Text
            style={{
              width: "26px",
              height: "26px",
              margin: 0,
              backgroundColor: "#e8e7ff",
              borderRadius: "50%",
              color: "#4f46e5",
              fontSize: "12px",
              fontWeight: 700,
              lineHeight: "26px",
              textAlign: "center",
            }}
          >
            {number}
          </Text>
        </Column>
        <Column style={{ verticalAlign: "top" }}>
          <Text
            className="email-value"
            style={{
              margin: 0,
              color: "#172033",
              fontSize: "14px",
              fontWeight: 700,
            }}
          >
            {title}
          </Text>
          <Text
            className="email-muted"
            style={{
              margin: "4px 0 0",
              color: "#536174",
              fontSize: "13px",
              lineHeight: 1.5,
            }}
          >
            {children}
          </Text>
        </Column>
      </Row>
    </Section>
  )
}

export function EmailMetricSummary({
  amountDueMinor,
  paidAmountMinor,
  outstandingAmountMinor,
  currency,
}: {
  amountDueMinor: number
  paidAmountMinor: number
  outstandingAmountMinor: number
  currency: string
}) {
  const money = (minor: number) =>
    new Intl.NumberFormat("en-GB", {
      style: "currency",
      currency,
    }).format(minor / 100)

  const metrics = [
    { label: "Amount due", value: money(amountDueMinor), outstanding: false },
    { label: "Paid", value: money(paidAmountMinor), outstanding: false },
    {
      label: "Outstanding",
      value: money(outstandingAmountMinor),
      outstanding: true,
    },
  ]

  return (
    <EmailCard className="email-metric-summary">
      <EmailKicker>Payment snapshot</EmailKicker>
      <Row style={{ marginTop: "12px" }}>
        {metrics.map((metric, index) => (
          <Column
            key={metric.label}
            style={{
              width: "33.33%",
              paddingRight: index === metrics.length - 1 ? 0 : "6px",
              verticalAlign: "top",
            }}
          >
            <Section
              className={
                metric.outstanding
                  ? "email-metric-card email-metric-outstanding"
                  : "email-metric-card"
              }
              style={{
                minHeight: "64px",
                padding: "10px 9px",
                backgroundColor: metric.outstanding ? "#eeedff" : "#ffffff",
                border: metric.outstanding
                  ? "1px solid #c7c8f6"
                  : "1px solid #e2e5ed",
                borderRadius: "10px",
              }}
            >
              <Text
                className="email-muted"
                style={{
                  margin: 0,
                  color: "#718096",
                  fontSize: "10px",
                  lineHeight: 1.3,
                }}
              >
                {metric.label}
              </Text>
              <Text
                className="email-value"
                style={{
                  margin: "6px 0 0",
                  color: metric.outstanding ? "#312e81" : "#172033",
                  fontSize: "15px",
                  fontWeight: 700,
                  lineHeight: 1.2,
                }}
              >
                {metric.value}
              </Text>
            </Section>
          </Column>
        ))}
      </Row>
    </EmailCard>
  )
}
