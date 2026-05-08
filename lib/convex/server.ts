import { auth } from "@clerk/nextjs/server"
import { fetchMutation, fetchQuery } from "convex/nextjs"
import type {
  FunctionArgs,
  FunctionReference,
  FunctionReturnType,
} from "convex/server"
import { getFunctionName } from "convex/server"

const CONVEX_URL = process.env.NEXT_PUBLIC_CONVEX_URL

if (!CONVEX_URL) {
  throw new Error("NEXT_PUBLIC_CONVEX_URL is not set")
}

export const convexServer = {
  url: CONVEX_URL,
}

type PublicQueryRef = FunctionReference<"query", "public">
type PublicMutationRef = FunctionReference<"mutation", "public">

async function getConvexToken() {
  try {
    const { userId, getToken } = await auth()

    if (!userId) {
      return undefined
    }

    return (await getToken({ template: "convex" })) ?? undefined
  } catch {
    return undefined
  }
}

function formatConvexError(kind: "query" | "mutation", error: unknown) {
  if (error instanceof Error) {
    return new Error(`Convex ${kind} failed: ${error.message}`)
  }
  return new Error(`Convex ${kind} failed`)
}

function toMockPath(reference: FunctionReference<any, any>) {
  return getFunctionName(reference).replace(":", "/")
}

export async function createServerContext() {
  return convexServer
}

export async function runConvexQuery<Query extends PublicQueryRef>(
  query: Query,
  args: FunctionArgs<Query>
): Promise<FunctionReturnType<Query>> {
  try {
    const token = await getConvexToken()

    if (process.env.NODE_ENV === "test") {
      const response = await fetch(`${CONVEX_URL}/${toMockPath(query)}`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          ...(token ? { Authorization: `Bearer ${token}` } : {}),
        },
        body: JSON.stringify({ args }),
      })

      if (!response.ok) {
        throw new Error(await response.text())
      }

      return (await response.json()) as FunctionReturnType<Query>
    }

    return await fetchQuery(query, args, { token, url: CONVEX_URL })
  } catch (error) {
    throw formatConvexError("query", error)
  }
}

export async function runConvexMutation<Mutation extends PublicMutationRef>(
  mutation: Mutation,
  args: FunctionArgs<Mutation>
): Promise<FunctionReturnType<Mutation>> {
  try {
    const token = await getConvexToken()

    if (process.env.NODE_ENV === "test") {
      const response = await fetch(`${CONVEX_URL}/${toMockPath(mutation)}`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          ...(token ? { Authorization: `Bearer ${token}` } : {}),
        },
        body: JSON.stringify({ args }),
      })

      if (!response.ok) {
        throw new Error(await response.text())
      }

      return (await response.json()) as FunctionReturnType<Mutation>
    }

    return await fetchMutation(mutation, args, { token, url: CONVEX_URL })
  } catch (error) {
    throw formatConvexError("mutation", error)
  }
}

export async function convexQuery<Query extends PublicQueryRef>(
  query: Query,
  args: FunctionArgs<Query>
): Promise<FunctionReturnType<Query>> {
  return await runConvexQuery(query, args)
}

export async function convexMutation<Mutation extends PublicMutationRef>(
  mutation: Mutation,
  args: FunctionArgs<Mutation>
): Promise<FunctionReturnType<Mutation>> {
  return await runConvexMutation(mutation, args)
}
