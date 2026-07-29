"use client"

import { useMemo, useState } from "react"
import { useMutation, useQuery } from "convex/react"
import { Link2, ShieldX } from "lucide-react"

import { api } from "@/convex/_generated/api"
import type { Id } from "@/convex/_generated/dataModel"
import { Button } from "@/components/ui/button"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { useAttendeesForEvent } from "@/lib/convex/hooks/events"

function formatDate(ms: number) {
  return new Intl.DateTimeFormat("en-GB", {
    day: "numeric",
    month: "short",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  }).format(new Date(ms))
}

export default function EventShareSettings({ eventId }: { eventId: Id<"events"> }) {
  const { attendees } = useAttendeesForEvent(eventId)
  const shares = useQuery(api.reportShares.listEventShares, { eventId }) as
    | Array<{
        _id: string
        token: string
        region: string | null
        createdAt: number
        revokedAt: number | null
        path: string
        isActive: boolean
      }>
    | undefined
  const createReportShare = useMutation(api.reportShares.createEventShare)
  const revokeEventShare = useMutation(api.reportShares.revokeEventShare)

  const [selectedRegion, setSelectedRegion] = useState("")
  const [isCreating, setIsCreating] = useState(false)
  const [createStatus, setCreateStatus] = useState<string | null>(null)
  const [createError, setCreateError] = useState<string | null>(null)
  const [copiedToken, setCopiedToken] = useState<string | null>(null)

  const regionOptions = useMemo(() => {
    const regions = new Map<string, string>()

    for (const attendee of attendees) {
      const region = attendee.location?.trim()
      if (!region) continue

      const key = region.toLowerCase()
      if (!regions.has(key)) {
        regions.set(key, region)
      }
    }

    return Array.from(regions.values()).sort((left, right) => left.localeCompare(right))
  }, [attendees])

  async function handleCreate() {
    setIsCreating(true)
    setCreateStatus(null)
    setCreateError(null)

    try {
      const result = await createReportShare({
        eventId,
        region: selectedRegion || undefined,
      })
      const reportUrl = new URL(result.path, window.location.origin).toString()

      if (navigator.clipboard?.writeText) {
        await navigator.clipboard.writeText(reportUrl)
      }

      setCreateStatus(
        result.reused
          ? "Copied the existing report link."
          : "Created and copied a new report link."
      )
    } catch (error) {
      setCreateError(
        error instanceof Error ? error.message : "Unable to create the report link right now."
      )
    } finally {
      setIsCreating(false)
    }
  }

  async function handleCopy(token: string) {
    const url = new URL(`/reports/${token}`, window.location.origin).toString()

    if (navigator.clipboard?.writeText) {
      await navigator.clipboard.writeText(url)
    }

    setCopiedToken(token)
    setTimeout(() => setCopiedToken(null), 2000)
  }

  async function handleRevoke(token: string) {
    await revokeEventShare({ token })
  }

  const activeShares = shares?.filter((s) => s.isActive) ?? []
  const revokedShares = shares?.filter((s) => !s.isActive) ?? []

  return (
    <section className="space-y-8">
      <header className="space-y-2">
        <p className="text-[10px] font-black tracking-[0.24em] text-muted-foreground uppercase">
          Report sharing
        </p>
        <h2 className="text-3xl font-semibold tracking-tight text-foreground">
          Share links
        </h2>
        <p className="max-w-2xl text-sm leading-6 text-muted-foreground">
          Create and manage read-only public report links for stakeholders.
        </p>
      </header>

      <Card className="border-border/50 bg-background/80 shadow-sm backdrop-blur">
        <CardHeader>
          <CardTitle>New share link</CardTitle>
          <CardDescription>
            Choose a region filter (optional) and generate a shareable link.
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="space-y-2">
            <p className="text-[10px] font-black tracking-[0.22em] text-muted-foreground uppercase">
              Region
            </p>
            <select
              value={selectedRegion}
              onChange={(event) => setSelectedRegion(event.target.value)}
              className="h-11 w-full rounded-xl border border-border/60 bg-background/60 px-3 text-sm text-foreground shadow-sm outline-none"
            >
              <option value="">All attendees (no region filter)</option>
              {regionOptions.map((region) => (
                <option key={region} value={region}>
                  {region}
                </option>
              ))}
            </select>
          </div>

          <div className="flex gap-3">
            <Button
              type="button"
              className="h-11 rounded-xl shadow-lg shadow-primary/20"
              onClick={handleCreate}
              disabled={isCreating}
            >
              <Link2 className="mr-2 size-4" />
              {isCreating ? "Creating…" : "Generate link"}
            </Button>
          </div>

          {(createStatus || createError) && (
            <div className="flex items-start gap-3 rounded-2xl border border-border/50 bg-muted/30 p-4 text-sm">
              <div className="mt-1 size-2 rounded-full bg-primary" />
              <div className="space-y-1">
                {createStatus ? <p className="font-medium text-foreground">{createStatus}</p> : null}
                {createError ? <p className="text-muted-foreground">{createError}</p> : null}
              </div>
            </div>
          )}
        </CardContent>
      </Card>

      <div className="space-y-4">
        <h3 className="text-lg font-semibold tracking-tight text-foreground">
          Active links ({activeShares.length})
        </h3>

        {activeShares.length === 0 ? (
          <p className="text-sm text-muted-foreground">No active share links yet.</p>
        ) : (
          <div className="space-y-3">
            {activeShares.map((share) => (
              <Card
                key={share._id}
                className="border-border/50 bg-background/80 shadow-sm backdrop-blur"
              >
                <CardContent className="flex items-center justify-between gap-4 p-5">
                  <div className="min-w-0 space-y-1">
                    <p className="truncate font-mono text-xs text-foreground">
                      /reports/{share.token}
                    </p>
                    <div className="flex flex-wrap gap-x-4 gap-y-1 text-xs text-muted-foreground">
                      <span>Created {formatDate(share.createdAt)}</span>
                      {share.region && <span>Region: {share.region}</span>}
                      {!share.region && <span>All attendees</span>}
                    </div>
                  </div>

                  <div className="flex shrink-0 gap-2">
                    <Button
                      variant="outline"
                      size="sm"
                      className="rounded-lg"
                      onClick={() => handleCopy(share.token)}
                    >
                      {copiedToken === share.token ? "Copied!" : "Copy"}
                    </Button>
                    <Button
                      variant="outline"
                      size="sm"
                      className="rounded-lg text-destructive hover:text-destructive"
                      onClick={() => handleRevoke(share.token)}
                    >
                      <ShieldX className="mr-1 size-3.5" />
                      Revoke
                    </Button>
                  </div>
                </CardContent>
              </Card>
            ))}
          </div>
        )}
      </div>

      {revokedShares.length > 0 && (
        <div className="space-y-4">
          <h3 className="text-lg font-semibold tracking-tight text-foreground">
            Revoked links ({revokedShares.length})
          </h3>

          <div className="space-y-3">
            {revokedShares.map((share) => (
              <Card
                key={share._id}
                className="border-border/30 bg-muted/20 opacity-60"
              >
                <CardContent className="flex items-center justify-between gap-4 p-5">
                  <div className="min-w-0 space-y-1">
                    <p className="truncate font-mono text-xs text-muted-foreground line-through">
                      /reports/{share.token}
                    </p>
                    <div className="flex flex-wrap gap-x-4 gap-y-1 text-xs text-muted-foreground">
                      <span>Created {formatDate(share.createdAt)}</span>
                      <span>Revoked</span>
                      {share.region && <span>Region: {share.region}</span>}
                    </div>
                  </div>
                </CardContent>
              </Card>
            ))}
          </div>
        </div>
      )}
    </section>
  )
}
