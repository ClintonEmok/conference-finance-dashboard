"use client"

import { use } from "react"

import { SignupFlowShell } from "@/components/signup/SignupFlowShell"

type SignupPageProps = {
  params: Promise<{ slug: string }>
}

export default function SignupPage({ params }: SignupPageProps) {
  const { slug } = use(params)

  return <SignupFlowShell slug={slug} />
}
