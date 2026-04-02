import { afterEach, beforeEach, describe, expect, it } from "vitest"

import { getTicketTailorConfig } from "@/lib/integrations/ticket-tailor/config"

const VALID_API_KEY = "sk_test_1234567890123456"
const VALID_BASE_URL = "https://api.tickettailor.com/v1"

function setEnv(overrides: Partial<Record<string, string | undefined>> = {}) {
  const defaults: Record<string, string> = {
    TICKET_TAILOR_API_KEY: VALID_API_KEY,
    TICKET_TAILOR_BASE_URL: VALID_BASE_URL,
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

describe("getTicketTailorConfig", () => {
  beforeEach(() => {
    setEnv()
  })

  afterEach(() => {
    delete process.env.TICKET_TAILOR_API_KEY
    delete process.env.TICKET_TAILOR_BASE_URL
  })

  it("returns configured:true when all required values are valid", () => {
    const result = getTicketTailorConfig()

    expect(result.configured).toBe(true)
    expect(result.errors).toHaveLength(0)
    expect(result.values.apiKey).toBe(VALID_API_KEY)
    expect(result.values.baseUrl).toBe(VALID_BASE_URL)
  })

  it("returns configured:false when API key is missing", () => {
    setEnv({ TICKET_TAILOR_API_KEY: undefined })

    const result = getTicketTailorConfig()

    expect(result.configured).toBe(false)
    expect(result.errors).toContain("TICKET_TAILOR_API_KEY is missing")
    expect(result.metadata.hasApiKey).toBe(false)
    expect(result.metadata.keyPreview).toBeNull()
  })

  it("returns configured:false when API key is an empty string", () => {
    setEnv({ TICKET_TAILOR_API_KEY: "   " })

    const result = getTicketTailorConfig()

    expect(result.configured).toBe(false)
    expect(result.errors).toContain("TICKET_TAILOR_API_KEY is missing")
  })

  it("returns configured:false when API key format is too short", () => {
    setEnv({ TICKET_TAILOR_API_KEY: "tooshort" })

    const result = getTicketTailorConfig()

    expect(result.configured).toBe(false)
    expect(result.errors).toContain("TICKET_TAILOR_API_KEY format appears invalid")
  })

  it("returns configured:false when base URL is not a valid URL", () => {
    setEnv({ TICKET_TAILOR_BASE_URL: "not-a-url" })

    const result = getTicketTailorConfig()

    expect(result.configured).toBe(false)
    expect(result.errors).toContain("TICKET_TAILOR_BASE_URL must be a valid URL")
  })

  it("returns configured:false when base URL uses a non-HTTP protocol", () => {
    setEnv({ TICKET_TAILOR_BASE_URL: "ftp://api.tickettailor.com/v1" })

    const result = getTicketTailorConfig()

    expect(result.configured).toBe(false)
    expect(result.errors).toContain("TICKET_TAILOR_BASE_URL must be an HTTP(S) URL")
  })

  it("falls back to default base URL when TICKET_TAILOR_BASE_URL is not set", () => {
    setEnv({ TICKET_TAILOR_BASE_URL: undefined })

    const result = getTicketTailorConfig()

    expect(result.values.baseUrl).toContain("api.tickettailor.com")
    expect(result.configured).toBe(true)
  })

  it("appends /v1 to tickettailor.com base URL that is missing a version prefix", () => {
    setEnv({ TICKET_TAILOR_BASE_URL: "https://api.tickettailor.com" })

    const result = getTicketTailorConfig()

    expect(result.values.baseUrl).toBe("https://api.tickettailor.com/v1")
    expect(result.configured).toBe(true)
  })

  it("strips trailing slashes from the base URL", () => {
    setEnv({ TICKET_TAILOR_BASE_URL: "https://api.tickettailor.com/v1/" })

    const result = getTicketTailorConfig()

    expect(result.values.baseUrl).not.toMatch(/\/$/)
  })

  it("exposes a masked key preview", () => {
    setEnv({ TICKET_TAILOR_API_KEY: "sk_test_abcdefghijklmnop" })

    const result = getTicketTailorConfig()

    expect(result.metadata.keyPreview).toBeTruthy()
    expect(result.metadata.keyPreview).toContain("...")
    expect(result.metadata.keyPreview).not.toContain("sk_test_abcdefghijklmnop")
  })

  it("masks short keys with ***", () => {
    // A valid-format key with length <= 6 is masked with ***
    // Use a deliberately short value to hit the short-mask branch
    setEnv({ TICKET_TAILOR_API_KEY: "abc" })

    const result = getTicketTailorConfig()

    // Short key won't pass validation but the preview should still be set
    expect(result.metadata.keyPreview).toBe("***")
  })

  it("exposes metadata.baseUrl in diagnostics", () => {
    const result = getTicketTailorConfig()

    expect(result.metadata.baseUrl).toBe(VALID_BASE_URL)
    expect(result.metadata.hasApiKey).toBe(true)
  })

  it("values.apiKey is null when the key is missing", () => {
    setEnv({ TICKET_TAILOR_API_KEY: undefined })

    const result = getTicketTailorConfig()

    expect(result.values.apiKey).toBeNull()
  })
})
