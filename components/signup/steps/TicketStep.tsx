"use client"

import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { formatMoney } from "@/lib/format"
import { type TicketSelectionDraft } from "@/components/signup/state"

type TicketStepProps = {
  ticketSelections: TicketSelectionDraft[]
  onChange: (nextSelections: TicketSelectionDraft[]) => void
}

function ticketReasonCopy(reason: TicketSelectionDraft["reason"]) {
  if (reason === "sold_out") return "Sold out"
  if (reason === "disabled") return "Ticket currently unavailable"
  if (reason === "hidden") return "Ticket not publicly visible"
  if (reason === "not_on_sale") return "Ticket not on sale yet"
  return "Available"
}

export function TicketStep({ ticketSelections, onChange }: TicketStepProps) {
  function updateQuantity(
    ticketTypeId: string,
    direction: "decrease" | "increase"
  ) {
    const nextSelections = ticketSelections.map((ticket) => {
      if (ticket.ticketTypeId !== ticketTypeId) {
        return ticket
      }

      const delta = direction === "increase" ? 1 : -1
      const nextQuantity = Math.max(0, Math.min(10, ticket.quantity + delta))

      return {
        ...ticket,
        quantity: nextQuantity,
      }
    })

    onChange(nextSelections)
  }

  return (
    <div className="space-y-4">
      {ticketSelections.map((ticket) => {
        const disabled = !ticket.selectable

        return (
          <Card key={ticket.ticketTypeId}>
            <CardHeader>
              <CardTitle className="text-base">{ticket.label}</CardTitle>
              <p className="text-sm text-muted-foreground">
                {formatMoney(ticket.priceMinor)}
              </p>
            </CardHeader>
            <CardContent className="space-y-3">
              <div className="flex items-center justify-between gap-3">
                <Badge variant={ticket.selectable ? "default" : "outline"}>
                  {ticket.selectable ? "Selectable" : "Unavailable"}
                </Badge>
                <p className="text-xs text-muted-foreground">
                  {ticketReasonCopy(ticket.reason)}
                </p>
              </div>

              <div className="flex items-center gap-2">
                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  onClick={() =>
                    updateQuantity(ticket.ticketTypeId, "decrease")
                  }
                  disabled={ticket.quantity <= 0}
                >
                  -
                </Button>
                <span className="min-w-8 text-center text-sm font-medium">
                  {ticket.quantity}
                </span>
                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  onClick={() =>
                    updateQuantity(ticket.ticketTypeId, "increase")
                  }
                  disabled={disabled || ticket.quantity >= 10}
                >
                  +
                </Button>
              </div>
            </CardContent>
          </Card>
        )
      })}
    </div>
  )
}
