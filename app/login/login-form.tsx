"use client"

import { FormEvent, useState } from "react"

import { Button } from "@/components/ui/button"
import { authClient } from "@/lib/auth-client"

type LoginFormProps = {
  callbackUrl: string
}

export function LoginForm({ callbackUrl }: LoginFormProps) {
  const [email, setEmail] = useState("")
  const [errorMessage, setErrorMessage] = useState<string | null>(null)
  const [submitted, setSubmitted] = useState(false)
  const [isSubmitting, setIsSubmitting] = useState(false)

  async function onSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    setErrorMessage(null)
    setSubmitted(false)
    setIsSubmitting(true)

    const normalizedEmail = email.trim()

    if (!normalizedEmail) {
      setErrorMessage("Email is required")
      setIsSubmitting(false)
      return
    }

    const { error } = await authClient.signIn.magicLink({
      email: normalizedEmail,
      callbackURL: callbackUrl,
    })

    if (error) {
      setErrorMessage("Unable to send sign-in link. Please try again.")
      setIsSubmitting(false)
      return
    }

    setSubmitted(true)
    setIsSubmitting(false)
  }

  return (
    <>
      <form className="mt-6 flex flex-col gap-4" onSubmit={onSubmit}>
        <label className="flex flex-col gap-2 text-sm" htmlFor="email">
          Email
          <input
            id="email"
            name="email"
            type="email"
            autoComplete="email"
            required
            value={email}
            onChange={(event) => setEmail(event.currentTarget.value)}
            className="h-10 rounded-md border border-input bg-background px-3 text-sm"
          />
        </label>

        <input type="hidden" name="callbackUrl" value={callbackUrl} />

        <Button type="submit" disabled={isSubmitting}>
          {isSubmitting ? "Sending link..." : "Send magic link"}
        </Button>
      </form>

      {submitted && (
        <p className="mt-4 text-sm text-muted-foreground">
          Sign-in link sent. Check your email and continue.
        </p>
      )}

      {errorMessage && (
        <p className="mt-4 text-sm text-destructive" role="alert">
          {errorMessage}
        </p>
      )}
    </>
  )
}
