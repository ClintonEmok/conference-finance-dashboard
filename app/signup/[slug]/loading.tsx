import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { Skeleton } from "@/components/ui/skeleton"

export default function SignupLoading() {
  return (
    <main className="mx-auto flex min-h-svh w-full max-w-3xl items-center justify-center p-6">
      <Card className="w-full">
        <CardHeader>
          <CardTitle>Loading signup...</CardTitle>
        </CardHeader>
        <CardContent className="space-y-3">
          <Skeleton className="h-4 w-56" />
          <Skeleton className="h-4 w-80" />
          <Skeleton className="h-24 w-full" />
        </CardContent>
      </Card>
    </main>
  )
}
