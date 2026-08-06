"use client"

import { Calendar, Ticket, Wallet } from "lucide-react"

import { SignupDraft } from "@/components/signup/state"
import { PublicSignupCatalogEvent } from "@/lib/domain/signup/catalog"
import { formatPrice } from "@/lib/utils"
import type { PublicSignupQuoteRenderState } from "@/lib/convex/hooks/signup"
import { Separator } from "@/components/ui/separator"

type SignupSummaryProps = {
  event: PublicSignupCatalogEvent
  draft: SignupDraft
  quote: PublicSignupQuoteRenderState
}

export function SignupSummary({ event, draft, quote }: SignupSummaryProps) {
  const selectedTickets = draft.ticketSelections.filter((t) => t.quantity > 0)
  const quoteReady = quote.status === "ready"

  // WR-02: whenever the live quote is ready, ticket rows and unit prices come
  // from the server quote (quote.attendees[].ticketPriceMinor,
  // quote.currency) so a catalog-price change can never disagree with the
  // quoted total. The draft/catalog copy is only a pre-quote snapshot.
  const ticketRows = quoteReady
    ? Array.from(
        quote.quote.attendees
          .reduce((byTicket, attendee) => {
            const existing = byTicket.get(attendee.ticketTypeId)
            if (existing) {
              existing.count += 1
            } else {
              byTicket.set(attendee.ticketTypeId, {
                label: attendee.ticketLabel,
                priceMinor: attendee.ticketPriceMinor,
                count: 1,
              })
            }
            return byTicket
          }, new Map<string, { label: string; priceMinor: number; count: number }>())
          .values()
      )
    : selectedTickets.map((ticket) => ({
        label: ticket.label,
        priceMinor: ticket.priceMinor,
        count: ticket.quantity,
      }))
  const currency = quoteReady ? quote.quote.currency : event.currency

  return (
    <div className="space-y-6">
      <div>
        <h2 className="text-lg font-bold tracking-tight text-foreground">
          {event.title}
        </h2>
        <div className="mt-2 flex items-center gap-2 text-xs font-medium tracking-widest text-muted-foreground uppercase">
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
        <div className="flex items-center gap-2 text-[10px] font-black tracking-[0.2em] text-muted-foreground/50 uppercase">
          <Ticket className="size-3" />
          Selections
        </div>

        {ticketRows.length > 0 ? (
          <div className="space-y-3">
            {ticketRows.map((ticket) => (
              <div
                key={ticket.label}
                className="flex justify-between gap-3 text-sm"
              >
                <div className="min-w-0">
                  <span className="block break-words font-bold text-foreground">
                    {ticket.count}x {ticket.label}
                  </span>
                  {/* Server quote unit price only — no client quantity
                      multiplication; the total comes from the quote. */}
                  <span className="block font-mono text-xs text-foreground/60">
                    {formatPrice(ticket.priceMinor, currency)} each
                  </span>
                </div>
              </div>
            ))}
          </div>
        ) : (
          <p className="text-sm text-muted-foreground/60 italic">
            No tickets selected yet.
          </p>
        )}
      </div>

      <Separator className="bg-border/20" />

      {/* Server quote only: no local money arithmetic. */}
      <div className="space-y-2">
        {quote.status === "ready" ? (
          <>
            {quote.quote.accommodationTotalMinor > 0 ? (
              <div className="space-y-1">
                <p className="text-[10px] font-black tracking-[0.2em] text-muted-foreground/50 uppercase">
                  Accommodation
                </p>
                {quote.quote.attendees.map((attendee) =>
                  attendee.lines.map((line, index) => (
                    <div
                      key={`${attendee.attendeeKey}-${line.kind}-${index}`}
                      className="flex items-center justify-between text-xs"
                    >
                      <span className="text-muted-foreground">
                        {line.label}
                        {attendee.categoryLabel
                          ? ` (${attendee.categoryLabel})`
                          : ""}
                      </span>
                      <span className="font-mono tabular-nums text-foreground/80">
                        {formatPrice(line.chargeMinor, currency)}
                      </span>
                    </div>
                  ))
                )}
                {quote.quote.breakfastIncluded ? (
                  <p className="text-xs font-medium text-emerald-700 dark:text-emerald-400">
                    Breakfast included
                  </p>
                ) : null}
              </div>
            ) : null}

            <div className="pt-2">
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-2 text-[10px] font-black tracking-[0.2em] text-primary uppercase">
                  <Wallet className="size-3" />
                  Total Balance
                </div>
                <div className="text-2xl font-black tracking-tight text-foreground">
                  {formatPrice(quote.quote.totalDueMinor, currency)}
                </div>
              </div>
              <p className="mt-1 text-[10px] leading-snug text-muted-foreground/70">
                Live quote — may change if event configuration changes before
                submission.
              </p>
            </div>
          </>
        ) : quote.status === "loading" || quote.status === "incomplete" ? (
          <div
            aria-live="polite"
            className="flex items-center gap-2 text-xs text-muted-foreground"
          >
            <span className="size-3 animate-spin rounded-full border-2 border-border border-t-primary" />
            {quote.status === "incomplete"
              ? "Complete accommodation selections to see your total."
              : "Loading live quote..."}
          </div>
        ) : (
          <div className="text-xs text-muted-foreground/70 italic">
            {quote.status === "unconfigured"
              ? "No accommodation configured."
              : "Quote unavailable — review your selections."}
          </div>
        )}
      </div>
    </div>
  )
}
