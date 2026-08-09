import { redirect } from "next/navigation"

interface RedirectPageProps {
  params: Promise<{ "event-slug": string }>
}

export default async function AccommodationEventRedirect({
  params,
}: RedirectPageProps) {
  const { "event-slug": eventSlug } = await params
  redirect(`/dashboard/events/${eventSlug}/accommodation/workspace`)
}
