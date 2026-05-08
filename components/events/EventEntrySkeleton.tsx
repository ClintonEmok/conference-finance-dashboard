import { Skeleton } from "@/components/ui/skeleton"
import { Card, CardContent, CardHeader } from "@/components/ui/card"

export function EventEntrySkeleton() {
  return (
    <main className="mx-auto w-full max-w-5xl space-y-8 p-6 animate-in fade-in duration-500">
      {/* Hero Skeleton */}
      <Card className="overflow-hidden border-none bg-card/40 shadow-2xl backdrop-blur-xl">
        <CardHeader className="relative space-y-4 pb-10 pt-12 text-center">

          <div className="mx-auto space-y-3">
            <Skeleton className="mx-auto h-10 w-[70%] sm:h-12" />
            <Skeleton className="mx-auto h-5 w-[40%]" />
          </div>
          <div className="mx-auto pt-4">
            <Skeleton className="mx-auto h-12 w-48 rounded-xl" />
          </div>
        </CardHeader>
      </Card>




    </main>
  )
}
