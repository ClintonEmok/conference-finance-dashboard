import { TrackPaymentView } from "@/components/track-payment/TrackPaymentView"

export const dynamic = "force-dynamic"

/**
 * Durable booking-reference permalink. Supplies the initial booking reference
 * (and any edit token from the confirmation email link) to the shared
 * server-backed tracking view. The page itself is a thin wrapper — it never
 * renders a second shell, search UI, or any client money authority.
 */
export default async function TrackPaymentPermalinkPage({
  params,
  searchParams,
}: {
  params: Promise<{ bookingRef: string }>
  searchParams: Promise<{ token?: string }>
}) {
  const { bookingRef } = await params
  const { token } = await searchParams
  return (
    <TrackPaymentView initialBookingRef={bookingRef} initialEditToken={token} />
  )
}
