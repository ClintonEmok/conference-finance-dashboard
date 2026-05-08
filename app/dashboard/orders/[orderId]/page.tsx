import { redirect } from "next/navigation"

type PageProps = {
  params: Promise<{ orderId: string }>
}

export default async function OrderDetailPage({ params }: PageProps) {
  const { orderId } = await params
  redirect(`/dashboard/manage-orders/${orderId}`)
}
