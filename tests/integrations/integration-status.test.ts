import { afterEach, beforeEach, describe, expect, it, vi } from "vitest"

// Set valid env before module evaluation
vi.hoisted(() => {
  process.env.TICKET_TAILOR_API_KEY = "sk_test_1234567890123456"
  process.env.TICKET_TAILOR_BASE_URL = "https://api.tickettailor.com/v1"
  process.env.TIKKIE_API_KEY = "tikkie_api_key_valid_1234567890"
  process.env.TIKKIE_APP_TOKEN = "550e8400-e29b-41d4-a716-446655440000"
  process.env.TIKKIE_BASE_URL = "https://api.tikkie.me"
})

import { getIntegrationStatus } from "@/lib/integrations/status"

const VALID_TT_API_KEY = "sk_test_1234567890123456"
const VALID_TIKKIE_API_KEY = "tikkie_api_key_valid_1234567890"
const VALID_TIKKIE_APP_TOKEN = "550e8400-e29b-41d4-a716-446655440000"

function setValidEnv() {
  process.env.TICKET_TAILOR_API_KEY = VALID_TT_API_KEY
  process.env.TICKET_TAILOR_BASE_URL = "https://api.tickettailor.com/v1"
  process.env.TIKKIE_API_KEY = VALID_TIKKIE_API_KEY
  process.env.TIKKIE_APP_TOKEN = VALID_TIKKIE_APP_TOKEN
  process.env.TIKKIE_BASE_URL = "https://api.tikkie.me"
}

function clearEnv() {
  delete process.env.TICKET_TAILOR_API_KEY
  delete process.env.TICKET_TAILOR_BASE_URL
  delete process.env.TIKKIE_API_KEY
  delete process.env.TIKKIE_APP_TOKEN
  delete process.env.TIKKIE_BASE_URL
  delete process.env.INTEGRATION_PING_TIMEOUT_MS
}

function mockFetch(statusCode: number, ok: boolean) {
  vi.stubGlobal(
    "fetch",
    vi.fn(async () => ({
      ok,
      status: statusCode,
      json: async () => ({}),
      text: async () => "",
    }))
  )
}

describe("getIntegrationStatus", () => {
  beforeEach(() => {
    setValidEnv()
  })

  afterEach(() => {
    clearEnv()
    vi.restoreAllMocks()
  })

  it("returns misconfigured for Ticket Tailor when API key is missing", async () => {
    delete process.env.TICKET_TAILOR_API_KEY
    mockFetch(200, true)

    const result = await getIntegrationStatus()

    const tt = result.providers.find((p) => p.provider === "ticket-tailor")!
    expect(tt.state).toBe("misconfigured")
    expect(tt.configured).toBe(false)
    expect(tt.validationErrors.length).toBeGreaterThan(0)
  })

  it("returns misconfigured for Tikkie when API key is missing", async () => {
    delete process.env.TIKKIE_API_KEY
    mockFetch(200, true)

    const result = await getIntegrationStatus()

    const tikkie = result.providers.find((p) => p.provider === "tikkie")!
    expect(tikkie.state).toBe("misconfigured")
    expect(tikkie.configured).toBe(false)
  })

  it("returns configured when both integrations are reachable", async () => {
    mockFetch(200, true)

    const result = await getIntegrationStatus()

    for (const provider of result.providers) {
      expect(provider.state).toBe("configured")
      expect(provider.configured).toBe(true)
      expect(provider.connectivity.reachable).toBe(true)
      expect(provider.connectivity.ok).toBe(true)
    }
  })

  it("returns configured when the provider returns 401 (auth endpoint expected)", async () => {
    mockFetch(401, false)

    const result = await getIntegrationStatus()

    for (const provider of result.providers) {
      expect(provider.state).toBe("configured")
      expect(provider.connectivity.statusCode).toBe(401)
    }
  })

  it("returns configured when the provider returns 403 (auth endpoint expected)", async () => {
    mockFetch(403, false)

    const result = await getIntegrationStatus()

    for (const provider of result.providers) {
      expect(provider.state).toBe("configured")
      expect(provider.connectivity.statusCode).toBe(403)
    }
  })

  it("returns unreachable when the provider returns a server error", async () => {
    mockFetch(500, false)

    const result = await getIntegrationStatus()

    for (const provider of result.providers) {
      expect(provider.state).toBe("unreachable")
      expect(provider.connectivity.reachable).toBe(true)
      expect(provider.connectivity.ok).toBe(false)
    }
  })

  it("returns unreachable when the network request fails", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(async () => {
        throw new Error("Network error")
      })
    )

    const result = await getIntegrationStatus()

    for (const provider of result.providers) {
      expect(provider.state).toBe("unreachable")
      expect(provider.connectivity.reachable).toBe(false)
      expect(provider.connectivity.message).toContain("Network error")
    }
  })

  it("skips connectivity check for misconfigured integrations", async () => {
    delete process.env.TICKET_TAILOR_API_KEY
    const fetchSpy = vi.fn(async () => ({ ok: true, status: 200, json: async () => ({}), text: async () => "" }))
    vi.stubGlobal("fetch", fetchSpy)

    const result = await getIntegrationStatus()

    const tt = result.providers.find((p) => p.provider === "ticket-tailor")!
    expect(tt.connectivity.attempted).toBe(false)
  })

  it("includes both ticket-tailor and tikkie providers in the response", async () => {
    mockFetch(200, true)

    const result = await getIntegrationStatus()

    const providerIds = result.providers.map((p) => p.provider)
    expect(providerIds).toContain("ticket-tailor")
    expect(providerIds).toContain("tikkie")
  })

  it("returns a generatedAt ISO timestamp", async () => {
    mockFetch(200, true)

    const result = await getIntegrationStatus()

    expect(result.generatedAt).toMatch(/^\d{4}-\d{2}-\d{2}T/)
  })

  it("exposes diagnostics metadata for each provider", async () => {
    mockFetch(200, true)

    const result = await getIntegrationStatus()

    const tt = result.providers.find((p) => p.provider === "ticket-tailor")!
    expect(tt.diagnostics).toHaveProperty("baseUrl")
    expect(tt.diagnostics).toHaveProperty("apiKeyConfigured")

    const tikkie = result.providers.find((p) => p.provider === "tikkie")!
    expect(tikkie.diagnostics).toHaveProperty("appTokenConfigured")
  })
})
