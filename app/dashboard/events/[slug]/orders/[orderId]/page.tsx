"use client"

import Link from "next/link"
import { use, useMemo } from "react"
import { useQuery } from "convex/react"
import { ArrowLeft, Users } from "lucide-react"

import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { Skeleton } from "@/components/ui/skeleton"
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table"
import { api } from "@/lib/convex/api"
import { useEventBySlug } from "@/lib/convex/hooks/events"
import { formatMoney } from "@/lib/format"
import type { Id } from "@/convex/_generated/dataModel"

type PageProps = {
  params: Promise<{ slug: string; orderId: string }>
}

export default function EventOrderDetailPage({ params }: PageProps) {
  const { slug, orderId } = use(params)
  const event = useEventBySlug(slug)
  const payload = useQuery(api.orders.getOrderWithAttendees, {
    orderId: orderId as Id<"orders">,
  })

  const attendeeTotal = useMemo(() => payload?.attendees.length ?? 0, [payload])

  if (event === undefined || payload === undefined) {
    return <Skeleton className="h-96 w-full rounded-2xl" />
  }

  if (event === null || payload === null) {
    return (
      <div className="rounded-2xl border border-border/50 bg-card/40 p-10 text-center">
        <h1 className="text-2xl font-bold">Order not found</h1>
        <p className="mt-2 text-muted-foreground">The canonical order could not be loaded.</p>
      </div>
    )
  }

  return (
    <div className="space-y-6">
      <Button asChild variant="ghost" className="w-fit px-0 text-muted-foreground hover:text-foreground">
        <Link href={`/dashboard/events/${slug}/orders`}>
          <ArrowLeft className="mr-2 size-4" /> Back to orders
        </Link>
      </Button>

      <Card className="border-border/50 bg-card/40">
        <CardHeader>
          <CardTitle className="flex items-center gap-3 text-2xl">
            <span className="font-mono text-base">{payload.order.id}</span>
            <Badge variant="outline" className="font-mono text-[10px] uppercase">
              {payload.order.normalizedStatus ?? "pending"}
            </Badge>
          </CardTitle>
          <CardDescription>{event.title} · /dashboard/events/{slug}/orders/{orderId}</CardDescription>
        </CardHeader>
        <CardContent className="grid gap-4 sm:grid-cols-3">
          <div>
            <p className="text-[10px] font-bold tracking-widest text-muted-foreground uppercase">Amount Due</p>
            <p className="mt-1 text-2xl font-bold tabular-nums">{formatMoney(payload.order.amountDueMinor ?? 0)}</p>
          </div>
          <div>
            <p className="text-[10px] font-bold tracking-widest text-muted-foreground uppercase">Attendees</p>
            <p className="mt-1 text-2xl font-bold tabular-nums">{attendeeTotal}</p>
          </div>
          <div>
            <p className="text-[10px] font-bold tracking-widest text-muted-foreground uppercase">Ordered At</p>
            <p className="mt-1 text-sm text-muted-foreground">{payload.order.orderedAt ? new Date(payload.order.orderedAt).toLocaleString() : "-"}</p>
          </div>
        </CardContent>
      </Card>

      <Card className="border-border/50 bg-card/40">
        <CardHeader>
          <CardTitle className="flex items-center gap-2 text-lg">
            <Users className="size-4" /> Attendees
          </CardTitle>
        </CardHeader>
        <CardContent>
          {payload.attendees.length === 0 ? (
            <p className="text-sm text-muted-foreground">No attendees available.</p>
          ) : (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Name</TableHead>
                  <TableHead>Ticket</TableHead>
                  <TableHead className="text-right">Due</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {payload.attendees.map((attendee) => (
                  <TableRow key={attendee.id}>
                    <TableCell className="font-medium">{attendee.name}</TableCell>
                    <TableCell className="text-muted-foreground">{attendee.ticketTypeLabel}</TableCell>
                    <TableCell className="text-right font-mono tabular-nums">{formatMoney(attendee.amountDueMinor)}</TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          )}
        </CardContent>
      </Card>
    </div>
  )
}
