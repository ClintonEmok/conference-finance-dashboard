const CONVEX_URL = process.env.NEXT_PUBLIC_CONVEX_URL!

if (!CONVEX_URL) {
  throw new Error("NEXT_PUBLIC_CONVEX_URL is not set")
}

export const convexServer = {
  url: CONVEX_URL,
}

export async function createServerContext() {
  return convexServer
}

export async function convexQuery<
  Args extends Record<string, unknown>,
  Response,
>(path: string, args: Args): Promise<Response> {
  const response = await fetch(`${CONVEX_URL}/${path}`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
    },
    body: JSON.stringify({ args }),
  })

  if (!response.ok) {
    const error = await response.text()
    throw new Error(`Convex query failed: ${error}`)
  }

  return response.json()
}

export async function convexMutation<
  Args extends Record<string, unknown>,
  Response,
>(path: string, args: Args): Promise<Response> {
  const response = await fetch(`${CONVEX_URL}/${path}`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
    },
    body: JSON.stringify({ args }),
  })

  if (!response.ok) {
    const error = await response.text()
    throw new Error(`Convex mutation failed: ${error}`)
  }

  return response.json()
}
