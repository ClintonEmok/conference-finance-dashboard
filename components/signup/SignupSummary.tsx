"use client"

import { useMemo } from "react"
import { Calendar, Ticket, UserCheck, Wallet } from "lucide-react"

import { SignupDraft } from "@/components/signup/state"
import { PublicSignupCatalogEvent } from "@/lib/domain/signup/catalog"
import { formatPrice } from "@/lib/utils"
import { Separator } from "@/components/ui/separator"

type SignupSummaryProps = {
  event: PublicSignupCatalogEvent
  draft: SignupDraft
}

export function SignupSummary({ event, draft }: SignupSummaryProps) {
  const selectedTickets = useMemo(() => {
    return draft.ticketSelections.filter((t) => t.quantity > 0)
  }, [draft.ticketSelections])

  const totalAmount = useMemo(() => {
    return selectedTickets.reduce((sum, t) => sum + t.priceMinor * t.quantity, 0)
  }, [selectedTickets])

  const attendeeCount = draft.attendees.length
  const assignedCount = Object.keys(draft.assignments).length

  return (
    <div className="space-y-6">
      <div>
        <h2 className="text-lg font-bold tracking-tight text-foreground">
          {event.title}
        </h2>
        <div className="mt-2 flex items-center gap-2 text-xs font-medium text-muted-foreground uppercase tracking-widest">
          <Calendar className="size-3" />
          {new Date(event.startsAt).toLocaleDateString("en-GB", {
            day: "numeric",
            month: "short",
            year: "numeric",
          })}
        </div>
      </div>

      <Separator className="bg-border/20" />

      <div className="space-y-4">
        <div className="flex items-center gap-2 text-[10px] font-black uppercase tracking-[0.2em] text-muted-foreground/50">
          <Ticket className="size-3" />
          Selections
        </div>
        
        {selectedTickets.length > 0 ? (
          <div className="space-y-3">
            {selectedTickets.map((ticket) => (
              <div key={ticket.ticketTypeId} className="flex justify-between text-sm">
                <div className="flex flex-col">
                  <span className="font-bold text-foreground">
                    {ticket.quantity}x {ticket.label}
                  </span>
                </div>
                <span className="font-mono font-medium text-foreground/80">
                  {formatPrice(ticket.priceMinor * ticket.quantity, event.currency)}
                </span>
              </div>
            ))}
          </div>
        ) : (
          <p className="text-sm italic text-muted-foreground/60">
            No tickets selected yet.
          </p>
        )}
      </div>

      <Separator className="bg-border/20" />

      {attendeeCount > 0 && (
        <>
          <div className="space-y-4">
            <div className="flex items-center gap-2 text-[10px] font-black uppercase tracking-[0.2em] text-muted-foreground/50">
              <UserCheck className="size-3" />
              Allocation
            </div>
            <div className="space-y-1">
              <div className="flex justify-between text-sm">
                <span className="text-muted-foreground">Attendees</span>
                <span className="font-bold text-foreground">{attendeeCount}</span>
              </div>
              {event.accommodation.eligible && (
                <div className="flex justify-between text-sm">
                  <span className="text-muted-foreground">Beds assigned</span>
                  <span className={assignedCount === attendeeCount ? "font-bold text-primary" : "font-bold text-foreground"}>
                    {assignedCount} / {attendeeCount}
                  </span>
                </div>
              )}
            </div>
          </div>
          <Separator className="bg-border/20" />
        </>
      )}

      <div className="pt-2">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2 text-[10px] font-black uppercase tracking-[0.2em] text-primary">
            <Wallet className="size-3" />
            Total Balance
          </div>
          <div className="text-2xl font-black tracking-tight text-foreground">
            {formatPrice(totalAmount, event.currency)}
          </div>
        </div>
      </div>
    </div>
  )
}
