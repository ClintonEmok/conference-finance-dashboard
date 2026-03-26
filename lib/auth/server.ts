import { auth, currentUser } from "@clerk/nextjs/server"
import { NextResponse } from "next/server"

export function unauthorizedJson() {
  return NextResponse.json(
    {
      error: {
        code: "UNAUTHORIZED",
        message: "Authentication required",
      },
    },
    { status: 401 }
  )
}

export async function requireApiUser() {
  const { userId } = await auth()

  if (!userId) {
    return unauthorizedJson()
  }

  return { userId }
}

export async function requirePageUser(returnBackUrl: string) {
  const { redirectToSignIn, userId } = await auth()

  if (!userId) {
    return redirectToSignIn({ returnBackUrl })
  }

  const user = await currentUser()
  const email =
    user?.primaryEmailAddress?.emailAddress ??
    user?.emailAddresses[0]?.emailAddress ??
    ""

  return {
    userId,
    email,
  }
}
