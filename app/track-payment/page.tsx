import { TrackPaymentView } from "@/components/track-payment/TrackPaymentView"

/**
 * Root booking-reference search entry point for the track-payment surface.
 * A successful search navigates to the durable permalink
 * `/track-payment/[bookingRef]`; existing root links and old root deep links
 * keep working through this compatibility surface.
 */
export default function TrackPaymentPage() {
  return <TrackPaymentView />
}
