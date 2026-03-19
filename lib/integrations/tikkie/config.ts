type ValidationResult = {
  configured: boolean
  errors: string[]
  metadata: {
    baseUrl: string
    hasApiKey: boolean
    keyPreview: string | null
    appTokenConfigured: boolean
  }
  values: {
    apiKey: string | null
    baseUrl: string
    appToken: string | null
  }
}

const DEFAULT_TIKKIE_BASE_URL = "https://api.tikkie.me"

function maskToken(token: string) {
  if (token.length <= 6) {
    return "***"
  }

  return `${token.slice(0, 4)}...${token.slice(-2)}`
}

function isLikelyTikkieKey(value: string) {
  return /^[A-Za-z0-9_\-]{20,}$/.test(value)
}

function isLikelyUuid(value: string) {
  return /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(
    value,
  )
}

export function getTikkieConfig(): ValidationResult {
  const errors: string[] = []

  const apiKey = process.env.TIKKIE_API_KEY?.trim() ?? ""
  const baseUrl = process.env.TIKKIE_BASE_URL?.trim() || DEFAULT_TIKKIE_BASE_URL
  const appToken = process.env.TIKKIE_APP_TOKEN?.trim() ?? ""

  if (!apiKey) {
    errors.push("TIKKIE_API_KEY is missing")
  } else if (!isLikelyTikkieKey(apiKey)) {
    errors.push("TIKKIE_API_KEY format appears invalid")
  }

  if (!appToken) {
    errors.push("TIKKIE_APP_TOKEN is missing")
  } else if (!isLikelyUuid(appToken)) {
    errors.push("TIKKIE_APP_TOKEN must be a UUID")
  }

  try {
    const parsed = new URL(baseUrl)
    if (!parsed.protocol.startsWith("http")) {
      errors.push("TIKKIE_BASE_URL must be an HTTP(S) URL")
    }
  } catch {
    errors.push("TIKKIE_BASE_URL must be a valid URL")
  }

  return {
    configured: errors.length === 0,
    errors,
    metadata: {
      baseUrl,
      hasApiKey: Boolean(apiKey),
      keyPreview: apiKey ? maskToken(apiKey) : null,
      appTokenConfigured: Boolean(appToken),
    },
    values: {
      apiKey: apiKey || null,
      baseUrl,
      appToken: appToken || null,
    },
  }
}
