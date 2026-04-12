"use client"

import { SignInButton, UserButton, useAuth } from "@clerk/nextjs"
import Image from "next/image"
import Link from "next/link"
import { ArrowRight, CheckCircle2, HeartHandshake } from "lucide-react"

import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card"
import { Separator } from "@/components/ui/separator"

export default function LandingPage() {
  const { isLoaded, isSignedIn } = useAuth()

  const benefits = [
    "Simple event discovery",
    "Guided registration",
    "Clear event details",
  ]

  return (
    <div className="relative min-h-svh overflow-hidden bg-background text-foreground selection:bg-primary/15">
      <div className="pointer-events-none absolute inset-0">
        <div className="absolute inset-x-0 top-0 h-[30rem] bg-[radial-gradient(circle_at_top,hsl(var(--primary)/0.16),transparent_62%)]" />
        <div className="absolute top-[-8rem] left-[-6rem] h-[22rem] w-[22rem] rounded-full bg-primary/10 blur-3xl" />
        <div className="absolute top-[14rem] right-[-8rem] h-[26rem] w-[26rem] rounded-full bg-muted/80 blur-3xl" />
        <div className="absolute inset-0 bg-[linear-gradient(to_right,hsl(var(--border)/0.35)_1px,transparent_1px),linear-gradient(to_bottom,hsl(var(--border)/0.35)_1px,transparent_1px)] [mask-image:linear-gradient(to_bottom,black,transparent_84%)] bg-[size:96px_96px] opacity-40" />
      </div>

      <header className="sticky top-0 z-50 border-b border-border/40 bg-background/80 backdrop-blur-xl">
        <nav className="mx-auto flex max-w-7xl items-center justify-between px-4 py-4 sm:px-6 lg:px-8">
          <Link href="/" className="flex items-center gap-3">
            <div className="relative size-10 overflow-hidden rounded-2xl border bg-background shadow-sm">
              <Image
                src="/dlbc-logo.png"
                alt="DLBC logo"
                fill
                sizes="40px"
                className="object-contain p-1"
                priority
              />
            </div>
            <div>
              <p className="text-sm font-semibold tracking-[0.18em] text-foreground uppercase">
                DCLM Netherlands
              </p>
              <p className="text-xs text-muted-foreground">Conference center</p>
            </div>
          </Link>

          <div className="flex items-center gap-3">
            <Button
              asChild
              variant="outline"
              className="hidden rounded-full px-5 sm:inline-flex"
            >
              <Link href="/events">Browse events</Link>
            </Button>

            {isLoaded && isSignedIn ? (
              <div className="flex items-center gap-3">
                <Button
                  asChild
                  variant="ghost"
                  className="rounded-full px-5 text-muted-foreground hover:text-foreground"
                >
                  <Link href="/dashboard">Organizer access</Link>
                </Button>
                <UserButton />
              </div>
            ) : (
              <SignInButton mode="modal">
                <Button
                  variant="ghost"
                  className="rounded-full px-5 text-muted-foreground hover:text-foreground"
                >
                  Sign in
                </Button>
              </SignInButton>
            )}
          </div>
        </nav>
      </header>

      <main className="relative mx-auto w-full max-w-7xl px-4 pt-10 pb-16 sm:px-6 lg:px-8 lg:pt-14">
        <section className="grid gap-8">
          <div className="max-w-3xl">


            <h1 className="mt-8 text-5xl font-semibold tracking-[-0.07em] text-foreground sm:text-6xl lg:text-7xl">
              Plan your conference experience,
              <span className="block text-muted-foreground">
                without the confusion.
              </span>
            </h1>

            <p className="mt-6 max-w-2xl text-base leading-8 text-muted-foreground sm:text-lg">
              Discover events, start registration, and find the practical
              details you need to get ready for the conference.
            </p>

            <div className="mt-8 flex flex-wrap gap-3">
              <Button
                asChild
                className="h-12 rounded-full px-6 text-sm font-medium shadow-sm transition-transform hover:-translate-y-0.5"
              >
                <Link href="/events" className="flex items-center gap-2">
                  Browse events
                  <ArrowRight />
                </Link>
              </Button>

              <Button
                asChild
                variant="outline"
                className="h-12 rounded-full px-6 text-sm font-medium shadow-sm"
              >
                <Link href="/dashboard">Open dashboard</Link>
              </Button>
            </div>

            <div className="mt-10 flex flex-wrap gap-3 text-sm text-muted-foreground">
              {benefits.map((item) => (
                <div
                  key={item}
                  className="inline-flex items-center gap-2 rounded-full border bg-card/80 px-4 py-2 shadow-sm backdrop-blur"
                >
                  <CheckCircle2 className="size-4 text-primary" />
                  {item}
                </div>
              ))}
            </div>
          </div>
        </section>

        <section className="mt-10 grid gap-6 sm:grid-cols-3">
          {[
            [
              "Discover",
              "Find the event that fits your schedule and interests.",
            ],
            [
              "Reserve",
              "Follow the guided signup flow and confirm your place.",
            ],
            ["Prepare", "See what to expect before you travel and arrive."],
          ].map(([title, detail], index) => (
            <Card
              key={title}
              className="animate-in border bg-card/80 shadow-sm backdrop-blur duration-700 fade-in slide-in-from-bottom-4"
              style={{ animationDelay: `${index * 120}ms` }}
            >
              <CardHeader className="p-5">
                <CardDescription className="font-mono text-[10px] tracking-[0.2em] uppercase">
                  Step {index + 1}
                </CardDescription>
                <CardTitle className="text-xl tracking-[-0.04em]">
                  {title}
                </CardTitle>
                <CardDescription>{detail}</CardDescription>
              </CardHeader>
            </Card>
          ))}
        </section>

        <section className="mt-10 flex flex-wrap items-center justify-between gap-4 rounded-[2rem] border bg-card/80 p-6 shadow-sm backdrop-blur sm:p-8">
          <div className="space-y-2">
            <p className="text-sm font-medium text-muted-foreground">
              Ready to see what’s available?
            </p>
            <h2 className="text-2xl font-semibold tracking-[-0.05em] text-foreground">
              Start with the public events list.
            </h2>
          </div>

          <Button
            asChild
            className="h-12 rounded-full px-6 text-sm font-medium shadow-sm"
          >
            <Link href="/events" className="flex items-center gap-2">
              View events
              <HeartHandshake />
            </Link>
          </Button>
        </section>
      </main>
    </div>
  )
}
