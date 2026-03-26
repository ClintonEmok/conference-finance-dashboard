import { auth } from "@clerk/nextjs/server"

const CONVEX_URL = process.env.NEXT_PUBLIC_CONVEX_URL!

if (!CONVEX_URL) {
  throw new Error("NEXT_PUBLIC_CONVEX_URL is not set")
}

export const convexServer = {
  url: CONVEX_URL,
}

function toConvexFunctionPath(path: string) {
  if (path.includes(":")) {
    return path
  }

  const lastSlashIndex = path.lastIndexOf("/")

  if (lastSlashIndex === -1) {
    return path
  }

  return `${path.slice(0, lastSlashIndex)}:${path.slice(lastSlashIndex + 1)}`
}

async function getConvexRequestHeaders() {
  const headers: Record<string, string> = {
    "Content-Type": "application/json",
  }

  try {
    const { userId, getToken } = await auth()

    if (!userId) {
      return headers
    }

    const token = await getToken({ template: "convex" })

    if (token) {
      headers.Authorization = `Bearer ${token}`
    }
  } catch {
    // Allow unauthenticated server contexts, tests, and webhooks to keep working.
  }

  return headers
}

export async function createServerContext() {
  return convexServer
}

export async function convexQuery<
  Args extends Record<string, unknown>,
  Response,
>(path: string, args: Args): Promise<Response> {
  const response = await fetch(`${CONVEX_URL}/api/query`, {
    method: "POST",
    headers: await getConvexRequestHeaders(),
    body: JSON.stringify({
      path: toConvexFunctionPath(path),
      args,
      format: "json",
    }),
  })

  if (!response.ok) {
    const error = await response.text()
    throw new Error(
      `Convex query failed (${response.status} ${response.statusText}): ${error}`
    )
  }

  const payload = (await response.json()) as
    | { status: "success"; value: Response }
    | { status: "error"; errorMessage: string }

  if (payload.status === "error") {
    throw new Error(`Convex query failed: ${payload.errorMessage}`)
  }

  return payload.value
}

export async function convexMutation<
  Args extends Record<string, unknown>,
  Response,
>(path: string, args: Args): Promise<Response> {
  const response = await fetch(`${CONVEX_URL}/api/mutation`, {
    method: "POST",
    headers: await getConvexRequestHeaders(),
    body: JSON.stringify({
      path: toConvexFunctionPath(path),
      args,
      format: "json",
    }),
  })

  if (!response.ok) {
    const error = await response.text()
    throw new Error(
      `Convex mutation failed (${response.status} ${response.statusText}): ${error}`
    )
  }

  const payload = (await response.json()) as
    | { status: "success"; value: Response }
    | { status: "error"; errorMessage: string }

  if (payload.status === "error") {
    throw new Error(`Convex mutation failed: ${payload.errorMessage}`)
  }

  return payload.value
}
