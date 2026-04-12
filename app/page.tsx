"use client"

import { SignInButton, UserButton, useAuth } from "@clerk/nextjs"
import Link from "next/link"
import {
  ArrowRight,
  BadgeCheck,
  LayoutDashboard,
  Shield,
  Sparkles,
  Users,
  Wallet,
} from "lucide-react"

import { Button } from "@/components/ui/button"

export default function LandingPage() {
  const { isLoaded, isSignedIn } = useAuth()

  const highlights = [
    {
      title: "Attendee flow",
      value: "Signup to seating",
      icon: Users,
    },
    {
      title: "Finance clarity",
      value: "Payments and balances",
      icon: Wallet,
    },
    {
      title: "Operational trust",
      value: "Secure and auditable",
      icon: Shield,
    },
  ]

  return (
    <div className="relative min-h-svh w-full overflow-hidden bg-[#f5f5f7] text-zinc-950 selection:bg-black/10">
      <div className="pointer-events-none absolute inset-0">
        <div className="absolute inset-x-0 top-0 h-[38rem] bg-[radial-gradient(circle_at_top,rgba(255,255,255,0.9),rgba(245,245,247,0.2)_42%,rgba(245,245,247,0)_72%)]" />
        <div className="absolute top-[-8rem] left-[-6rem] h-[22rem] w-[22rem] rounded-full bg-white/80 blur-3xl" />
        <div className="absolute top-[16rem] right-[-8rem] h-[26rem] w-[26rem] rounded-full bg-slate-200/70 blur-3xl" />
        <div className="absolute inset-0 bg-[linear-gradient(to_right,rgba(17,24,39,0.03)_1px,transparent_1px),linear-gradient(to_bottom,rgba(17,24,39,0.03)_1px,transparent_1px)] [mask-image:linear-gradient(to_bottom,black,transparent_82%)] bg-[size:96px_96px] opacity-35" />
      </div>

      <header className="fixed top-0 z-50 w-full px-4 pt-4 sm:px-6">
        <nav className="mx-auto flex max-w-7xl items-center justify-between rounded-full border border-black/5 bg-white/75 px-4 py-3 shadow-[0_18px_50px_rgba(15,23,42,0.08)] backdrop-blur-xl sm:px-6">
          <div className="flex items-center gap-3">
            <div className="flex size-9 items-center justify-center rounded-full bg-zinc-950 text-white shadow-[0_10px_30px_rgba(0,0,0,0.18)]">
              <Sparkles className="size-4" />
            </div>
            <span className="text-sm font-semibold tracking-[0.22em] text-zinc-900 uppercase sm:text-[13px]">
              DCLM Netherlands Conference Center
            </span>
          </div>

          <div className="flex items-center gap-4">
            {isLoaded && isSignedIn ? (
              <div className="flex items-center gap-4">
                <Button
                  variant="ghost"
                  asChild
                  className="hidden rounded-full px-4 font-medium text-zinc-600 hover:bg-zinc-950/5 hover:text-zinc-950 md:flex"
                >
                  <Link href="/dashboard">Go to Dashboard</Link>
                </Button>
                <UserButton />
              </div>
            ) : (
              <SignInButton mode="modal">
                <Button
                  variant="ghost"
                  className="rounded-full px-4 font-medium text-zinc-600 hover:bg-zinc-950/5 hover:text-zinc-950"
                >
                  Sign In
                </Button>
              </SignInButton>
            )}
          </div>
        </nav>
      </header>

      {/* Hero Section */}
      <main className="relative mx-auto flex min-h-svh w-full max-w-7xl items-center px-4 pt-28 pb-16 sm:px-6 lg:px-8 lg:pt-32">
        <div className="grid w-full items-center gap-12 lg:grid-cols-[1.1fr_0.9fr] lg:gap-16">
          <div className="max-w-2xl">
            <div className="inline-flex items-center gap-2 rounded-full border border-black/10 bg-white/70 px-4 py-2 text-sm font-medium text-zinc-700 shadow-[0_10px_30px_rgba(15,23,42,0.06)] backdrop-blur">
              <BadgeCheck className="size-4 text-zinc-950" />
              Trusted church finance operations
            </div>

            <h1 className="mt-8 text-5xl font-semibold tracking-[-0.06em] text-zinc-950 sm:text-6xl lg:text-7xl">
              Conference operations,
              <span className="block text-zinc-500">
                beautifully organized.
              </span>
            </h1>

            <p className="mt-6 max-w-xl text-base leading-8 text-zinc-600 sm:text-lg">
              A calm, secure workspace for signups, room assignments, and
              finance tracking. Built for clarity, speed, and the kind of polish
              your team can trust.
            </p>

            <div className="mt-10 flex flex-col gap-3 sm:flex-row">
              {isLoaded && isSignedIn ? (
                <Button
                  size="lg"
                  asChild
                  className="h-12 rounded-full bg-zinc-950 px-6 text-sm font-medium text-white shadow-[0_20px_40px_rgba(0,0,0,0.14)] transition-transform hover:-translate-y-0.5 hover:bg-zinc-800"
                >
                  <Link href="/dashboard" className="flex items-center gap-2">
                    <LayoutDashboard className="size-4" />
                    Open conference center
                    <ArrowRight className="size-4" />
                  </Link>
                </Button>
              ) : (
                <SignInButton mode="modal">
                  <Button
                    size="lg"
                    className="h-12 rounded-full bg-zinc-950 px-6 text-sm font-medium text-white shadow-[0_20px_40px_rgba(0,0,0,0.14)] transition-transform hover:-translate-y-0.5 hover:bg-zinc-800"
                  >
                    Get started
                    <ArrowRight className="ml-2 size-4" />
                  </Button>
                </SignInButton>
              )}

              <Button
                variant="outline"
                size="lg"
                asChild
                className="h-12 rounded-full border-black/10 bg-white/70 px-6 text-sm font-medium text-zinc-700 shadow-[0_10px_30px_rgba(15,23,42,0.04)] backdrop-blur transition-colors hover:bg-white hover:text-zinc-950"
              >
                <Link href="/signup">View signup flow</Link>
              </Button>
            </div>

            <div className="mt-12 grid gap-4 sm:grid-cols-3">
              {highlights.map((item, index) => {
                const Icon = item.icon

                return (
                  <div
                    key={item.title}
                    className="animate-in rounded-[1.75rem] border border-black/8 bg-white/70 p-4 shadow-[0_16px_40px_rgba(15,23,42,0.05)] backdrop-blur duration-700 fade-in slide-in-from-bottom-4"
                    style={{ animationDelay: `${index * 120}ms` }}
                  >
                    <div className="flex size-10 items-center justify-center rounded-2xl bg-zinc-950 text-white">
                      <Icon className="size-4" />
                    </div>
                    <p className="mt-4 text-sm font-medium text-zinc-500">
                      {item.title}
                    </p>
                    <p className="mt-1 text-base font-medium text-zinc-950">
                      {item.value}
                    </p>
                  </div>
                )
              })}
            </div>
          </div>

          <div className="relative lg:pl-8">
            <div className="absolute inset-0 -z-10 rounded-[2.5rem] bg-[radial-gradient(circle_at_30%_20%,rgba(255,255,255,0.95),rgba(255,255,255,0.45)_32%,rgba(229,231,235,0.2)_68%,rgba(229,231,235,0)_100%)] blur-2xl" />
            <div className="rounded-[2.25rem] border border-black/8 bg-white/80 p-4 shadow-[0_30px_80px_rgba(15,23,42,0.12)] backdrop-blur-xl sm:p-5">
              <div className="rounded-[2rem] border border-black/5 bg-[linear-gradient(180deg,rgba(255,255,255,0.96),rgba(248,248,248,0.94))] p-5 sm:p-6">
                <div className="flex items-start justify-between gap-4">
                  <div>
                    <p className="text-xs font-semibold tracking-[0.22em] text-zinc-500 uppercase">
                      Live overview
                    </p>
                    <h2 className="mt-2 text-2xl font-semibold tracking-[-0.05em] text-zinc-950">
                      Conference center dashboard
                    </h2>
                  </div>
                  <div className="rounded-full border border-emerald-500/15 bg-emerald-500/10 px-3 py-1 text-xs font-medium text-emerald-700">
                    Synced
                  </div>
                </div>

                <div className="mt-6 grid gap-3 sm:grid-cols-3">
                  {[
                    ["48", "registrations"],
                    ["12", "rooms assigned"],
                    ["99%", "payment status"],
                  ].map(([value, label]) => (
                    <div
                      key={label}
                      className="rounded-[1.5rem] border border-black/5 bg-white px-4 py-5 shadow-[0_8px_24px_rgba(15,23,42,0.04)]"
                    >
                      <p className="text-3xl font-semibold tracking-[-0.06em] text-zinc-950">
                        {value}
                      </p>
                      <p className="mt-1 text-sm text-zinc-500">{label}</p>
                    </div>
                  ))}
                </div>

                <div className="mt-4 space-y-3">
                  {[
                    ["Signup review", "Waiting for final submission"],
                    ["Room placement", "All beds balanced"],
                    ["Finance check", "Ready for reconciliation"],
                  ].map(([title, detail]) => (
                    <div
                      key={title}
                      className="flex items-center justify-between rounded-[1.25rem] border border-black/5 bg-white px-4 py-3"
                    >
                      <div>
                        <p className="text-sm font-medium text-zinc-950">
                          {title}
                        </p>
                        <p className="text-sm text-zinc-500">{detail}</p>
                      </div>
                      <div className="h-2.5 w-2.5 rounded-full bg-zinc-950/80" />
                    </div>
                  ))}
                </div>
              </div>
            </div>
          </div>
        </div>
      </main>

      <footer className="absolute bottom-4 left-0 w-full px-6 pb-4 text-center text-xs tracking-[0.2em] text-zinc-500 uppercase sm:bottom-6">
        © 2026 DCLM Netherlands Conference Center
      </footer>
    </div>
  )
}
