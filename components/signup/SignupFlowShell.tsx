"use client"

import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { usePublicSignupCatalog } from "@/lib/convex/hooks/signup"

type SignupFlowShellProps = {
  slug: string
}

export function SignupFlowShell({ slug }: SignupFlowShellProps) {
  const catalog = usePublicSignupCatalog()
  const event = catalog.find((entry) => entry.slug === slug)

  if (!event) {
    return (
      <main className="mx-auto flex min-h-svh w-full max-w-4xl items-center justify-center p-6">
        <Card className="w-full">
          <CardHeader>
            <CardTitle>Signup event not found</CardTitle>
          </CardHeader>
          <CardContent className="text-sm text-muted-foreground">
            This signup link is unavailable. Return to the event page and try
            again.
          </CardContent>
        </Card>
      </main>
    )
  }

  return (
    <main className="mx-auto w-full max-w-5xl p-6">
      <Card>
        <CardHeader>
          <CardTitle>{event.title}</CardTitle>
        </CardHeader>
        <CardContent className="text-sm text-muted-foreground">
          Signup flow is loading...
        </CardContent>
      </Card>
    </main>
  )
}
