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
          :root { color-scheme: light; }
          @media (prefers-color-scheme: dark) {
            .email-body { background-color: #252225 !important; }
            .email-container { background-color: #302b30 !important; border-color: rgba(255,255,255,.1) !important; }
            .email-header { background-color: #1f1c1f !important; }
            .email-panel { background-color: #302b30 !important; border-color: #6356d9 !important; }
            .email-panel p, .email-panel strong { color: #fafafa !important; }
            .email-callout { background-color: #3d3540 !important; border-color: #6356d9 !important; color: #e7e2ff !important; }
            .email-button-primary { background-color: #5146c7 !important; color: #ffffff !important; }
            .email-button-secondary { border-color: #8175e8 !important; color: #c9c2ff !important; }
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
            backgroundColor: "#ffffff",
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
            <Text style={{ margin: 0, color: "#475569", fontSize: "14px" }}>
              Keep this information handy for registration, payment, and
              accommodation updates.
            </Text>
          </Section>

          <Section style={{ padding: "16px 28px 0" }}>
            <Section
              className="email-panel"
              style={{
                backgroundColor: "#eef2ff",
                padding: "20px 28px",
                margin: 0,
                borderRadius: "14px",
                border: "1px solid #c7d2fe",
              }}
            >
            <Text
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
              style={{
                margin: 0,
                color: "#312e81",
                fontSize: "18px",
                fontWeight: 700,
              }}
            >
              {eventName}
            </Text>
            <Text
              style={{
                margin: "10px 0 0",
                color: "#334155",
                fontSize: "14px",
              }}
            >
              <strong>Date:</strong> {eventDate}
            </Text>
            </Section>
          </Section>

          {nightBeforeNote && (
            <Text
              style={{
                margin: "24px 28px 0",
                padding: "16px 18px",
                color: "#334155",
                backgroundColor: "#eff6ff",
                border: "1px solid #bfdbfe",
                borderRadius: "12px",
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
                margin: "24px 28px 0",
                padding: 0,
              }}
            >
              <Text
                style={{
                  margin: "0 0 12px",
                  fontSize: "14px",
                  lineHeight: 1.6,
                  color: "#334155",
                }}
              >
                Payments are handled separately via Tikkie.
              </Text>
              <Button
                className="email-button-primary"
                href={paymentUrl}
                style={{
                  backgroundColor: "#0f172a",
                  color: "#ffffff",
                  padding: "12px 20px",
                  textDecoration: "none",
                  borderRadius: "10px",
                  display: "block",
                  margin: "4px 8px 0",
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
              margin: "24px 28px 0",
              padding: 0,
            }}
          >
            <Text
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
                backgroundColor: "#2563eb",
                color: "#ffffff",
                padding: "12px 20px",
                textDecoration: "none",
                borderRadius: "10px",
                display: "block",
                margin: "4px 8px 0",
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
              margin: "24px 28px 0",
              padding: 0,
            }}
          >
            <Text
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
                border: "1px solid #2563eb",
                color: "#2563eb",
                padding: "11px 20px",
                textDecoration: "none",
                borderRadius: "10px",
                display: "block",
                margin: "4px 8px 0",
                textAlign: "center",
                fontSize: "14px",
                fontWeight: 600,
              }}
            >
              Register for the Conference
            </Button>
          </Section>

          <Section
            style={{
              padding: "24px 28px 28px",
              marginTop: "24px",
              borderTop: "1px solid #e5e7eb",
            }}
          >
            <Text
              style={{
                fontSize: "12px",
                lineHeight: 1.5,
                color: "#9ca3af",
                margin: 0,
              }}
            >
              This email was sent by DCLM NL Conference. If you have any
              questions, please contact the event organizers.
            </Text>
          </Section>
        </Container>
      </Body>
    </Html>
  )
}
