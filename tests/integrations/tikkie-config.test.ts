import { afterEach, beforeEach, describe, expect, it } from "vitest"

import { getTikkieConfig } from "@/lib/integrations/tikkie/config"

const VALID_API_KEY = "tikkie_api_key_valid_1234567890"
const VALID_APP_TOKEN = "550e8400-e29b-41d4-a716-446655440000"
const VALID_BASE_URL = "https://api.tikkie.me"

function setEnv(overrides: Partial<Record<string, string | undefined>> = {}) {
  const defaults: Record<string, string> = {
    TIKKIE_API_KEY: VALID_API_KEY,
    TIKKIE_APP_TOKEN: VALID_APP_TOKEN,
    TIKKIE_BASE_URL: VALID_BASE_URL,
  }
  const merged = { ...defaults, ...overrides }
  for (const [key, value] of Object.entries(merged)) {
    if (value === undefined) {
      delete process.env[key]
    } else {
      process.env[key] = value
    }
  }
}

describe("getTikkieConfig", () => {
  beforeEach(() => {
    setEnv()
    delete process.env.TIKKIE_SUBSCRIPTION_SETUP_ENABLED
    delete process.env.TIKKIE_WEBHOOK_CALLBACK_URL
  })

  afterEach(() => {
    delete process.env.TIKKIE_API_KEY
    delete process.env.TIKKIE_APP_TOKEN
    delete process.env.TIKKIE_BASE_URL
    delete process.env.TIKKIE_SUBSCRIPTION_SETUP_ENABLED
    delete process.env.TIKKIE_WEBHOOK_CALLBACK_URL
  })

  it("returns configured:true when all required values are valid", () => {
    const result = getTikkieConfig()

    expect(result.configured).toBe(true)
    expect(result.errors).toHaveLength(0)
    expect(result.values.apiKey).toBe(VALID_API_KEY)
    expect(result.values.appToken).toBe(VALID_APP_TOKEN)
    expect(result.values.baseUrl).toBe(VALID_BASE_URL)
  })

  it("returns configured:false when API key is missing", () => {
    setEnv({ TIKKIE_API_KEY: undefined })

    const result = getTikkieConfig()

    expect(result.configured).toBe(false)
    expect(result.errors).toContain("TIKKIE_API_KEY is missing")
    expect(result.metadata.hasApiKey).toBe(false)
    expect(result.metadata.keyPreview).toBeNull()
  })

  it("returns configured:false when API key is too short", () => {
    setEnv({ TIKKIE_API_KEY: "shortkey" })

    const result = getTikkieConfig()

    expect(result.configured).toBe(false)
    expect(result.errors).toContain("TIKKIE_API_KEY format appears invalid")
  })

  it("returns configured:false when app token is missing", () => {
    setEnv({ TIKKIE_APP_TOKEN: undefined })

    const result = getTikkieConfig()

    expect(result.configured).toBe(false)
    expect(result.errors).toContain("TIKKIE_APP_TOKEN is missing")
    expect(result.metadata.appTokenConfigured).toBe(false)
  })

  it("returns configured:false when app token is not a UUID", () => {
    setEnv({ TIKKIE_APP_TOKEN: "not-a-uuid-token-string" })

    const result = getTikkieConfig()

    expect(result.configured).toBe(false)
    expect(result.errors).toContain("TIKKIE_APP_TOKEN must be a UUID")
  })

  it("returns configured:false when base URL is not a valid URL", () => {
    setEnv({ TIKKIE_BASE_URL: "definitely-not-a-url" })

    const result = getTikkieConfig()

    expect(result.configured).toBe(false)
    expect(result.errors).toContain("TIKKIE_BASE_URL must be a valid URL")
  })

  it("returns configured:false when base URL has a non-HTTP protocol", () => {
    setEnv({ TIKKIE_BASE_URL: "ftp://api.tikkie.me" })

    const result = getTikkieConfig()

    expect(result.configured).toBe(false)
    expect(result.errors).toContain("TIKKIE_BASE_URL must be an HTTP(S) URL")
  })

  it("falls back to default base URL when TIKKIE_BASE_URL is not set", () => {
    setEnv({ TIKKIE_BASE_URL: undefined })

    const result = getTikkieConfig()

    expect(result.values.baseUrl).toContain("tikkie.me")
    expect(result.configured).toBe(true)
  })

  it("accepts HTTPS as a valid base URL", () => {
    setEnv({ TIKKIE_BASE_URL: "https://sandbox.api.tikkie.me" })

    const result = getTikkieConfig()

    expect(result.configured).toBe(true)
    expect(result.values.baseUrl).toBe("https://sandbox.api.tikkie.me")
  })

  it("does not add subscription callback errors when subscription setup is disabled", () => {
    setEnv()
    process.env.TIKKIE_SUBSCRIPTION_SETUP_ENABLED = "false"

    const result = getTikkieConfig()

    expect(result.configured).toBe(true)
    expect(result.values.subscriptionSetupEnabled).toBe(false)
    expect(result.errors).toHaveLength(0)
  })

  it("requires webhook callback URL when subscription setup is enabled", () => {
    setEnv()
    process.env.TIKKIE_SUBSCRIPTION_SETUP_ENABLED = "true"

    const result = getTikkieConfig()

    expect(result.configured).toBe(false)
    expect(result.errors).toContain(
      "TIKKIE_WEBHOOK_CALLBACK_URL is required when TIKKIE_SUBSCRIPTION_SETUP_ENABLED is true"
    )
  })

  it("returns configured:false when callback URL is invalid and subscription is enabled", () => {
    setEnv()
    process.env.TIKKIE_SUBSCRIPTION_SETUP_ENABLED = "true"
    process.env.TIKKIE_WEBHOOK_CALLBACK_URL = "not-a-url"

    const result = getTikkieConfig()

    expect(result.configured).toBe(false)
    expect(result.errors).toContain("TIKKIE_WEBHOOK_CALLBACK_URL must be a valid URL")
  })

  it("returns configured:false when callback URL has non-HTTP protocol", () => {
    setEnv()
    process.env.TIKKIE_SUBSCRIPTION_SETUP_ENABLED = "true"
    process.env.TIKKIE_WEBHOOK_CALLBACK_URL = "ftp://example.com/webhook"

    const result = getTikkieConfig()

    expect(result.configured).toBe(false)
    expect(result.errors).toContain("TIKKIE_WEBHOOK_CALLBACK_URL must be an HTTP(S) URL")
  })

  it("returns configured:true when subscription is enabled with a valid callback URL", () => {
    setEnv()
    process.env.TIKKIE_SUBSCRIPTION_SETUP_ENABLED = "true"
    process.env.TIKKIE_WEBHOOK_CALLBACK_URL = "https://example.com/webhooks/tikkie"

    const result = getTikkieConfig()

    expect(result.configured).toBe(true)
    expect(result.values.subscriptionSetupEnabled).toBe(true)
    expect(result.values.webhookCallbackUrl).toBe("https://example.com/webhooks/tikkie")
    expect(result.metadata.hasWebhookCallbackUrl).toBe(true)
  })

  it("exposes a masked API key preview", () => {
    const result = getTikkieConfig()

    expect(result.metadata.keyPreview).toBeTruthy()
    expect(result.metadata.keyPreview).toContain("...")
    expect(result.metadata.keyPreview).not.toContain(VALID_API_KEY)
  })

  it("masks short API keys with ***", () => {
    setEnv({ TIKKIE_API_KEY: "abc" })

    const result = getTikkieConfig()

    expect(result.metadata.keyPreview).toBe("***")
  })

  it("values.apiKey is null when API key is missing", () => {
    setEnv({ TIKKIE_API_KEY: undefined })

    const result = getTikkieConfig()

    expect(result.values.apiKey).toBeNull()
  })

  it("values.appToken is null when app token is missing", () => {
    setEnv({ TIKKIE_APP_TOKEN: undefined })

    const result = getTikkieConfig()

    expect(result.values.appToken).toBeNull()
  })
})
