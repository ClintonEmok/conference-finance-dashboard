import Link from "next/link"
import Image from "next/image"
import { render } from "@react-email/render"

import { requirePageUser } from "@/lib/auth/server"
import { formatMoney } from "@/lib/format"
import SignupConfirmationEmail from "@/lib/email/templates/signup-confirmation"
import { Button } from "@/components/ui/button"
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card"

const sampleProps = {
  bookerName: "Jordan Williams",
  bookingRef: "CFD-84X2M9",
  eventName: "Conference Finance Summit 2026",
  eventDate: "18 July 2026",
  eventLocation: "Amsterdam Conference Center",
  tikkieUrl: "https://example.com/pay/preview",
  tikkieAmountMinor: 42900,
  tikkieCurrency: "EUR",
  attendeeCount: 3,
  trackPaymentUrl: "http://localhost:3000/track-payment",
  successPageUrl: "http://localhost:3000/signup/success/CFD-84X2M9",
}

export default async function EmailPreviewPage() {
  await requirePageUser("/dashboard/email-preview")

  const html = await render(SignupConfirmationEmail(sampleProps))

  return (
    <section className="space-y-6">
      <div className="flex flex-wrap items-center gap-4 rounded-2xl border border-border/70 bg-card p-4 shadow-sm">
        <div className="relative size-14 overflow-hidden rounded-2xl border border-border/70 bg-background">
          <Image
            src="/dlbc-logo.png"
            alt="DCLM NL Conference logo"
            fill
            sizes="56px"
            className="object-contain p-1.5"
          />
        </div>
        <div className="space-y-1">
          <p className="text-sm font-medium tracking-[0.18em] text-muted-foreground uppercase">
            Email Preview
          </p>
          <h1 className="text-2xl font-semibold tracking-tight">
            Signup confirmation
          </h1>
          <p className="max-w-2xl text-sm text-muted-foreground">
            Preview the styled confirmation email exactly as it will be rendered
            for new signups.
          </p>
        </div>
      </div>

      <div className="grid gap-6 xl:grid-cols-[minmax(0,1.6fr)_minmax(320px,0.8fr)]">
        <Card className="overflow-hidden border-border/70 shadow-sm">
          <CardHeader className="border-b border-border/70 bg-muted/20">
            <CardTitle className="text-base">Rendered email</CardTitle>
            <CardDescription>
              Live HTML preview using the React Email template.
            </CardDescription>
          </CardHeader>
          <CardContent className="p-0">
            <iframe
              title="Signup confirmation email preview"
              srcDoc={html}
              className="h-[1100px] w-full bg-white"
            />
          </CardContent>
        </Card>

        <div className="space-y-4">
          <Card className="border-border/70 shadow-sm">
            <CardHeader>
              <CardTitle className="text-base">Preview data</CardTitle>
              <CardDescription>
                Sample values used to render the email.
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-3 text-sm">
              <div className="flex items-center justify-between gap-4 rounded-lg border border-border/70 bg-card p-3">
                <span className="text-muted-foreground">Booking reference</span>
                <span className="font-mono text-xs font-semibold">
                  {sampleProps.bookingRef}
                </span>
              </div>
              <div className="flex items-center justify-between gap-4 rounded-lg border border-border/70 bg-card p-3">
                <span className="text-muted-foreground">Track payment</span>
                <span className="truncate font-mono text-xs">
                  /track-payment
                </span>
              </div>
              <div className="flex items-center justify-between gap-4 rounded-lg border border-border/70 bg-card p-3">
                <span className="text-muted-foreground">Payment total</span>
                <span className="font-semibold">
                  {formatMoney(sampleProps.tikkieAmountMinor ?? 0)}
                </span>
              </div>
            </CardContent>
          </Card>

          <Card className="border-border/70 shadow-sm">
            <CardHeader>
              <CardTitle className="text-base">Access</CardTitle>
              <CardDescription>
                Jump back to the integration tools or open the tracker.
              </CardDescription>
            </CardHeader>
            <CardContent className="flex flex-wrap gap-3">
              <Button asChild variant="default">
                <Link href="/dashboard/integrations">Integrations</Link>
              </Button>
              <Button asChild variant="outline">
                <Link href="/track-payment">Track payment</Link>
              </Button>
            </CardContent>
          </Card>
        </div>
      </div>
    </section>
  )
}
