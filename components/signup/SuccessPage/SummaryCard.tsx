"use client"

import { useState } from "react"
import { Copy, CheckCircle, Ticket, Users, Bed, CreditCard } from "lucide-react"
import { Card, CardContent } from "@/components/ui/card"
import { Button } from "@/components/ui/button"
import { formatMoney } from "@/lib/format"
import { cn } from "@/lib/utils"

interface SummaryCardProps {
  bookingRef: string
  totalTickets: number
  totalAttendees: number
  totalRooms: number
  totalAmountMinor?: number
  className?: string
}

export function SummaryCard({
  bookingRef,
  totalTickets,
  totalAttendees,
  totalRooms,
  totalAmountMinor,
  className,
}: SummaryCardProps) {
  const [copied, setCopied] = useState(false)

  const handleCopy = () => {
    navigator.clipboard.writeText(bookingRef)
    setCopied(true)
    setTimeout(() => setCopied(false), 2000)
  }

  return (
    <Card className={cn("overflow-hidden border-none bg-card/40 shadow-2xl backdrop-blur-xl ring-1 ring-border/50", className)}>
      <CardContent className="p-0">
        <div className="bg-gradient-to-br from-primary/20 via-primary/10 to-transparent p-8">
          <div className="space-y-4">
            <p className="text-[10px] font-black uppercase tracking-[0.2em] text-muted-foreground/80">
              Booking Reference
            </p>
            <div className="flex items-center gap-4">
              <code className="text-4xl font-black tracking-tighter text-foreground sm:text-5xl">
                {bookingRef}
              </code>
              <Button
                variant="ghost"
                size="icon"
                onClick={handleCopy}
                className="h-10 w-10 rounded-xl bg-primary/5 hover:bg-primary/10"
              >
                {copied ? (
                  <CheckCircle className="h-5 w-5 text-emerald-500" />
                ) : (
                  <Copy className="h-5 w-5 text-primary/60" />
                )}
              </Button>
            </div>
          </div>
        </div>

        <div className="grid grid-cols-2 divide-x divide-y divide-border/20">
          <div className="flex flex-col gap-1 p-6 transition-colors hover:bg-muted/30">
            <div className="flex items-center gap-2 text-primary">
              <Ticket className="h-4 w-4" />
              <span className="text-[10px] font-black uppercase tracking-widest text-muted-foreground/60">Tickets</span>
            </div>
            <p className="text-2xl font-black text-foreground">{totalTickets}</p>
          </div>
          <div className="flex flex-col gap-1 p-6 transition-colors hover:bg-muted/30">
            <div className="flex items-center gap-2 text-primary">
              <Users className="h-4 w-4" />
              <span className="text-[10px] font-black uppercase tracking-widest text-muted-foreground/60">Attendees</span>
            </div>
            <p className="text-2xl font-black text-foreground">{totalAttendees}</p>
          </div>
          <div className="flex flex-col gap-1 p-6 transition-colors hover:bg-muted/30">
            <div className="flex items-center gap-2 text-primary">
              <Bed className="h-4 w-4" />
              <span className="text-[10px] font-black uppercase tracking-widest text-muted-foreground/60">Rooms</span>
            </div>
            <p className="text-2xl font-black text-foreground">{totalRooms}</p>
          </div>
          <div className="flex flex-col gap-1 p-6 transition-colors hover:bg-muted/30">
            <div className="flex items-center gap-2 text-primary">
              <CreditCard className="h-4 w-4" />
              <span className="text-[10px] font-black uppercase tracking-widest text-muted-foreground/60">Total</span>
            </div>
            <p className="text-2xl font-black text-foreground">
              {totalAmountMinor !== undefined ? formatMoney(totalAmountMinor) : "—"}
            </p>
          </div>
        </div>

      </CardContent>
    </Card>
  )
}
