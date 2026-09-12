"use client"

import { useEffect, useState } from "react"
import { render } from "@react-email/render"
import { Eye, FileText, Megaphone } from "lucide-react"

import AnnouncementEmail from "@/lib/email/templates/announcement"
import {
  ANNOUNCEMENT_MESSAGE,
  ANNOUNCEMENT_NOTE,
  ANNOUNCEMENT_TITLE,
} from "@/lib/email/announcement-copy"
import {
  paymentReminderKinds,
  type PaymentReminderKind,
} from "@/lib/domain/payment-reminders"
import { PAYMENT_REMINDER_COPY } from "@/lib/email/payment-reminder-copy"
import PaymentReminderEmail from "@/lib/email/templates/payment-reminder"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog"
import { Skeleton } from "@/components/ui/skeleton"

type TemplateLibraryProps = {
  eventTitle: string
  eventStartsAt: number
  eventSlug: string
}

export function TemplateLibrary(props: TemplateLibraryProps) {
  return (
    <div className="space-y-5">
      <div className="flex flex-col gap-2 sm:flex-row sm:items-end sm:justify-between">
        <div>
          <p className="text-xs font-semibold tracking-[0.18em] text-primary uppercase">
            Message library
          </p>
          <h1 className="mt-1 text-2xl font-semibold tracking-tight">
            Templates, on demand
          </h1>
          <p className="mt-1 max-w-2xl text-sm text-muted-foreground">
            Review the fixed messages when you need to. Nothing is rendered or
            loaded into the workspace until you open a preview.
          </p>
        </div>
        <Badge variant="secondary" className="w-fit">
          Server-controlled copy
        </Badge>
      </div>

      <StandardTemplateCard {...props} />
      <PaymentTemplateCard {...props} />
    </div>
  )
}

function StandardTemplateCard(props: TemplateLibraryProps) {
  const [previewOpen, setPreviewOpen] = useState(false)
  const [previewHtml, setPreviewHtml] = useState<string | null>(null)
  const [previewError, setPreviewError] = useState<string | null>(null)

  useEffect(() => {
    if (!previewOpen) return
    let cancelled = false
    setPreviewHtml(null)
    setPreviewError(null)
    const origin = window.location.origin

    render(
      AnnouncementEmail({
        title: ANNOUNCEMENT_TITLE,
        message: ANNOUNCEMENT_MESSAGE,
        eventName: props.eventTitle,
        eventDate: props.eventStartsAt
          ? new Date(props.eventStartsAt).toLocaleDateString("en-GB")
          : "",
        manageBookingUrl: `${origin}/booking/BK-EXAMPLE/manage`,
        signupUrl: `${origin}/signup/${props.eventSlug}`,
        paymentUrl: null,
        nightBeforeNote: ANNOUNCEMENT_NOTE,
      })
    )
      .then((html) => {
        if (!cancelled) setPreviewHtml(html)
      })
      .catch((error) => {
        if (!cancelled) {
          setPreviewError(
            error instanceof Error
              ? error.message
              : "Could not render the announcement preview."
          )
        }
      })

    return () => {
      cancelled = true
    }
  }, [previewOpen, props.eventTitle, props.eventStartsAt, props.eventSlug])

  return (
    <Card>
      <CardHeader className="flex flex-row items-start justify-between gap-4">
        <div>
          <CardTitle className="flex items-center gap-2">
            <Megaphone className="size-4 text-primary" />
            Standard announcement
          </CardTitle>
          <p className="mt-1 text-sm text-muted-foreground">
            {ANNOUNCEMENT_TITLE}
          </p>
        </div>
        <Button
          type="button"
          variant="outline"
          onClick={() => setPreviewOpen(true)}
        >
          <Eye className="size-4" />
          Preview
        </Button>
      </CardHeader>
      <CardContent>
        <div className="flex flex-wrap items-center gap-x-6 gap-y-2 rounded-xl border bg-muted/20 p-4 text-sm">
          <span className="font-medium">Fixed content</span>
          <span className="text-muted-foreground">Event title and date</span>
          <span className="text-muted-foreground">
            Booking and signup links
          </span>
          <span className="text-muted-foreground">Accommodation note</span>
        </div>
      </CardContent>

      <PreviewDialog
        open={previewOpen}
        onOpenChange={setPreviewOpen}
        title="Standard announcement preview"
        description="This is the fixed announcement template. Personalized booking links are generated when the message is queued."
        html={previewHtml}
        error={previewError}
      />
    </Card>
  )
}

function PaymentTemplateCard(props: TemplateLibraryProps) {
  const [previewKind, setPreviewKind] = useState<PaymentReminderKind | null>(
    null
  )
  const [previewHtml, setPreviewHtml] = useState<string | null>(null)
  const [previewError, setPreviewError] = useState<string | null>(null)

  useEffect(() => {
    if (!previewKind) return
    let cancelled = false
    setPreviewHtml(null)
    setPreviewError(null)
    const origin = window.location.origin
    const balance = {
      unpaid: { paidAmountMinor: 0, outstandingAmountMinor: 10_000 },
      partial: { paidAmountMinor: 2_500, outstandingAmountMinor: 7_500 },
      overdue: { paidAmountMinor: 2_500, outstandingAmountMinor: 7_500 },
    }[previewKind]

    render(
      PaymentReminderEmail({
        kind: previewKind,
        eventName: props.eventTitle,
        eventDate: new Date(props.eventStartsAt).toLocaleDateString("en-GB"),
        bookerName: "Example booker",
        bookingRef: "BK-EXAMPLE",
        amountDueMinor: 10_000,
        paidAmountMinor: balance.paidAmountMinor,
        outstandingAmountMinor: balance.outstandingAmountMinor,
        currency: "EUR",
        managePaymentUrl: `${origin}/booking/BK-EXAMPLE/manage`,
      })
    )
      .then((html) => {
        if (!cancelled) setPreviewHtml(html)
      })
      .catch((error) => {
        if (!cancelled) {
          setPreviewError(
            error instanceof Error
              ? error.message
              : "Could not render the reminder preview."
          )
        }
      })

    return () => {
      cancelled = true
    }
  }, [previewKind, props.eventTitle, props.eventStartsAt])

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          <FileText className="size-4 text-primary" />
          Payment reminder templates
        </CardTitle>
        <p className="text-sm text-muted-foreground">
          The server selects the right variant from each booker&apos;s balance.
          Preview a variant only when you need to inspect it.
        </p>
      </CardHeader>
      <CardContent className="space-y-2">
        {paymentReminderKinds.map((kind) => (
          <div
            key={kind}
            className="flex flex-col gap-3 rounded-xl border p-4 sm:flex-row sm:items-center sm:justify-between"
          >
            <div className="min-w-0">
              <p className="text-xs font-semibold tracking-[0.14em] text-muted-foreground uppercase">
                {kind}
              </p>
              <p className="mt-1 truncate text-sm font-medium">
                {PAYMENT_REMINDER_COPY[kind].subject}
              </p>
            </div>
            <Button
              type="button"
              variant="ghost"
              size="sm"
              onClick={() => setPreviewKind(kind)}
            >
              <Eye className="size-4" />
              Preview
            </Button>
          </div>
        ))}
      </CardContent>

      <PreviewDialog
        open={previewKind !== null}
        onOpenChange={(open) => {
          if (!open) setPreviewKind(null)
        }}
        title={
          previewKind
            ? `${previewKind} payment reminder preview`
            : "Payment reminder preview"
        }
        description="Preview data is illustrative. The delivered amount, status, and booking link are derived server-side for each recipient."
        html={previewHtml}
        error={previewError}
      />
    </Card>
  )
}

function PreviewDialog(props: {
  open: boolean
  onOpenChange: (open: boolean) => void
  title: string
  description: string
  html: string | null
  error: string | null
}) {
  return (
    <Dialog open={props.open} onOpenChange={props.onOpenChange}>
      <DialogContent className="max-h-[min(780px,calc(100vh-2rem))] max-w-[calc(100%-2rem)] overflow-y-auto sm:max-w-2xl">
        <DialogHeader>
          <DialogTitle>{props.title}</DialogTitle>
          <DialogDescription>{props.description}</DialogDescription>
        </DialogHeader>
        <div className="overflow-hidden rounded-xl border bg-white">
          {props.error ? (
            <p className="p-4 text-sm text-destructive">{props.error}</p>
          ) : props.html ? (
            <iframe
              title={props.title}
              srcDoc={props.html}
              sandbox=""
              className="h-[min(620px,65vh)] w-full bg-white"
            />
          ) : (
            <div className="space-y-3 p-4">
              <Skeleton className="h-6 w-48" />
              <Skeleton className="h-28 w-full" />
              <Skeleton className="h-28 w-full" />
            </div>
          )}
        </div>
      </DialogContent>
    </Dialog>
  )
}
