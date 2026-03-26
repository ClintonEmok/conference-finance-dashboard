"use client"

import { Show, SignInButton, SignUpButton, UserButton } from "@clerk/nextjs"
import Link from "next/link"
import { ArrowRight, HandCoins } from "lucide-react"

import { Button } from "@/components/ui/button"

export default function Page() {
  return (
    <div className="flex min-h-svh items-center justify-center p-6">
      <div className="max-w-md min-w-0">
        <article className="overflow-hidden rounded-2xl bg-[linear-gradient(145deg,rgba(113,84,255,0.97),rgba(83,56,171,0.94))] p-8 text-primary-foreground shadow-[0_20px_56px_rgba(78,52,166,0.24)]">
          <div className="flex items-start justify-between gap-4">
            <div className="flex size-11 items-center justify-center rounded-xl bg-white/15 backdrop-blur-sm">
              <HandCoins className="size-5" />
            </div>

            <Show when="signed-in">
              <UserButton />
            </Show>
          </div>

          <h1 className="mt-5 text-2xl font-semibold tracking-tight">
            Conference Finance Command Center
          </h1>

          <p className="mt-2 text-sm leading-6 text-primary-foreground/82">
            One trusted dashboard for church conference finance operations.
          </p>

          <div className="mt-6 space-y-3">
            <Show when="signed-out">
              <SignInButton mode="modal">
                <Button className="w-full rounded-lg bg-white font-medium text-primary hover:bg-white/92">
                  Sign in to dashboard
                  <ArrowRight className="ml-2 size-4" />
                </Button>
              </SignInButton>
            </Show>

            <Show when="signed-out">
              <SignUpButton mode="modal">
                <Button
                  variant="outline"
                  className="w-full rounded-lg border-white/35 bg-transparent font-medium text-white hover:bg-white/10 hover:text-white"
                >
                  Create account
                </Button>
              </SignUpButton>
            </Show>

            <Show when="signed-in">
              <Button
                asChild
                className="w-full rounded-lg bg-white font-medium text-primary hover:bg-white/92"
              >
                <Link href="/dashboard">
                  Open dashboard
                  <ArrowRight className="ml-2 size-4" />
                </Link>
              </Button>
            </Show>
          </div>
        </article>
      </div>
    </div>
  )
}
