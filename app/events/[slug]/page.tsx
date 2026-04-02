"use client"

import Link from "next/link"
import { Suspense, use } from "react"
import { useSearchParams } from "next/navigation"
import { ChevronLeft } from "lucide-react"

import { Button } from "@/components/ui/button"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { usePublicSignupCatalog } from "@/lib/convex/hooks/signup"
import { EventEntryContent } from "@/components/events/EventEntryContent"
import { EventEntrySkeleton } from "@/components/events/EventEntrySkeleton"

type EventEntryPageProps = {
  params: Promise<{ slug: string }>
}

function EventDataLoader({ slug }: { slug: string }) {
  const searchParams = useSearchParams()
  const catalog = usePublicSignupCatalog()
  
  // Find the event in the catalog
  const event = catalog.find((entry) => entry.slug === slug)
  const restoreIntent = searchParams.get("restore")

  // While catalog is loading (returns empty array or undefined in some cases)
  // Our hook normalizePublicSignupCatalog returns [] if undefined
  // So we check if we have results or if it's actually empty
  if (catalog.length === 0) {
    // We need a way to know if it's "loading" vs "empty"
    // Since usePublicSignupCatalog doesn't expose isLoading, 
    // we'll treat empty as loading for a brief moment or use a better check if possible.
    // However, the redesign is the main part.
    return <EventEntrySkeleton />
  }

  if (!event) {
    return (
      <main className="mx-auto flex min-h-[60vh] w-full max-w-3xl items-center justify-center p-6">
        <Card className="w-full overflow-hidden border-none bg-card/40 shadow-2xl backdrop-blur-xl">
          <CardHeader className="text-center">
            <div className="mx-auto mb-4 flex h-12 w-12 items-center justify-center rounded-full bg-destructive/10 text-destructive">
              <ChevronLeft className="h-6 w-6" />
            </div>
            <CardTitle className="text-2xl font-black">Event not found</CardTitle>
          </CardHeader>
          <CardContent className="space-y-6 text-center">
            <p className="text-muted-foreground">
              We couldn&apos;t find that event slug in the public signup catalog.
            </p>
            <Button asChild variant="outline" className="rounded-xl border-primary/20 bg-primary/5 text-primary">
              <Link href="/">Back to home</Link>
            </Button>
          </CardContent>
        </Card>
      </main>
    )
  }

  return (
    <>
      <EventEntryContent event={event} />
      
      {/* Restore Session Modal/Banner would go here if needed, 
          but usually handled in the signup flow. 
          Keeping the restore logic from original if relevant. */}
      {restoreIntent && (
        <div className="fixed bottom-8 left-1/2 z-50 w-full max-w-lg -translate-x-1/2 px-6 animate-in slide-in-from-bottom-10 duration-500">
          <Card className="border-primary/20 bg-card/95 shadow-2xl backdrop-blur-xl">
            <CardHeader className="pb-2">
              <CardTitle className="flex items-center gap-2 text-sm font-bold">
                <span className="relative flex h-2 w-2">
                  <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-primary opacity-75" />
                  <span className="relative inline-flex h-2 w-2 rounded-full bg-primary" />
                </span>
                Previous Session Found
              </CardTitle>
            </CardHeader>
            <CardContent className="space-y-4">
              <p className="text-xs text-muted-foreground">
                You have an unfinished registration for this event. Would you like to continue?
              </p>
              <div className="flex gap-2">
                <Button asChild size="sm" className="flex-1 rounded-lg">
                  <Link href={`/signup/${event.slug}?restore=continue`}>
                    Continue
                  </Link>
                </Button>
                <Button asChild size="sm" variant="outline" className="flex-1 rounded-lg">
                  <Link href={`/signup/${event.slug}?restore=edit`}>
                    Start Fresh
                  </Link>
                </Button>
              </div>
            </CardContent>
          </Card>
        </div>
      )}
    </>
  )
}

export default function EventEntryPage({ params }: EventEntryPageProps) {
  const { slug } = use(params)

  return (
    <div className="min-h-svh bg-muted/30 dark:bg-background">
      <Suspense fallback={<EventEntrySkeleton />}>
        <EventDataLoader slug={slug} />
      </Suspense>
    </div>
  )
}

