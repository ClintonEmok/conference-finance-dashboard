import { NextResponse } from "next/server"

import { requireApiUser } from "@/lib/auth/server"
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
  const authResult = await requireApiUser()

  if (authResult instanceof NextResponse) {
    return authResult
  }

  const inventory = await listAccommodationInventory()

  return NextResponse.json(inventory)
}
