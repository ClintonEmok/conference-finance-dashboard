"use client"

import { useState } from "react"
import {
  Copy,
  CheckCircle,
  Calendar,
  MapPin,
  Ticket,
  Users,
  Bed,
} from "lucide-react"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { Button } from "@/components/ui/button"
import { Badge } from "@/components/ui/badge"
import { formatMoney } from "@/lib/format"
import { ExpandableSection } from "./ExpandableSection"
import { TikkieSection } from "./TikkieSection"

interface SubmissionAttendee {
  name: string
  email?: string
  ticketType: string
  assignedRoom?: string
}

interface RoomAssignment {
  roomType: string
  hotelName: string
  bedCount: number
}

interface TicketSelection {
  ticketTypeId: string
  ticketTypeName: string
  quantity: number
  pricePerTicketMinor: number
}

interface Submission {
  bookingRef?: string
  bookerName?: string
  bookerEmail?: string
  bookerPhone?: string
  submittedAt?: number
  attendees: SubmissionAttendee[]
  roomAssignments: RoomAssignment[]
  totalAmountMinor?: number
  ticketSelections: TicketSelection[]
}

interface Event {
  name: string
  startsAt: number
  location?: string
  description?: string
}

interface SuccessViewProps {
  submission: Submission
  event: Event
  tikkieUrl?: string | null
}

function formatEventDate(startsAt: number): string {
  const date = new Date(startsAt)
  return new Intl.DateTimeFormat("en-GB", {
    weekday: "long",
    year: "numeric",
    month: "long",
    day: "numeric",
  }).format(date)
}

export function SuccessView({
  submission,
  event,
  tikkieUrl,
}: SuccessViewProps) {
  const [copied, setCopied] = useState(false)

  const handleCopy = () => {
    if (submission.bookingRef) {
      navigator.clipboard.writeText(submission.bookingRef)
      setCopied(true)
      setTimeout(() => setCopied(false), 2000)
    }
  }

  const totalAttendees = submission.attendees.length
  const totalRooms = submission.roomAssignments.length

  return (
    <div className="mx-auto max-w-2xl space-y-6 p-4">
      {/* Header */}
      <div className="text-center">
        <div className="mx-auto mb-4 flex h-16 w-16 items-center justify-center rounded-full bg-green-100">
          <CheckCircle className="h-8 w-8 text-green-600" />
        </div>
        <h1 className="text-2xl font-bold text-foreground">
          Booking Confirmed!
        </h1>
        <p className="text-muted-foreground">
          Your booking for{" "}
          <span className="font-medium text-foreground">{event.name}</span> is
          confirmed.
        </p>
      </div>

      {/* Booking Reference Card */}
      <Card className="border-green-200 bg-green-50/50">
        <CardHeader>
          <CardTitle className="text-base">Booking Reference</CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="flex items-center justify-between gap-4">
            <code className="flex-1 truncate rounded bg-white px-4 py-2 font-mono text-xl font-bold text-foreground">
              {submission.bookingRef}
            </code>
            <Button
              variant="outline"
              size="icon"
              onClick={handleCopy}
              className="shrink-0"
            >
              {copied ? (
                <CheckCircle className="h-4 w-4 text-green-600" />
              ) : (
                <Copy className="h-4 w-4" />
              )}
            </Button>
          </div>
          <div className="space-y-2 text-sm text-muted-foreground">
            <p>
              <strong>Name:</strong> {submission.bookerName}
            </p>
            <p>
              <strong>Email:</strong> {submission.bookerEmail}
            </p>
            {submission.bookerPhone && (
              <p>
                <strong>Phone:</strong> {submission.bookerPhone}
              </p>
            )}
            <p>
              <strong>Date:</strong>{" "}
              {submission.submittedAt
                ? new Date(submission.submittedAt).toLocaleDateString("en-GB")
                : "N/A"}
            </p>
          </div>
        </CardContent>
      </Card>

      {/* Event Info */}
      <Card>
        <CardHeader>
          <CardTitle className="text-base">Event Details</CardTitle>
        </CardHeader>
        <CardContent className="space-y-3">
          <h2 className="text-lg font-semibold">{event.name}</h2>
          <div className="flex items-center gap-2 text-sm text-muted-foreground">
            <Calendar className="h-4 w-4" />
            <span>{formatEventDate(event.startsAt)}</span>
          </div>
          {event.location && (
            <div className="flex items-center gap-2 text-sm text-muted-foreground">
              <MapPin className="h-4 w-4" />
              <span>{event.location}</span>
            </div>
          )}
        </CardContent>
      </Card>

      {/* Expandable Sections */}
      <div className="space-y-3">
        {/* Tickets Section */}
        <ExpandableSection
          title="Tickets"
          icon={<Ticket className="h-5 w-5 text-primary" />}
          badge={submission.ticketSelections
            .reduce((sum, ts) => sum + ts.quantity, 0)
            .toString()}
          defaultExpanded={true}
        >
          <div className="space-y-3">
            {submission.ticketSelections.map((ticket) => (
              <div
                key={ticket.ticketTypeId}
                className="flex items-center justify-between rounded-md border p-3"
              >
                <div>
                  <p className="font-medium text-foreground">
                    {ticket.ticketTypeName}
                  </p>
                  <p className="text-xs text-muted-foreground">
                    {formatMoney(ticket.pricePerTicketMinor)} each
                  </p>
                </div>
                <div className="text-right">
                  <p className="font-medium text-foreground">
                    × {ticket.quantity}
                  </p>
                  <p className="text-xs text-muted-foreground">
                    {formatMoney(ticket.pricePerTicketMinor * ticket.quantity)}
                  </p>
                </div>
              </div>
            ))}
            {submission.totalAmountMinor !== undefined && (
              <div className="flex items-center justify-between border-t pt-3">
                <span className="font-medium text-foreground">Total</span>
                <span className="font-semibold text-foreground">
                  {formatMoney(submission.totalAmountMinor)}
                </span>
              </div>
            )}
          </div>
        </ExpandableSection>

        {/* Attendees Section */}
        <ExpandableSection
          title="Attendees"
          icon={<Users className="h-5 w-5 text-primary" />}
          badge={totalAttendees.toString()}
          defaultExpanded={false}
        >
          <div className="space-y-3">
            {submission.attendees.map((attendee, index) => (
              <div key={index} className="rounded-md border p-3">
                <div className="flex items-center justify-between">
                  <p className="font-medium text-foreground">{attendee.name}</p>
                  <Badge variant="outline">{attendee.ticketType}</Badge>
                </div>
                {attendee.email && (
                  <p className="text-sm text-muted-foreground">
                    {attendee.email}
                  </p>
                )}
                {attendee.assignedRoom && (
                  <p className="text-sm text-muted-foreground">
                    Room: {attendee.assignedRoom}
                  </p>
                )}
              </div>
            ))}
          </div>
        </ExpandableSection>

        {/* Room Assignments Section */}
        <ExpandableSection
          title="Room Assignments"
          icon={<Bed className="h-5 w-5 text-primary" />}
          badge={totalRooms.toString()}
          defaultExpanded={false}
        >
          {submission.roomAssignments.length === 0 ? (
            <p className="text-muted-foreground">No room assignments.</p>
          ) : (
            <div className="space-y-3">
              {submission.roomAssignments.map((room, index) => (
                <div key={index} className="rounded-md border p-3">
                  <div className="flex items-center justify-between">
                    <div>
                      <p className="font-medium text-foreground">
                        {room.roomType}
                      </p>
                      <p className="text-sm text-muted-foreground">
                        {room.hotelName}
                      </p>
                    </div>
                    <Badge variant="outline">
                      {room.bedCount} bed{room.bedCount !== 1 ? "s" : ""}
                    </Badge>
                  </div>
                </div>
              ))}
            </div>
          )}
        </ExpandableSection>
      </div>

      {/* Tikkie Payment Section */}
      <TikkieSection tikkieUrl={tikkieUrl ?? null} eventName={event.name} />

      {/* Footer */}
      <div className="text-center text-sm text-muted-foreground">
        <p>Keep your booking reference safe for future reference.</p>
        <p className="mt-1">Questions? Contact the event organizers.</p>
      </div>
    </div>
  )
}
