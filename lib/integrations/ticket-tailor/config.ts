type ValidationResult = {
  configured: boolean
  errors: string[]
  metadata: {
    baseUrl: string
    hasApiKey: boolean
    keyPreview: string | null
  }
  values: {
    apiKey: string | null
    baseUrl: string
  }
}

const DEFAULT_TICKET_TAILOR_BASE_URL = "https://api.tickettailor.com/v1"

function maskToken(token: string) {
  if (token.length <= 6) {
    return "***"
  }

  return `${token.slice(0, 4)}...${token.slice(-2)}`
}

function isLikelyTicketTailorKey(value: string) {
  return /^[A-Za-z0-9_\-]{16,}$/.test(value)
}

export function getTicketTailorConfig(): ValidationResult {
  const errors: string[] = []

  const apiKey = process.env.TICKET_TAILOR_API_KEY?.trim() ?? ""
  const baseUrl =
    process.env.TICKET_TAILOR_BASE_URL?.trim() || DEFAULT_TICKET_TAILOR_BASE_URL

  if (!apiKey) {
    errors.push("TICKET_TAILOR_API_KEY is missing")
  } else if (!isLikelyTicketTailorKey(apiKey)) {
    errors.push("TICKET_TAILOR_API_KEY format appears invalid")
  }

  try {
    const parsed = new URL(baseUrl)
    if (!parsed.protocol.startsWith("http")) {
      errors.push("TICKET_TAILOR_BASE_URL must be an HTTP(S) URL")
    }
  } catch {
    errors.push("TICKET_TAILOR_BASE_URL must be a valid URL")
  }

  return {
    configured: errors.length === 0,
    errors,
    metadata: {
      baseUrl,
      hasApiKey: Boolean(apiKey),
      keyPreview: apiKey ? maskToken(apiKey) : null,
    },
    values: {
      apiKey: apiKey || null,
      baseUrl,
    },
  }
}
