import { redirect } from "next/navigation"

/**
 * Legacy root track-payment compatibility redirect: the canonical
 * buyer-facing manage-booking surface now lives at `/booking`. The complete
 * incoming query string is forwarded so existing confirmation links and
 * arbitrary future query parameters survive the move. This page redirect
 * stays separate from the edit API route
 * (`/api/track-payment/[bookingRef]`), which is unchanged.
 */
export default async function TrackPaymentPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>
}) {
  const params = await searchParams
  redirect(`/booking${buildQueryString(params)}`)
}

/**
 * Re-serialize the already-decoded App Router search params into a query
 * string so the full incoming query (token, tracking tags, anything else)
 * survives the redirect unchanged.
 */
function buildQueryString(
  searchParams: Record<string, string | string[] | undefined>
): string {
  const query = new URLSearchParams()
  for (const [key, value] of Object.entries(searchParams)) {
    if (value === undefined) continue
    if (Array.isArray(value)) {
      for (const item of value) query.append(key, item)
    } else {
      query.append(key, value)
    }
  }
  const serialized = query.toString()
  return serialized ? `?${serialized}` : ""
}
