"use client"

import { SignOutButton } from "@clerk/nextjs"
import { LogOut } from "lucide-react"

import { Button } from "@/components/ui/button"
import { cn } from "@/lib/utils"

type LogoutButtonProps = {
  className?: string
  showIconOnly?: boolean
}

export function LogoutButton({ className, showIconOnly }: LogoutButtonProps) {
  return (
    <SignOutButton redirectUrl="/">
      <Button
        type="button"
        variant="outline"
        size="sm"
        className={cn(className, showIconOnly && "p-0")}
      >
        {showIconOnly ? <LogOut className="size-4" /> : "Log out"}
      </Button>
    </SignOutButton>
  )
}
