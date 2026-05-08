import { getTikkieConfig } from "@/lib/integrations/tikkie/config"

type RequestMethod = "GET" | "POST"

type JsonObject = Record<string, unknown>

type TikkieRequestOptions = {
  method?: RequestMethod
  query?: Record<string, string | number | undefined>
  body?: unknown
}

export type TikkieCreatePaymentRequestInput = {
  amountInCents?: number
  description: string
  expiryDate: string
  referenceId?: string
}

export type TikkiePaymentRequest = {
  paymentRequestToken: string
  url: string
  amountInCents: number
  description: string
  referenceId?: string
  createdDateTime: string
  expiryDate: string
  status:
    | "OPEN"
    | "CLOSED"
    | "EXPIRED"
    | "MAX_YIELD_REACHED"
    | "MAX_SUCCESSFUL_PAYMENTS_REACHED"
  numberOfPayments?: number
  totalAmountPaidInCents?: number
}

export type TikkiePaymentListResponse = {
  payments: unknown[]
  totalElementCount: number
}

type TikkieErrorKind = "BAD_REQUEST" | "UNAUTHORIZED" | "FORBIDDEN" | "UPSTREAM"

export class TikkieApiError extends Error {
  status: number
  kind: TikkieErrorKind
  details: unknown

  constructor(status: number, message: string, details: unknown) {
    super(message)
    this.name = "TikkieApiError"
    this.status = status
    this.kind =
      status === 400
        ? "BAD_REQUEST"
        : status === 401
          ? "UNAUTHORIZED"
          : status === 403
            ? "FORBIDDEN"
            : "UPSTREAM"
    this.details = details
  }
}

function buildUrl(path: string, query?: TikkieRequestOptions["query"]) {
  const config = getTikkieConfig()

  if (!config.configured || !config.values.apiKey || !config.values.appToken) {
    throw new Error(
      `Tikkie configuration invalid: ${config.errors.join(", ") || "missing API credentials"}`
    )
  }

  const cleanPath = path.startsWith("/") ? path : `/${path}`
  const url = new URL(`${config.values.baseUrl}${cleanPath}`)

  if (query) {
    for (const [key, value] of Object.entries(query)) {
      if (value !== undefined) {
        url.searchParams.set(key, String(value))
      }
    }
  }

  return {
    url,
    headers: {
      "API-Key": config.values.apiKey,
      "X-App-Token": config.values.appToken,
    },
  }
}

function tryJson(value: string) {
  if (!value.trim()) {
    return null
  }

  try {
    return JSON.parse(value) as unknown
  } catch {
    return value
  }
}

function asObject(value: unknown): JsonObject {
  if (typeof value !== "object" || value === null || Array.isArray(value)) {
    return {}
  }

  return value as JsonObject
}

function firstErrorMessage(details: JsonObject) {
  const errors = details.errors
  if (!Array.isArray(errors) || errors.length === 0) {
    return null
  }

  const first = errors[0]
  if (typeof first !== "object" || first === null || Array.isArray(first)) {
    return null
  }

  const message = (first as JsonObject).message
  return typeof message === "string" ? message : null
}

const TIKKIE_FETCH_TIMEOUT_MS = Number(
  process.env.TIKKIE_FETCH_TIMEOUT_MS ?? 15_000
)

const TIKKIE_MAX_RETRIES = Number(process.env.TIKKIE_MAX_RETRIES ?? 2)

/** Methods safe to retry without side effects */
const RETRYABLE_METHODS = new Set(["GET", "HEAD", "OPTIONS"])

function isRetryableError(error: unknown): boolean {
  if (error instanceof DOMException && error.name === "AbortError") return true
  if (error instanceof TypeError) return true // network errors
  return false
}

function isRetryableStatus(status: number): boolean {
  return status >= 500 || status === 429
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms))
}

async function fetchWithTimeout(
  url: URL | string,
  init: RequestInit,
  timeoutMs: number
): Promise<Response> {
  const controller = new AbortController()
  const timer = setTimeout(() => controller.abort(), timeoutMs)

  try {
    const response = await fetch(url, { ...init, signal: controller.signal })
    clearTimeout(timer)
    return response
  } catch (error) {
    clearTimeout(timer)

    if (error instanceof DOMException && error.name === "AbortError") {
      throw new Error(`Tikkie request timed out after ${timeoutMs}ms`)
    }

    throw error
  }
}

async function tikkieFetch<T>(
  path: string,
  options: TikkieRequestOptions = {}
): Promise<T> {
  const { url, headers } = buildUrl(path, options.query)

  const method = options.method ?? "GET"
  const canRetry = RETRYABLE_METHODS.has(method)
  const maxAttempts = canRetry ? TIKKIE_MAX_RETRIES + 1 : 1

  let lastError: unknown = null

  for (let attempt = 1; attempt <= maxAttempts; attempt++) {
    try {
      const response = await fetchWithTimeout(
        url,
        {
          method,
          headers: {
            ...headers,
            Accept: "application/json",
            ...(options.body ? { "Content-Type": "application/json" } : {}),
          },
          body: options.body ? JSON.stringify(options.body) : undefined,
          cache: "no-store",
        },
        TIKKIE_FETCH_TIMEOUT_MS
      )

      if (
        !response.ok &&
        isRetryableStatus(response.status) &&
        attempt < maxAttempts
      ) {
        await sleep(500 * attempt)
        continue
      }

      const raw = await response.text()
      const payload = tryJson(raw)

      if (!response.ok) {
        const details = asObject(payload)
        const message =
          firstErrorMessage(details) ??
          (typeof details.message === "string"
            ? details.message
            : `Tikkie request failed (${response.status})`)

        throw new TikkieApiError(response.status, String(message), payload)
      }

      return payload as T
    } catch (error) {
      lastError = error

      if (error instanceof TikkieApiError) throw error

      if (isRetryableError(error) && attempt < maxAttempts) {
        await sleep(500 * attempt)
        continue
      }

      throw error
    }
  }

  throw lastError instanceof Error
    ? lastError
    : new Error("Tikkie request failed after retries")
}

export async function createPaymentRequest(
  input: TikkieCreatePaymentRequestInput
) {
  return tikkieFetch<TikkiePaymentRequest>("/paymentrequests", {
    method: "POST",
    body: {
      ...(typeof input.amountInCents === "number"
        ? { amountInCents: input.amountInCents }
        : {}),
      description: input.description,
      expiryDate: input.expiryDate,
      ...(input.referenceId ? { referenceId: input.referenceId } : {}),
    },
  })
}

export async function getPaymentRequest(paymentRequestToken: string) {
  return tikkieFetch<TikkiePaymentRequest>(
    `/paymentrequests/${encodeURIComponent(paymentRequestToken)}`
  )
}

export async function getPaymentRequestPayments(
  paymentRequestToken: string,
  pageNumber = 0,
  pageSize = 50
) {
  return tikkieFetch<TikkiePaymentListResponse>(
    `/paymentrequests/${encodeURIComponent(paymentRequestToken)}/payments`,
    {
      query: {
        pageNumber,
        pageSize,
      },
    }
  )
}

export type TikkieSubscriptionInput = {
  url: string
}

export type TikkieSubscriptionResponse = {
  subscriptionId: string
}

export async function subscribePaymentRequestNotifications(
  input: TikkieSubscriptionInput
) {
  return tikkieFetch<TikkieSubscriptionResponse>(
    "/paymentrequestssubscription",
    {
      method: "POST",
      body: {
        url: input.url,
      },
    }
  )
}
