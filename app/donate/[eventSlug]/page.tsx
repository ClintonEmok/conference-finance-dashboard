import { notFound } from "next/navigation"
import Link from "next/link"
import Image from "next/image"
import { api } from "@/convex/_generated/api"
import { fetchQuery } from "convex/nextjs"
import { Calendar, Heart } from "lucide-react"
import { Button } from "@/components/ui/button"
import { DonationTikkieSection } from "@/components/donate/DonationTikkieSection"

export const dynamic = "force-dynamic"
export const revalidate = 0

interface DonatePageProps {
  params: Promise<{ eventSlug: string }>
}

function formatDateTime(value: number): string {
  return new Intl.DateTimeFormat("en-GB", {
    dateStyle: "full",
    timeStyle: "short",
  }).format(new Date(value))
}

export default async function DonatePage({ params }: DonatePageProps) {
  const { eventSlug } = await params

  const event = await fetchQuery(api.events.getEventBySlug, { slug: eventSlug })

  // `getEventBySlug` is shared with the operator dashboard, which must see
  // drafts, so the public gate lives here. `isPublished` only — a published
  // event whose signup has closed must still accept donations.
  if (!event || !event.isPublished) {
    notFound()
  }

  const donationData = await fetchQuery(api.tikkie.getEventDonationLink, {
    eventId: event._id,
  })

  const formattedDate = formatDateTime(event.startsAt)

  return (
    <div className="min-h-svh bg-gradient-to-b from-background via-primary/[0.02] to-background">
      <main className="container mx-auto px-4 py-8 md:py-16">
        <div className="mx-auto mb-12 max-w-5xl text-center">
          <div className="mb-6 inline-flex items-center gap-2 rounded-full border border-primary/20 bg-primary/5 px-4 py-1.5 text-[11px] font-black tracking-[0.15em] text-primary uppercase">
            <Calendar className="h-3.5 w-3.5" />
            {formattedDate}
          </div>
          <h1 className="text-4xl font-black tracking-tight text-foreground sm:text-5xl lg:text-6xl">
            {event.title}
          </h1>
        </div>

        <div className="mx-auto max-w-5xl">
          {donationData ? (
            <div className="overflow-hidden rounded-3xl border border-border/50 bg-card/60 shadow-2xl ring-1 ring-white/5 backdrop-blur-2xl">
              <DonationTikkieSection
                tikkieUrl={donationData.paymentUrl}
                eventName={event.title}
                amountMinor={donationData.amountMinor ?? 0}
                currency={event.currency}
              />
            </div>
          ) : (
            <div className="overflow-hidden rounded-3xl border border-border/50 bg-card/60 shadow-2xl ring-1 ring-white/5 backdrop-blur-2xl">
              <div className="flex flex-col items-center gap-6 px-6 py-16 text-center sm:px-10">
                <div className="flex h-20 w-20 items-center justify-center rounded-full bg-primary/10 text-primary ring-1 ring-primary/20">
                  <Heart className="h-10 w-10" />
                </div>
                <div className="space-y-3">
                  <h2 className="text-2xl font-black tracking-tight text-foreground">
                    Online donations unavailable
                  </h2>
                  <p className="mx-auto max-w-md text-sm leading-relaxed text-muted-foreground">
                    {event.title} is not accepting online donations right now.
                    Please check back later or contact the organizers.
                  </p>
                </div>
                <div className="flex flex-col gap-3 sm:flex-row">
                  <Button asChild size="lg" className="h-12 rounded-xl">
                    <Link href={`/events/${eventSlug}`}>View Event Details</Link>
                  </Button>
                  <Button
                    asChild
                    variant="outline"
                    size="lg"
                    className="h-12 rounded-xl"
                  >
                    <Link href="/">Browse Events</Link>
                  </Button>
                </div>
              </div>
            </div>
          )}
        </div>

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
