import { TrackPaymentView } from "@/components/track-payment/TrackPaymentView"
import { normalizeBookingRefForEdit } from "@/lib/domain/track-payment/edit-token"

export const dynamic = "force-dynamic"

/**
 * Durable booking-reference permalink. Supplies the initial booking reference
 * (and any edit token from the confirmation email link) to the shared
 * server-backed tracking view. The page itself is a thin wrapper — it never
 * renders a second shell, search UI, or any client money authority. The
 * reference is normalized here so a lower/mixed-case permalink URL resolves
 * to the same order as the canonical uppercase reference (CR-07).
 */
export default async function TrackPaymentPermalinkPage({
  params,
  searchParams,
}: {
  params: Promise<{ bookingRef: string }>
  searchParams: Promise<{ token?: string }>
}) {
  const { bookingRef: rawBookingRef } = await params
  const { token } = await searchParams
  const bookingRef = normalizeBookingRefForEdit(rawBookingRef)
  return (
    <TrackPaymentView initialBookingRef={bookingRef} initialEditToken={token} />
  )
}
