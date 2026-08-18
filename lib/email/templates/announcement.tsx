import {
  Body,
  Button,
  Container,
  Head,
  Heading,
  Html,
  Img,
  Preview,
  Text,
  Section,
} from "@react-email/components"

const logoUrl = `${process.env.NEXT_PUBLIC_SITE_URL ?? "http://localhost:3000"}/dlbc-logo.png`

export interface AnnouncementEmailProps {
  title: string
  message: string
  eventName: string
  eventDate: string
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
  manageBookingUrl,
  signupUrl,
  paymentUrl,
  nightBeforeNote,
}: AnnouncementEmailProps) {
  return (
    <Html lang="en">
      <Head>
        <style>{`
          :root { color-scheme: light dark; }
          @media (prefers-color-scheme: dark) {
            .email-body { background-color: #11131a !important; }
            .email-container { background-color: #1c1f29 !important; border-color: #343947 !important; }
            .email-header { background-color: #11131a !important; }
            .email-muted, .email-section-copy { color: #c2cada !important; }
            .email-event-details { border-color: #454c5e !important; }
            .email-event-label { color: #aeb5ff !important; }
            .email-event-name { color: #f8faff !important; }
            .email-event-date { color: #d9dfec !important; }
            .email-callout { background-color: #282d3d !important; border-color: #7775f2 !important; color: #edf0ff !important; }
            .email-button-primary { background-color: #5b57e8 !important; color: #ffffff !important; }
            .email-button-secondary { background-color: #282d3d !important; border-color: #8985f4 !important; color: #e5e7ff !important; }
            .email-footer { border-color: #343947 !important; }
            .email-footer-copy { color: #aeb8c8 !important; }
          }
          @media only screen and (max-width: 600px) {
            .email-body { padding: 16px 8px !important; }
            .email-header, .email-header h1, .email-header p,
            .email-container p, .email-container h1 { text-align: center !important; }
            .email-header img { margin-left: auto !important; margin-right: auto !important; }
          }
        `}</style>
      </Head>
      <Preview>{title}</Preview>
      <Body
        className="email-body"
        style={{
          margin: 0,
          padding: "24px 16px",
          fontFamily:
            'Inter, ui-sans-serif, system-ui, -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif',
          backgroundColor: "#ffffff",
        }}
      >
        <Container
          className="email-container"
          style={{
            maxWidth: "600px",
            margin: "0 auto",
            backgroundColor: "#eef1f6",
            padding: 0,
            borderRadius: "16px",
            overflow: "hidden",
            border: "1px solid #e5e7eb",
          }}
        >
          <Section
            className="email-header"
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
              as="h1"
              style={{
                margin: "10px 0 0",
                color: "#ffffff",
                fontSize: "30px",
                lineHeight: "36px",
              }}
            >
              {title}
            </Heading>
            <Text
              style={{
                margin: "10px 0 0",
                color: "#cbd5e1",
                fontSize: "15px",
                lineHeight: 1.5,
              }}
            >
              {message}
            </Text>
          </Section>

          <Section style={{ padding: "24px 28px 8px" }}>
            <Text
              className="email-muted"
              style={{ margin: 0, color: "#475569", fontSize: "14px" }}
            >
              Keep this information handy for registration, payment, and
              accommodation updates.
            </Text>
          </Section>

          <Section style={{ padding: "20px 28px 0" }}>
            <Section
              className="email-event-details"
              style={{
                padding: "16px 0 15px",
                margin: 0,
                borderTop: "1px solid #d9deea",
                borderBottom: "1px solid #d9deea",
              }}
            >
            <Text
              className="email-event-label"
              style={{
                margin: "0 0 10px",
                color: "#6366f1",
                fontSize: "12px",
                textTransform: "uppercase",
                letterSpacing: "0.08em",
              }}
            >
              Event Details
            </Text>
            <Text
              className="email-event-name"
              style={{
                margin: 0,
                color: "#172033",
                fontSize: "18px",
                fontWeight: 700,
              }}
            >
              {eventName}
            </Text>
            <Text
              className="email-event-date"
              style={{
                margin: "10px 0 0",
                color: "#536174",
                fontSize: "14px",
              }}
            >
              <strong>Date:</strong> {eventDate}
            </Text>
            </Section>
          </Section>

          {nightBeforeNote && (
            <Text
              className="email-callout"
              style={{
                margin: "24px 28px 0",
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
          )}

          {paymentUrl && (
            <Section
              style={{
                margin: 0,
                padding: "24px 28px 0",
                textAlign: "center",
              }}
            >
              <Button
                className="email-button-primary"
                href={paymentUrl}
                style={{
                  backgroundColor: "#4f46e5",
                  color: "#ffffff",
                  padding: "13px 20px",
                  textDecoration: "none",
                  borderRadius: "10px",
                  display: "block",
                  width: "100%",
                  boxSizing: "border-box",
                  margin: 0,
                  textAlign: "center",
                  fontSize: "14px",
                  fontWeight: 600,
                }}
              >
                Review Payment
              </Button>
            </Section>
          )}

          <Section
            style={{
              margin: 0,
              padding: "24px 28px 0",
              textAlign: "center",
            }}
          >
            <Text
              className="email-section-copy"
              style={{
                margin: "0 0 12px",
                fontSize: "14px",
                lineHeight: 1.6,
                color: "#334155",
              }}
            >
              Review payment progress and update your accommodation
              preferences.
            </Text>
            <Button
              className="email-button-primary"
              href={manageBookingUrl}
              style={{
                backgroundColor: "#4f46e5",
                color: "#ffffff",
                padding: "13px 20px",
                textDecoration: "none",
                borderRadius: "10px",
                display: "block",
                width: "100%",
                boxSizing: "border-box",
                margin: 0,
                textAlign: "center",
                fontSize: "14px",
                fontWeight: 600,
              }}
            >
              Manage Booking
            </Button>
          </Section>

          <Section
            style={{
              margin: 0,
              padding: "24px 28px 0",
              textAlign: "center",
            }}
          >
            <Text
              className="email-section-copy"
              style={{
                margin: "0 0 12px",
                fontSize: "14px",
                lineHeight: 1.6,
                color: "#6b7280",
              }}
            >
              Not registered yet? Create your booking below.
            </Text>
            <Button
              className="email-button-secondary"
              href={signupUrl}
              style={{
                backgroundColor: "#f8f9ff",
                border: "1px solid #a5b4fc",
                color: "#4338ca",
                padding: "12px 20px",
                textDecoration: "none",
                borderRadius: "10px",
                display: "block",
                width: "100%",
                boxSizing: "border-box",
                margin: 0,
                textAlign: "center",
                fontSize: "14px",
                fontWeight: 600,
              }}
            >
              Register for the Conference
            </Button>
          </Section>

          <Section
            className="email-footer"
            style={{
              padding: "24px 28px 28px",
              marginTop: "24px",
              borderTop: "1px solid #e5e7eb",
            }}
          >
            <Text
              className="email-footer-copy"
              style={{
                fontSize: "12px",
                lineHeight: 1.5,
                color: "#9ca3af",
                margin: 0,
              }}
            >
              This email was sent by DCLM NL Conference. If you have any
              questions, please contact us at it-support@deeperlife.nl.
            </Text>
          </Section>
        </Container>
      </Body>
    </Html>
  )
}
