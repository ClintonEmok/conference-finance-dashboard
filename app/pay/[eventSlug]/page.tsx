import { notFound } from "next/navigation"
import Link from "next/link"
import Image from "next/image"
import { api } from "@/convex/_generated/api"
import { fetchQuery } from "convex/nextjs"
import { Calendar, ExternalLink, Search, Ticket } from "lucide-react"
import { Button } from "@/components/ui/button"
import { TikkieSection } from "@/components/signup/SuccessPage/TikkieSection"

export const dynamic = "force-dynamic"
export const revalidate = 0

interface PayPageProps {
  params: Promise<{ eventSlug: string }>
}

function formatDateTime(value: number): string {
  return new Intl.DateTimeFormat("en-GB", {
    dateStyle: "full",
    timeStyle: "short",
  }).format(new Date(value))
}

export default async function PayPage({ params }: PayPageProps) {
  const { eventSlug } = await params

  const event = await fetchQuery(api.events.getEventBySlug, { slug: eventSlug })

  if (!event) {
    notFound()
  }

  const paymentData = await fetchQuery(api.tikkie.getEventPaymentLinkForSuccess, {
    eventId: event._id,
  })

  if (!paymentData) {
    return (
      <div className="flex min-h-svh items-center justify-center bg-[radial-gradient(ellipse_at_top,rgba(113,84,255,0.08),transparent_50%)]">
        <div className="mx-auto max-w-md px-4 text-center">
          <div className="mb-8 inline-flex h-20 w-20 items-center justify-center rounded-full bg-destructive/10 text-destructive ring-1 ring-destructive/20">
            <Ticket className="h-10 w-10" />
          </div>
          <h1 className="mb-3 text-4xl font-black tracking-tight text-foreground">
            No payment link found
          </h1>
          <p className="mb-8 text-sm text-muted-foreground">
            This event may not be open for payments yet, or the payment link has
            expired.
          </p>
          <div className="flex flex-col gap-3">
            <Button asChild size="lg" className="h-12 rounded-xl">
              <Link href={`/events/${eventSlug}`}>View Event Details</Link>
            </Button>
            <Button asChild variant="outline" size="lg" className="h-12 rounded-xl">
              <Link href="/">Browse Events</Link>
            </Button>
          </div>
        </div>
      </div>
    )
  }

  const formattedDate = formatDateTime(event.startsAt)
  const today = new Date()
  const eventDate = new Date(event.startsAt)
  const daysUntil = Math.ceil(
    (eventDate.getTime() - today.getTime()) / (1000 * 60 * 60 * 24)
  )

  return (
    <div className="min-h-svh bg-gradient-to-b from-background via-primary/[0.02] to-background">
      <main className="container mx-auto px-4 py-8 md:py-16">
        {/* Compact Event Header */}
        <div className="mx-auto mb-12 max-w-5xl text-center">
          <div className="mb-6 inline-flex items-center gap-2 rounded-full border border-primary/20 bg-primary/5 px-4 py-1.5 text-[11px] font-black tracking-[0.15em] text-primary uppercase">
            <Calendar className="h-3.5 w-3.5" />
            {formattedDate}
          </div>
          <h1 className="text-4xl font-black tracking-tight text-foreground sm:text-5xl lg:text-6xl">
            {event.title}
          </h1>
          {daysUntil > 0 && daysUntil <= 14 && (
            <p className="mt-3 text-sm font-semibold text-primary/80">
              {daysUntil === 1
                ? "Happening tomorrow!"
                : `Happening in ${daysUntil} days!`}
            </p>
          )}
        </div>

        {/* Payment Card - Full Width Treatment */}
        <div className="mx-auto max-w-5xl">
          <div className="overflow-hidden rounded-3xl border border-border/50 bg-card/60 shadow-2xl ring-1 ring-white/5 backdrop-blur-2xl">
              <TikkieSection
                tikkieUrl={paymentData.paymentUrl}
              eventName={event.title}
            />
          </div>
        </div>

        {/* Quick Actions */}
        <div className="mx-auto mt-12 grid max-w-5xl gap-4 sm:grid-cols-2">
          <Link
            href={`/signup/${eventSlug}`}
            className="group flex items-center gap-4 rounded-2xl border border-border/40 bg-card/40 p-5 shadow-sm backdrop-blur-xl transition-all hover:border-primary/30 hover:bg-card/60 hover:shadow-md"
          >
            <div className="flex h-12 w-12 shrink-0 items-center justify-center rounded-xl bg-primary/10 text-primary ring-1 ring-primary/20 transition-all group-hover:bg-primary/15">
              <Ticket className="h-5 w-5" />
            </div>
            <div className="flex-1">
              <p className="text-sm font-bold text-foreground">Register</p>
              <p className="mt-0.5 text-xs text-muted-foreground">
                Not a registrant yet?
              </p>
            </div>
            <ExternalLink className="h-4 w-4 shrink-0 text-muted-foreground transition-all group-hover:text-primary group-hover:translate-x-0.5" />
          </Link>

          <Link
            href="/booking"
            className="group flex items-center gap-4 rounded-2xl border border-border/40 bg-card/40 p-5 shadow-sm backdrop-blur-xl transition-all hover:border-primary/30 hover:bg-card/60 hover:shadow-md"
          >
            <div className="flex h-12 w-12 shrink-0 items-center justify-center rounded-xl bg-primary/10 text-primary ring-1 ring-primary/20 transition-all group-hover:bg-primary/15">
              <Search className="h-5 w-5" />
            </div>
            <div className="flex-1">
              <p className="text-sm font-bold text-foreground">Manage booking</p>
              <p className="mt-0.5 text-xs text-muted-foreground">
                Already registered?
              </p>
            </div>
            <ExternalLink className="h-4 w-4 shrink-0 text-muted-foreground transition-all group-hover:text-primary group-hover:translate-x-0.5" />
          </Link>
        </div>

        {/* Footer */}
        <footer className="mx-auto mt-20 max-w-5xl border-t border-border/30 pt-12">
          <div className="flex flex-col items-center gap-4 text-center">
            <Image
              src="/dlbc-logo.png"
              alt="Logo"
              width={32}
              height={32}
              className="object-contain opacity-30 grayscale transition-all hover:opacity-50 hover:grayscale-0"
            />
            <p className="text-[10px] font-black tracking-[0.2em] text-muted-foreground/30 uppercase">
              Powered by DCLM Netherlands &copy; 2026
            </p>
          </div>
        </footer>
      </main>
    </div>
  )
}
