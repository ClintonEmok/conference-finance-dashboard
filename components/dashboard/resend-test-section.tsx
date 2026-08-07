"use client"

import { useMemo, useState } from "react"
import { useAction } from "convex/react"
import { AlertCircle, CheckCircle2, Loader2, Mail } from "lucide-react"

import { api } from "@/lib/convex/api"
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert"
import { Button } from "@/components/ui/button"
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"

type SubmissionState =
  | { status: "idle" }
  | { status: "sending" }
  | {
      status: "success"
      emailId?: string
    }
  | {
      status: "error"
      message: string
    }

function formatTestBookingRef() {
  return `RESEND-${Date.now().toString(36).toUpperCase()}`
}

export function ResendTestSection() {
  const sendSignupConfirmationTest = useAction(
    api.emailActions.sendSignupConfirmationTest
  )
  const [recipient, setRecipient] = useState("")
  const [state, setState] = useState<SubmissionState>({ status: "idle" })

  const defaults = useMemo(
    () => ({
      bookerName: "Conference Finance Test",
      bookingRef: formatTestBookingRef(),
      eventName: "Conference Finance Demo",
      eventDate: new Date().toLocaleDateString("en-GB"),
      eventLocation: "Dashboard test send",
      attendeeCount: 2,
      roomAssignments: [
        {
          roomType: "Standard Room",
          hotelName: "Test Hotel",
          bedCount: 1,
        },
      ],
      trackPaymentUrl:
        typeof window === "undefined"
          ? "http://localhost:3000/booking"
          : `${window.location.origin}/booking`,
      successPageUrl:
        typeof window === "undefined"
          ? "http://localhost:3000/dashboard/integrations"
          : `${window.location.origin}/dashboard/integrations`,
    }),
    []
  )

  async function handleSubmit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault()

    const trimmedRecipient = recipient.trim()
    if (!trimmedRecipient) {
      setState({ status: "error", message: "Enter a recipient email." })
      return
    }

    setState({ status: "sending" })

    try {
      const result = await sendSignupConfirmationTest({
        to: trimmedRecipient,
        bookerName: defaults.bookerName,
        bookingRef: defaults.bookingRef,
        eventName: defaults.eventName,
        eventDate: defaults.eventDate,
        eventLocation: defaults.eventLocation,
        attendeeCount: defaults.attendeeCount,
        roomAssignments: defaults.roomAssignments,
        trackPaymentUrl: defaults.trackPaymentUrl,
        successPageUrl: defaults.successPageUrl,
      })

      if (!result.success) {
        setState({
          status: "error",
          message: result.error ?? "Email send failed.",
        })
        return
      }

      setState({ status: "success", emailId: result.emailId })
    } catch (error) {
      setState({
        status: "error",
        message: error instanceof Error ? error.message : "Email send failed.",
      })
    }
  }

  return (
    <Card className="border-border/70">
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          <Mail className="size-4 text-primary" />
          Resend
        </CardTitle>
        <CardDescription>
          Send a test signup confirmation email with sample data.
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-4">
        <form onSubmit={handleSubmit} className="space-y-4">
          <div className="space-y-2">
            <Label htmlFor="resend-recipient">Recipient email</Label>
            <Input
              id="resend-recipient"
              type="email"
              placeholder="name@example.com"
              value={recipient}
              onChange={(event) => setRecipient(event.target.value)}
            />
          </div>

          <p className="text-xs text-muted-foreground">
            Uses a fixed test payload for the booking email template.
          </p>

          <Button type="submit" disabled={state.status === "sending"}>
            {state.status === "sending" ? (
              <>
                <Loader2 className="size-4 animate-spin" />
                Sending
              </>
            ) : (
              "Send test email"
            )}
          </Button>
        </form>

        {state.status === "success" && (
          <Alert>
            <CheckCircle2 className="size-4" />
            <AlertTitle>Sent</AlertTitle>
            <AlertDescription>
              Test email sent successfully
              {state.emailId ? `: ${state.emailId}` : "."}
            </AlertDescription>
          </Alert>
        )}

        {state.status === "error" && (
          <Alert variant="destructive">
            <AlertCircle className="size-4" />
            <AlertTitle>Send failed</AlertTitle>
            <AlertDescription>{state.message}</AlertDescription>
          </Alert>
        )}
      </CardContent>
    </Card>
  )
}
