import { getTikkieConfig } from "@/lib/integrations/tikkie/config"

type RequestMethod = "GET" | "POST"

type JsonObject = Record<string, unknown>

type TikkieRequestOptions = {
  method?: RequestMethod
  query?: Record<string, string | number | undefined>
  body?: unknown
}

export type TikkieCreatePaymentRequestInput = {
  amountInCents: number
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
  status: "OPEN" | "CLOSED" | "EXPIRED" | "MAX_YIELD_REACHED" | "MAX_SUCCESSFUL_PAYMENTS_REACHED"
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
    throw new Error(`Tikkie configuration invalid: ${config.errors.join(", ") || "missing API credentials"}`)
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

async function tikkieFetch<T>(path: string, options: TikkieRequestOptions = {}): Promise<T> {
  const { url, headers } = buildUrl(path, options.query)

  const response = await fetch(url, {
    method: options.method ?? "GET",
    headers: {
      ...headers,
      Accept: "application/json",
      ...(options.body ? { "Content-Type": "application/json" } : {}),
    },
    body: options.body ? JSON.stringify(options.body) : undefined,
    cache: "no-store",
  })

  const raw = await response.text()
  const payload = tryJson(raw)

  if (!response.ok) {
    const details = asObject(payload)
    const message =
      firstErrorMessage(details) ??
      (typeof details.message === "string" ? details.message : `Tikkie request failed (${response.status})`)

    throw new TikkieApiError(response.status, String(message), payload)
  }

  return payload as T
}

export async function createPaymentRequest(input: TikkieCreatePaymentRequestInput) {
  return tikkieFetch<TikkiePaymentRequest>("/paymentrequests", {
    method: "POST",
    body: {
      amountInCents: input.amountInCents,
      description: input.description,
      expiryDate: input.expiryDate,
      ...(input.referenceId ? { referenceId: input.referenceId } : {}),
    },
  })
}

export async function getPaymentRequest(paymentRequestToken: string) {
  return tikkieFetch<TikkiePaymentRequest>(
    `/paymentrequests/${encodeURIComponent(paymentRequestToken)}`,
  )
}

export async function getPaymentRequestPayments(
  paymentRequestToken: string,
  pageNumber = 0,
  pageSize = 50,
) {
  return tikkieFetch<TikkiePaymentListResponse>(
    `/paymentrequests/${encodeURIComponent(paymentRequestToken)}/payments`,
    {
      query: {
        pageNumber,
        pageSize,
      },
    },
  )
}
