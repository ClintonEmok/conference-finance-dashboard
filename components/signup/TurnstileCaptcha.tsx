"use client"

import { useEffect, useRef, useState } from "react"
import Script from "next/script"

type TurnstileWidget = {
  render: (
    container: HTMLElement,
    options: {
      sitekey: string
      callback: (token: string) => void
      "expired-callback"?: () => void
      "error-callback"?: () => void
      theme?: "light" | "dark" | "auto"
      size?: "normal" | "compact" | "flexible"
    }
  ) => number
  reset: (widgetId: number) => void
  remove: (widgetId: number) => void
}

declare global {
  interface Window {
    turnstile?: TurnstileWidget
  }
}

type TurnstileCaptchaProps = {
  siteKey: string
  token: string | null
  onTokenChange: (token: string | null) => void
}

export function TurnstileCaptcha({
  siteKey,
  token,
  onTokenChange,
}: TurnstileCaptchaProps) {
  const containerRef = useRef<HTMLDivElement | null>(null)
  const widgetIdRef = useRef<number | null>(null)
  const onTokenChangeRef = useRef(onTokenChange)
  const previousTokenRef = useRef<string | null>(token)
  const [scriptReady, setScriptReady] = useState(false)
  const [scriptFailed, setScriptFailed] = useState(false)

  useEffect(() => {
    onTokenChangeRef.current = onTokenChange
  }, [onTokenChange])

  useEffect(() => {
    if (
      previousTokenRef.current &&
      !token &&
      widgetIdRef.current !== null &&
      window.turnstile
    ) {
      window.turnstile.reset(widgetIdRef.current)
    }

    previousTokenRef.current = token
  }, [token])

  useEffect(() => {
    if (!scriptReady || !containerRef.current || widgetIdRef.current !== null) {
      return
    }

    if (!siteKey) {
      return
    }

    const widget = window.turnstile
    if (!widget) {
      return
    }

    widgetIdRef.current = widget.render(containerRef.current, {
      sitekey: siteKey,
      theme: "light",
      size: "flexible",
      callback: (nextToken) => {
        onTokenChangeRef.current(nextToken)
      },
      "expired-callback": () => {
        onTokenChangeRef.current(null)
        if (widgetIdRef.current !== null) {
          widget.reset(widgetIdRef.current)
        }
      },
      "error-callback": () => {
        onTokenChangeRef.current(null)
        if (widgetIdRef.current !== null) {
          widget.reset(widgetIdRef.current)
        }
      },
    })

    return () => {
      if (widgetIdRef.current !== null && window.turnstile) {
        window.turnstile.remove(widgetIdRef.current)
        widgetIdRef.current = null
      }
    }
  }, [scriptReady, siteKey])

  if (!siteKey) {
    return (
      <div className="rounded-md border border-destructive/30 bg-destructive/5 p-3 text-sm text-destructive">
        Captcha is not configured.
      </div>
    )
  }

  return (
    <div className="space-y-3">
      <Script
        src="https://challenges.cloudflare.com/turnstile/v0/api.js?render=explicit"
        strategy="afterInteractive"
        onLoad={() => setScriptReady(true)}
        onError={() => setScriptFailed(true)}
      />
      <div ref={containerRef} />
      {scriptFailed ? (
        <div className="rounded-md border border-destructive/30 bg-destructive/5 p-3 text-sm text-destructive">
          Captcha failed to load. Refresh the page and try again.
        </div>
      ) : null}
      {token ? (
        <p className="text-xs text-muted-foreground">
          Verification complete. You can submit your registration.
        </p>
      ) : (
        <p className="text-xs text-muted-foreground">
          Complete the verification challenge to continue.
        </p>
      )}
    </div>
  )
}
