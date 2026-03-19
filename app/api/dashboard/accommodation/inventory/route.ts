import { headers } from "next/headers"
import { NextResponse } from "next/server"

import { auth } from "@/lib/auth"
import { listAccommodationInventory } from "@/lib/domain/accommodation/inventory"

function unauthorized() {
  return NextResponse.json(
    {
      error: {
        code: "UNAUTHORIZED",
        message: "Authentication required",
      },
    },
    { status: 401 },
  )
}

export async function GET() {
  const session = await auth.api.getSession({
    headers: await headers(),
  })

  if (!session) {
    return unauthorized()
  }

  const inventory = await listAccommodationInventory()

  return NextResponse.json(inventory)
}
