import { redirect } from "next/navigation"
import { normalizeBookingRefForEdit } from "@/lib/domain/track-payment/edit-token"

/**
 * Legacy permalink compatibility redirect: the canonical durable
 * manage-booking permalink now lives at `/booking/[bookingRef]/manage`. The
 * booking reference is normalized here exactly as the canonical page
 * normalizes it, and the complete incoming query string (including `?token=`)
 * is forwarded so existing confirmation email links keep working. This page
 * redirect stays separate from the edit API route
 * (`/api/track-payment/[bookingRef]`), which is unchanged.
 */
export default async function ManageBookingPermalinkPage({
  params,
  searchParams,
}: {
  params: Promise<{ bookingRef: string }>
  searchParams: Promise<Record<string, string | string[] | undefined>>
}) {
  const { bookingRef: rawBookingRef } = await params
  const paramsRecord = await searchParams
  const bookingRef = normalizeBookingRefForEdit(rawBookingRef)
  redirect(
    `/booking/${encodeURIComponent(bookingRef)}/manage${buildQueryString(paramsRecord)}`
  )
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
