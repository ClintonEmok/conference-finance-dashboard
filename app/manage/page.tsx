import { TrackPaymentView } from "@/components/track-payment/TrackPaymentView"

/**
 * Canonical manage-booking search entry point. A successful search navigates
 * to the durable permalink `/manage/[bookingRef]`; legacy `/track-payment`
 * root links and old root deep links redirect here.
 */
export default function ManageBookingPage() {
  return <TrackPaymentView />
}
