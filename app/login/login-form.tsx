"use client"

import { FormEvent, useState } from "react"
import { useRouter } from "next/navigation"

import { Button } from "@/components/ui/button"
import { authClient } from "@/lib/auth-client"

type LoginFormProps = {
  callbackUrl: string
}

type AuthMode = "signin" | "signup"

export function LoginForm({ callbackUrl }: LoginFormProps) {
  const router = useRouter()
  const [mode, setMode] = useState<AuthMode>("signin")
  const [name, setName] = useState("")
  const [email, setEmail] = useState("")
  const [password, setPassword] = useState("")
  const [errorMessage, setErrorMessage] = useState<string | null>(null)
  const [successMessage, setSuccessMessage] = useState<string | null>(null)
  const [isSubmitting, setIsSubmitting] = useState(false)

  async function onSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    setErrorMessage(null)
    setSuccessMessage(null)
    setIsSubmitting(true)

    const normalizedName = name.trim()
    const normalizedEmail = email.trim()

    if (!normalizedEmail) {
      setErrorMessage("Email is required")
      setIsSubmitting(false)
      return
    }

    if (!password) {
      setErrorMessage("Password is required")
      setIsSubmitting(false)
      return
    }

    if (mode === "signup") {
      if (!normalizedName) {
        setErrorMessage("Name is required")
        setIsSubmitting(false)
        return
      }

      const { error } = await authClient.signUp.email(
        {
          name: normalizedName,
          email: normalizedEmail,
          password,
          callbackURL: callbackUrl,
        },
        {
          onSuccess: () => {
            router.push(callbackUrl)
            router.refresh()
          },
        },
      )

      if (error) {
        setErrorMessage(error.message ?? "Unable to create account. Please try again.")
        setIsSubmitting(false)
        return
      }

      setSuccessMessage("Account created. Redirecting...")
      setIsSubmitting(false)
      return
    }

    const { error } = await authClient.signIn.email(
      {
        email: normalizedEmail,
        password,
        callbackURL: callbackUrl,
      },
      {
        onSuccess: () => {
          router.push(callbackUrl)
          router.refresh()
        },
      },
    )

    if (error) {
      setErrorMessage(error.message ?? "Unable to sign in. Please check your credentials.")
      setIsSubmitting(false)
      return
    }

    setSuccessMessage("Signed in. Redirecting...")
    setIsSubmitting(false)
  }

  return (
    <>
      <div className="mt-6 grid grid-cols-2 gap-2 rounded-md bg-muted p-1 text-sm">
        <button
          type="button"
          onClick={() => {
            setMode("signin")
            setErrorMessage(null)
            setSuccessMessage(null)
          }}
          className={`rounded-sm px-3 py-2 transition ${
            mode === "signin" ? "bg-background shadow-sm" : "text-muted-foreground"
          }`}
        >
          Sign in
        </button>
        <button
          type="button"
          onClick={() => {
            setMode("signup")
            setErrorMessage(null)
            setSuccessMessage(null)
          }}
          className={`rounded-sm px-3 py-2 transition ${
            mode === "signup" ? "bg-background shadow-sm" : "text-muted-foreground"
          }`}
        >
          Create account
        </button>
      </div>

      <form className="mt-6 flex flex-col gap-4" onSubmit={onSubmit}>
        {mode === "signup" && (
          <label className="flex flex-col gap-2 text-sm" htmlFor="name">
            Full name
            <input
              id="name"
              name="name"
              type="text"
              autoComplete="name"
              value={name}
              onChange={(event) => setName(event.currentTarget.value)}
              className="h-10 rounded-md border border-input bg-background px-3 text-sm"
            />
          </label>
        )}

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

        <label className="flex flex-col gap-2 text-sm" htmlFor="password">
          Password
          <input
            id="password"
            name="password"
            type="password"
            autoComplete={mode === "signup" ? "new-password" : "current-password"}
            required
            minLength={8}
            value={password}
            onChange={(event) => setPassword(event.currentTarget.value)}
            className="h-10 rounded-md border border-input bg-background px-3 text-sm"
          />
        </label>

        <input type="hidden" name="callbackUrl" value={callbackUrl} />

        <Button type="submit" disabled={isSubmitting}>
          {isSubmitting
            ? mode === "signup"
              ? "Creating account..."
              : "Signing in..."
            : mode === "signup"
              ? "Create account"
              : "Sign in"}
        </Button>
      </form>

      {successMessage && (
        <p className="mt-4 text-sm text-muted-foreground" role="status">
          {successMessage}
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
