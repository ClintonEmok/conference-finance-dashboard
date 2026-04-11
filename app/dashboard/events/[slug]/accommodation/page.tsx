"use client"

import { use, useState } from "react"
import { BedDouble, Building2, Plus } from "lucide-react"
import Link from "next/link"

import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card"
import { Button } from "@/components/ui/button"
import { Skeleton } from "@/components/ui/skeleton"
import { useEventBySlug } from "@/lib/convex/hooks/events"
import {
  useHotels,
  useEventHotels,
  useLinkHotelToEvent,
  useUnlinkHotelFromEvent,
  useAccommodationSummaryForEvent,
} from "@/lib/convex/hooks/accommodation"
import { LinkedHotelCard } from "../components/linked-hotel-card"
import { AddHotelDialog } from "../components/add-hotel-dialog"

export default function EventAccommodationPage({
  params,
}: {
  params: Promise<{ slug: string }>
}) {
  const { slug } = use(params)
  const event = useEventBySlug(slug)
  const [isAddHotelDialogOpen, setIsAddHotelDialogOpen] = useState(false)
  const [isLinkingHotel, setIsLinkingHotel] = useState(false)

  const eventHotels = useEventHotels(event?._id)
  const accommodationSummary = useAccommodationSummaryForEvent(event?._id)
  const linkHotelToEvent = useLinkHotelToEvent()
  const unlinkHotelFromEvent = useUnlinkHotelFromEvent()
  const allHotels = useHotels()
  const linkedHotelIds = (eventHotels ?? []).map((h: any) => h._id as string)

  if (!event) return null


  const handleAddHotelSubmit = async (data: { hotelId: any }) => {
    setIsLinkingHotel(true)
    try {
      await linkHotelToEvent({
        eventId: event._id,
        hotelId: data.hotelId,
        autoGenerateSlots: true,
      })
      setIsAddHotelDialogOpen(false)
    } catch (err) {
      console.error("Failed to add hotel:", err)
      throw err
    } finally {
      setIsLinkingHotel(false)
    }
  }

  const handleUnlinkHotel = async (hotelId: string) => {
    try {
      await unlinkHotelFromEvent({
        eventId: event._id,
        hotelId: hotelId as any,
      })
    } catch (err) {
      console.error("Failed to unlink hotel:", err)
    }
  }

  if (!event.accommodationEnabled) {
    return (
      <Card className="border-dashed border-white/20 bg-white/5 dark:bg-black/10">
        <CardContent className="py-20 text-center">
          <BedDouble className="mx-auto size-16 text-muted-foreground opacity-10" />
          <h3 className="mt-6 text-xl font-bold tracking-tight">Accommodation Disabled</h3>
          <p className="text-sm text-muted-foreground mt-2 max-w-sm mx-auto">
            Enable accommodation in event settings to manage hotels, room assignments, and floor plans.
          </p>
          <Button asChild variant="outline" className="mt-8 rounded-xl border-white/20">
            <Link href={`/dashboard/events/${slug}/settings`}>Go to Settings</Link>
          </Button>
        </CardContent>
      </Card>
    )
  }

  return (
    <div className="space-y-6">
      <Card className="border-white/40 bg-white/40 shadow-sm backdrop-blur dark:border-white/10 dark:bg-black/20">
        <CardHeader>
          <CardTitle className="text-xl font-bold">Accommodation Overview</CardTitle>
          <CardDescription className="text-muted-foreground/70">
            Manage room assignments and linked hotels for the event
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-8">
          <div className="grid gap-4 sm:grid-cols-3">
            {[
              { label: "Hotels Linked", value: accommodationSummary?.hotelsLinked ?? 0 },
              { label: "Total Slots", value: accommodationSummary?.totalSlots ?? 0 },
              { label: "Submissions", value: accommodationSummary?.submissionsCount ?? 0 },
            ].map((stat, i) => (
              <div key={i} className="group rounded-2xl border border-white/40 bg-white/40 p-5 shadow-sm transition-all hover:bg-white/60 dark:border-white/5 dark:bg-black/20 dark:hover:bg-black/40">
                <p className="text-3xl font-black tracking-tighter text-foreground">
                  {stat.value}
                </p>
                <p className="text-[10px] font-bold tracking-[0.2em] text-muted-foreground/60 uppercase mt-1 transition-colors group-hover:text-primary">
                  {stat.label}
                </p>
              </div>
            ))}
          </div>

          <div className="flex flex-col sm:flex-row items-center justify-center gap-4 py-4">
            <Link href={`/dashboard/accommodation/${slug}`} className="w-full sm:w-auto">
              <Button size="lg" variant="outline" className="w-full rounded-2xl border-white/40 bg-white/40 backdrop-blur-sm hover:bg-white/60">
                <BedDouble className="mr-3 size-5 text-primary" />
                Event Room Matrix
              </Button>
            </Link>
            <Link href={`/dashboard/accommodation?eventId=${event._id}`} className="w-full sm:w-auto">
              <Button size="lg" className="w-full rounded-2xl shadow-lg shadow-primary/20">
                <Building2 className="mr-3 size-5" />
                Full Workspace
              </Button>
            </Link>
          </div>
        </CardContent>
      </Card>

      <div className="space-y-4">
        <div className="flex items-center justify-between px-2">
          <h3 className="text-xs font-black tracking-[0.2em] text-muted-foreground uppercase">Linked Hotels</h3>
          <Button
            variant="outline"
            size="sm"
            onClick={() => setIsAddHotelDialogOpen(true)}
            className="rounded-lg border-white/20 h-8 text-[11px] font-bold uppercase transition-all hover:bg-white/10"
          >
            <Plus className="mr-2 size-3" /> Add Hotel
          </Button>
        </div>

        <div className="grid gap-4">
          {eventHotels === undefined ? (
            <Skeleton className="h-32 w-full rounded-2xl" />
          ) : eventHotels.length === 0 ? (
            <div className="rounded-2xl border border-dashed border-white/20 bg-white/5 p-12 text-center">
              <p className="text-sm font-bold tracking-widest text-muted-foreground/40 uppercase">No hotels linked yet</p>
            </div>
          ) : (
            eventHotels.map((hotel: any) => (
              <LinkedHotelCard
                key={hotel._id}
                hotel={hotel}
                onUnlink={handleUnlinkHotel}
                onAddRooms={() => { }}
                isUnlinking={isLinkingHotel}
              />
            ))
          )}
        </div>
      </div>

      <AddHotelDialog
        open={isAddHotelDialogOpen}
        onOpenChange={setIsAddHotelDialogOpen}
        existingHotels={allHotels}
        linkedHotelIds={linkedHotelIds}
        onSubmit={handleAddHotelSubmit}
        isSubmitting={isLinkingHotel}
      />
    </div>
  )
}
