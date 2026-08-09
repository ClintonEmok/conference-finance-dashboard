import { TrackPaymentView } from "@/components/track-payment/TrackPaymentView"

/**
 * Canonical booking-reference search entry point. A successful search
 * navigates to the durable permalink `/booking/[bookingRef]/manage`; legacy
 * `/manage` and `/track-payment` roots redirect here, and old root deep links
 * resolve through the same redirect chain.
 */
export default function BookingSearchPage() {
  return <TrackPaymentView />
}
