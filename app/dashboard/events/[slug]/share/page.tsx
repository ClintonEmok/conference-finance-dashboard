"use client"

import { use, useState } from "react"
import Link from "next/link"
import { useMutation } from "convex/react"
import { Link2 } from "lucide-react"

import { api } from "@/convex/_generated/api"
import { Button } from "@/components/ui/button"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { Input } from "@/components/ui/input"
import { useEventBySlug } from "@/lib/convex/hooks/events"

export default function EventSharePage({
  params,
}: {
  params: Promise<{ slug: string }>
}) {
  const { slug } = use(params)
  const event = useEventBySlug(slug)
  const createReportShare = useMutation(api.reportShares.createEventShare)
  const [shareUrl, setShareUrl] = useState<string | null>(null)
  const [shareStatus, setShareStatus] = useState<string | null>(null)
  const [shareError, setShareError] = useState<string | null>(null)
  const [isSharing, setIsSharing] = useState(false)

  if (!event) return null

  async function handleShareReport() {
    setIsSharing(true)
    setShareStatus(null)
    setShareError(null)

    try {
      const result = await createReportShare({ eventId: event._id })
      const reportUrl = new URL(result.path, window.location.origin).toString()
      setShareUrl(reportUrl)

      if (navigator.clipboard?.writeText) {
        await navigator.clipboard.writeText(reportUrl)
      }

      setShareStatus(
        result.reused ? "Copied the existing report link." : "Created and copied a new report link."
      )
    } catch (error) {
      setShareError(
        error instanceof Error ? error.message : "Unable to create the report link right now."
      )
    } finally {
      setIsSharing(false)
    }
  }

  return (
    <section className="space-y-6">
      <header className="space-y-2">
        <p className="text-[10px] font-black tracking-[0.24em] text-muted-foreground uppercase">
          Share link
        </p>
        <h2 className="text-3xl font-semibold tracking-tight text-foreground">
          Generate a stakeholder report link
        </h2>
        <p className="max-w-2xl text-sm leading-6 text-muted-foreground">
          Use this page to create or reuse the read-only public report token for this event.
        </p>
      </header>

      <Card className="border-border/50 bg-background/80 shadow-sm backdrop-blur">
        <CardHeader>
          <CardTitle>Share report link</CardTitle>
          <CardDescription>
            Generate a read-only stakeholder link for the event report.
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="flex flex-col gap-3 lg:flex-row lg:items-center">
            <Input
              readOnly
              value={shareUrl ?? "No report token created yet."}
              className="h-11 rounded-xl bg-background/60 font-mono text-xs"
            />
            <Button
              type="button"
              className="h-11 rounded-xl shadow-lg shadow-primary/20"
              onClick={() => {
                void handleShareReport()
              }}
              disabled={isSharing}
            >
              <Link2 className="mr-2 size-4" />
              {isSharing ? "Preparing link…" : shareUrl ? "Copy link" : "Generate link"}
            </Button>
          </div>

          {(shareStatus || shareError) && (
            <div className="flex items-start gap-3 rounded-2xl border border-border/50 bg-muted/30 p-4 text-sm">
              <div className="mt-1 size-2 rounded-full bg-primary" />
              <div className="space-y-1">
                {shareStatus ? <p className="font-medium text-foreground">{shareStatus}</p> : null}
                {shareError ? <p className="text-muted-foreground">{shareError}</p> : null}
              </div>
            </div>
          )}

          <Button asChild variant="outline" className="rounded-xl">
            <Link href={`/dashboard/events/${slug}`}>Back to event home</Link>
          </Button>
        </CardContent>
      </Card>
    </section>
  )
}
