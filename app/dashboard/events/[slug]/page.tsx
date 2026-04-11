"use client"

import { use } from "react"
import { Calendar, Users, Ticket, CreditCard, BedDouble, ArrowRight } from "lucide-react"
import Link from "next/link"

import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card"
import { Button } from "@/components/ui/button"
import { useAttendeesForEvent, useTicketTypesForEvent, useEventBySlug } from "@/lib/convex/hooks/events"
import { useAccommodationSummaryForEvent } from "@/lib/convex/hooks/accommodation"
import { format } from "date-fns"

export default function EventOverviewPage({
  params,
}: {
  params: Promise<{ slug: string }>
}) {
  const { slug } = use(params)
  const event = useEventBySlug(slug)
  
  if (!event) return null

  return (
    <div className="grid gap-6 md:grid-cols-2 lg:grid-cols-3">
      {/* Quick Stats */}
      <Card className="lg:col-span-2 border-white/40 bg-white/40 shadow-sm backdrop-blur dark:border-white/10 dark:bg-black/20">
        <CardHeader>
          <CardTitle>Event Summary</CardTitle>
          <CardDescription>Key metrics and information</CardDescription>
        </CardHeader>
        <CardContent className="grid gap-6 sm:grid-cols-2">
          <div className="space-y-4">
            <div className="flex items-center gap-3">
              <div className="flex size-10 items-center justify-center rounded-lg bg-primary/10 text-primary">
                <Calendar className="size-5" />
              </div>
              <div>
                <p className="text-sm font-medium">Date & Time</p>
                <p className="text-xs text-muted-foreground">
                  {format(new Date(event.startsAt), "PPP p")}
                </p>
              </div>
            </div>
            
            <div className="flex items-center gap-3">
              <div className="flex size-10 items-center justify-center rounded-lg bg-primary/10 text-primary">
                <Users className="size-5" />
              </div>
              <div>
                <p className="text-sm font-medium">Attendees</p>
                <p className="text-xs text-muted-foreground">
                  Total registrations tracked
                </p>
              </div>
            </div>
          </div>

          <div className="space-y-4">
            <div className="flex items-center gap-3">
              <div className="flex size-10 items-center justify-center rounded-lg bg-primary/10 text-primary">
                <Ticket className="size-5" />
              </div>
              <div>
                <p className="text-sm font-medium">Capacity</p>
                <p className="text-xs text-muted-foreground">
                  Available vs Sold
                </p>
              </div>
            </div>

            <div className="flex items-center gap-3">
              <div className="flex size-10 items-center justify-center rounded-lg bg-primary/10 text-primary">
                <CreditCard className="size-5" />
              </div>
              <div>
                <p className="text-sm font-medium">Finance</p>
                <p className="text-xs text-muted-foreground">
                  Revenue and Outstanding
                </p>
              </div>
            </div>
          </div>
        </CardContent>
      </Card>

      {/* Configuration Card */}
      <Card className="border-white/40 bg-white/40 shadow-sm backdrop-blur dark:border-white/10 dark:bg-black/20">
        <CardHeader>
          <CardTitle>Event Config</CardTitle>
          <CardDescription>Integration settings</CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="flex items-center justify-between py-2 border-b border-white/10">
            <span className="text-sm text-muted-foreground">Timezone</span>
            <span className="text-sm font-medium">{event.timezone}</span>
          </div>
          <div className="flex items-center justify-between py-2 border-b border-white/10">
            <span className="text-sm text-muted-foreground">Currency</span>
            <span className="text-sm font-medium">{event.currency}</span>
          </div>
          <div className="flex items-center justify-between py-2">
            <span className="text-sm text-muted-foreground">Accommodation</span>
            <span className="text-sm font-medium">{event.accommodationEnabled ? "Enabled" : "Disabled"}</span>
          </div>
          <Button asChild variant="outline" className="w-full mt-2 rounded-xl border-white/20 hover:bg-white/10">
            <Link href={`/dashboard/events/${slug}/settings`}>
              Manage Settings <ArrowRight className="ml-2 size-3" />
            </Link>
          </Button>
        </CardContent>
      </Card>
      
      {/* Shortcuts Grid */}
      <div className="grid grid-cols-2 gap-4 lg:col-span-3">
         <Link href={`/dashboard/events/${slug}/tickets`} className="group flex flex-col items-center justify-center p-6 rounded-2xl border border-white/40 bg-white/40 shadow-sm backdrop-blur transition-all hover:bg-white/60 hover:border-primary/50 dark:border-white/10 dark:bg-black/20 dark:hover:bg-black/40">
            <Ticket className="size-8 text-primary mb-3 transition-transform group-hover:scale-110" />
            <span className="font-bold text-sm">Tickets</span>
            <span className="text-[10px] text-muted-foreground uppercase tracking-widest mt-1">Manage Pricing</span>
         </Link>
         
         <Link href={`/dashboard/events/${slug}/attendees`} className="group flex flex-col items-center justify-center p-6 rounded-2xl border border-white/40 bg-white/40 shadow-sm backdrop-blur transition-all hover:bg-white/60 hover:border-primary/50 dark:border-white/10 dark:bg-black/20 dark:hover:bg-black/40">
            <Users className="size-8 text-primary mb-3 transition-transform group-hover:scale-110" />
            <span className="font-bold text-sm">Attendees</span>
            <span className="text-[10px] text-muted-foreground uppercase tracking-widest mt-1">Directory</span>
         </Link>

         <Link href={`/dashboard/events/${slug}/payments`} className="group flex flex-col items-center justify-center p-6 rounded-2xl border border-white/40 bg-white/40 shadow-sm backdrop-blur transition-all hover:bg-white/60 hover:border-primary/50 dark:border-white/10 dark:bg-black/20 dark:hover:bg-black/40">
            <CreditCard className="size-8 text-primary mb-3 transition-transform group-hover:scale-110" />
            <span className="font-bold text-sm">Payments</span>
            <span className="text-[10px] text-muted-foreground uppercase tracking-widest mt-1">Tikkie Context</span>
         </Link>

         <Link href={`/dashboard/events/${slug}/accommodation`} className="group flex flex-col items-center justify-center p-6 rounded-2xl border border-white/40 bg-white/40 shadow-sm backdrop-blur transition-all hover:bg-white/60 hover:border-primary/50 dark:border-white/10 dark:bg-black/20 dark:hover:bg-black/40">
            <BedDouble className="size-8 text-primary mb-3 transition-transform group-hover:scale-110" />
            <span className="font-bold text-sm">Rooms</span>
            <span className="text-[10px] text-muted-foreground uppercase tracking-widest mt-1">Assignments</span>
         </Link>
      </div>
    </div>
  )
}
