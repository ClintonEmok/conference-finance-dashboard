import { Skeleton } from "@/components/ui/skeleton"
import { Card, CardContent } from "@/components/ui/card"

export default function Loading() {
  return (
    <div className="mx-auto w-full max-w-4xl space-y-12 p-6 animate-in fade-in duration-500">
      {/* Hero Skeleton */}
      <div className="flex flex-col items-center text-center space-y-8 py-12">
        <Skeleton className="h-20 w-20 rounded-full" />
        <div className="space-y-4">
          <Skeleton className="mx-auto h-6 w-48 rounded-full" />
          <Skeleton className="mx-auto h-12 w-[70%] sm:h-16" />
          <Skeleton className="mx-auto h-6 w-[50%]" />
        </div>
      </div>

      <div className="grid gap-8 lg:grid-cols-12">
        {/* Left Column: Key Info Skeletons */}
        <div className="space-y-8 lg:col-span-12">
          {/* Booking Ref Card Skeleton */}
          <Card className="overflow-hidden border-none bg-card/40 shadow-2xl backdrop-blur-xl">
            <CardContent className="p-8 sm:p-10">
              <div className="flex flex-col items-center justify-between gap-8 md:flex-row">
                <div className="space-y-3 flex-1">
                  <Skeleton className="h-4 w-32" />
                  <Skeleton className="h-12 w-64" />
                </div>
                <div className="flex gap-10">
                  <Skeleton className="h-10 w-16" />
                  <Skeleton className="h-10 w-16" />
                </div>
              </div>
            </CardContent>
          </Card>

          {/* Event Context Card Skeleton */}
          <Card className="overflow-hidden border-none bg-card/40 p-1 shadow-xl">
            <div className="rounded-[calc(var(--radius)-1px)] bg-card p-6">
              <div className="flex flex-col gap-6 md:flex-row md:items-center">
                <Skeleton className="h-14 w-14 rounded-2xl" />
                <div className="flex-1 space-y-2">
                  <Skeleton className="h-8 w-64" />
                  <Skeleton className="h-4 w-48" />
                </div>
                <Skeleton className="h-10 w-32" />
              </div>
            </div>
          </Card>
        </div>

        {/* Details Sections Skeletons */}
        <div className="space-y-6 lg:col-span-12">
          <Skeleton className="h-24 w-full rounded-2xl" />
          <Skeleton className="h-24 w-full rounded-2xl" />
          <Skeleton className="h-24 w-full rounded-2xl" />
        </div>
      </div>
    </div>
  )
}

