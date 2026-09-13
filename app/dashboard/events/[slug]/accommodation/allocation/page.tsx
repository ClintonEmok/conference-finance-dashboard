import { AccommodationAllocationPage } from "@/components/dashboard/accommodation/allocation-page"

export default async function EventAllocationPage({ params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params
  return <AccommodationAllocationPage slug={slug} />
}
