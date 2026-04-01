"use client"

import Link from "next/link"
import { use } from "react"

import { SignupFlowShell } from "@/components/signup/SignupFlowShell"
import { Button } from "@/components/ui/button"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { usePublicSignupCatalog } from "@/lib/convex/hooks/signup"

type SignupPageProps = {
  params: Promise<{ slug: string }>
}

export default function SignupPage({ params }: SignupPageProps) {
  const { slug } = use(params)
  const catalog = usePublicSignupCatalog()
  const event = catalog.find((entry) => entry.slug === slug)

  // if (!event) {
  //   return (
  //     <main className="mx-auto flex min-h-svh w-full max-w-3xl items-center justify-center p-6 bg-muted/30">
  //       <Card className="w-full shadow-sm">
  //         <CardHeader>
  //           <CardTitle>Signup unavailable</CardTitle>
  //         </CardHeader>
  //         <CardContent className="space-y-4 text-sm text-muted-foreground">
  //           <p>We couldn&apos;t find a published signup event for this link.</p>
  //           <Button asChild>
  //             <Link href="/">Back to home</Link>
  //           </Button>
  //         </CardContent>
  //       </Card>
  //     </main>
  //   )
  // }

  return <SignupFlowShell slug={slug} />
}
