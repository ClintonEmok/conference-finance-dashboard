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

  return <SignupFlowShell slug={slug} />
}
