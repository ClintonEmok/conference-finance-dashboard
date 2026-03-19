"use client"

import { useRouter } from "next/navigation"

import { Button } from "@/components/ui/button"
import { authClient } from "@/lib/auth-client"

type LogoutButtonProps = {
  className?: string
}

export function LogoutButton({ className }: LogoutButtonProps) {
  const router = useRouter()

  async function handleClick() {
    await authClient.signOut()
    router.push("/login")
    router.refresh()
  }

  return (
    <Button type="button" variant="outline" size="sm" className={className} onClick={handleClick}>
      Log out
    </Button>
  )
}
