"use client"

import { useEffect } from "react"
import Link from "next/link"
import { Button } from "@/components/ui/button"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { AlertCircle } from "lucide-react"

export default function Error({
  error,
  reset,
}: {
  error: Error & { digest?: string }
  reset: () => void
}) {
  useEffect(() => {
    console.error("Success page error:", error)
  }, [error])

  return (
    <div className="mx-auto flex min-h-svh max-w-2xl items-center justify-center p-4">
      <Card className="w-full">
        <CardHeader>
          <div className="mb-4 flex justify-center">
            <div className="flex h-16 w-16 items-center justify-center rounded-full bg-red-100">
              <AlertCircle className="h-8 w-8 text-red-600" />
            </div>
          </div>
          <CardTitle className="text-center">Something went wrong</CardTitle>
        </CardHeader>
        <CardContent className="space-y-4 text-center">
          <p className="text-muted-foreground">
            We couldn&apos;t load your booking details. This might be because:
          </p>
          <ul className="text-left text-sm text-muted-foreground">
            <li>• The booking reference is invalid or expired</li>
            <li>• There was a temporary network issue</li>
            <li>• The event has been removed</li>
          </ul>

          <div className="flex flex-col gap-2 pt-4">
            <Button onClick={reset} variant="outline">
              Try again
            </Button>
            <Button asChild variant="default">
              <Link href="/">Back to home</Link>
            </Button>
          </div>

          {error.digest && (
            <p className="text-xs text-muted-foreground">
              Error reference: {error.digest}
            </p>
          )}
        </CardContent>
      </Card>
    </div>
  )
}
