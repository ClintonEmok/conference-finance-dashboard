"use client"

import { useEffect, useState } from "react"
import Link from "next/link"
import { useRouter } from "next/navigation"
import { ArrowRight, HandCoins } from "lucide-react"

import { authClient } from "@/lib/auth-client"
import { Button } from "@/components/ui/button"

export default function Page() {
  const router = useRouter()
  const [isLoading, setIsLoading] = useState(true)

  useEffect(() => {
    authClient
      .getSession()
      .then((response) => {
        if (response && "data" in response && response.data?.session) {
          router.replace("/dashboard")
        } else {
          setIsLoading(false)
        }
      })
      .catch(() => {
        setIsLoading(false)
      })
  }, [router])

  if (isLoading) {
    return (
      <div className="flex min-h-svh items-center justify-center">
        <p className="text-sm text-muted-foreground">Loading...</p>
      </div>
    )
  }

  return (
    <div className="flex min-h-svh items-center justify-center p-6">
      <div className="max-w-md min-w-0">
        <article className="overflow-hidden rounded-2xl bg-[linear-gradient(145deg,rgba(113,84,255,0.97),rgba(83,56,171,0.94))] p-8 text-primary-foreground shadow-[0_20px_56px_rgba(78,52,166,0.24)]">
          <div className="flex size-11 items-center justify-center rounded-xl bg-white/15 backdrop-blur-sm">
            <HandCoins className="size-5" />
          </div>

          <h1 className="mt-5 text-2xl font-semibold tracking-tight">
            Conference Finance Command Center
          </h1>

          <p className="mt-2 text-sm leading-6 text-primary-foreground/82">
            One trusted dashboard for church conference finance operations.
          </p>

          <div className="mt-6">
            <Button
              asChild
              className="w-full rounded-lg bg-white font-medium text-primary hover:bg-white/92"
            >
              <Link href="/login">
                Sign in to dashboard
                <ArrowRight className="ml-2 size-4" />
              </Link>
            </Button>
          </div>
        </article>
      </div>
    </div>
  )
}
