"use client"

import { useEffect, useState } from "react"
import Image from "next/image"
import { cn } from "@/lib/utils"

interface SignupHeaderProps {
  eventName: string
  stepTitle?: string
}

export function SignupHeader({ eventName, stepTitle }: SignupHeaderProps) {
  const [isScrolled, setIsScrolled] = useState(false)

  useEffect(() => {
    const handleScroll = () => {
      setIsScrolled(window.scrollY > 20)
    }
    window.addEventListener("scroll", handleScroll)
    return () => window.removeEventListener("scroll", handleScroll)
  }, [])

  return (
    <header
      className={cn(
        "sticky top-0 z-50 w-full transition-all duration-300",
        isScrolled
          ? "bg-background/80 py-3 shadow-lg backdrop-blur-xl ring-1 ring-border/50"
          : "bg-transparent py-4 md:py-6"
      )}
    >
      <div className="container mx-auto flex max-w-[1400px] items-center justify-between px-4 md:px-8">
        <div className="flex items-center gap-4">
          <div className={cn(
            "relative shrink-0 overflow-hidden rounded-xl transition-all duration-300",
            isScrolled ? "h-10 w-10" : "h-12 w-12 md:h-14 md:w-14"
          )}>
            <Image
              src="/dlbc-logo.png"
              alt="Logo"
              fill
              className="object-contain"
              priority
            />
          </div>
          <div className="flex flex-col">
            <h1 className={cn(
              "font-black tracking-tight text-foreground transition-all duration-300 line-clamp-1",
              isScrolled ? "text-base md:text-lg" : "text-xl md:text-2xl"
            )}>
              {eventName}
            </h1>
            {stepTitle ? (
              <p className={cn(
                "font-medium uppercase tracking-widest transition-all duration-300",
                isScrolled 
                  ? "text-[10px] text-primary" 
                  : "text-[10px] md:text-xs text-muted-foreground"
              )}>
                {stepTitle}
              </p>
            ) : (
              !isScrolled && (
                <p className="text-[10px] md:text-xs font-medium text-muted-foreground uppercase tracking-widest">
                  Registration Confirmed
                </p>
              )
            )}
          </div>
        </div>
      </div>
    </header>
  )
}
