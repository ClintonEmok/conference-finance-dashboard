"use client"

import { SignOutButton } from "@clerk/nextjs"

import { Button } from "@/components/ui/button"

type LogoutButtonProps = {
  className?: string
}

export function LogoutButton({ className }: LogoutButtonProps) {
  return (
    <SignOutButton redirectUrl="/">
      <Button type="button" variant="outline" size="sm" className={className}>
        Log out
      </Button>
    </SignOutButton>
  )
}
