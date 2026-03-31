import { notFound } from "next/navigation"
import { api } from "@/convex/_generated/api"
import { fetchQuery } from "convex/nextjs"
import { SuccessView } from "@/components/signup/SuccessPage/SuccessView"

interface SuccessPageProps {
  params: Promise<{ bookingRef: string }>
}

export default async function SignupSuccessPage({ params }: SuccessPageProps) {
  const { bookingRef } = await params

  try {
    // Fetch submission data by booking reference
    const submission = await fetchQuery(api.signupSubmission.getByBookingRef, {
      bookingRef,
    })

    if (!submission) {
      notFound()
    }

    // Fetch event details by slug
    if (!submission.eventSlug) {
      notFound()
    }
    const eventData = await fetchQuery(api.events.getEventBySlug, {
      slug: submission.eventSlug,
    })

    if (!eventData) {
      notFound()
    }

    // Fetch Tikkie payment link for this event
    if (!submission.eventId) {
      notFound()
    }
    const tikkieLink = await fetchQuery(
      api.tikkie.getEventPaymentLinkForSuccess,
      { eventId: submission.eventId }
    )

    return (
      <main className="min-h-screen bg-background py-8">
        <SuccessView
          submission={{
            bookingRef: submission.bookingRef,
            bookerName: submission.bookerName,
            bookerEmail: submission.bookerEmail,
            bookerPhone: submission.bookerPhone,
            submittedAt: submission.submittedAt,
            attendees: submission.attendees,
            roomAssignments: submission.roomAssignments,
            totalAmountMinor: submission.totalAmountMinor,
            ticketSelections: submission.ticketSelections,
          }}
          event={{
            name: eventData.title,
            startsAt: eventData.startsAt,
            location: undefined, // Events don't have location yet
            description: undefined,
          }}
          tikkieUrl={tikkieLink?.paymentUrl ?? null}
        />
      </main>
    )
  } catch (error) {
    console.error("Error loading success page:", error)
    throw error
  }
}

// Static params - dynamic only, no pre-rendering
export async function generateStaticParams() {
  return []
}
