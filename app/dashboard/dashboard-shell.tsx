"use client"

import Image from "next/image"
import { usePathname } from "next/navigation"
import { useMemo, useState } from "react"

import { LogoutButton } from "@/app/dashboard/logout-button"
import { EventSwitcher } from "@/components/dashboard/event-switcher"
import { TooltipProvider } from "@/components/ui/tooltip"
import {
  Sidebar,
  SidebarContent,
  SidebarFooter,
  SidebarHeader,
  SidebarInset,
  SidebarProvider,
  SidebarTrigger,
  SidebarSeparator,
} from "@/components/ui/sidebar"

type DashboardShellProps = {
  children: React.ReactNode
}

function getEventSlugFromPath(pathname: string) {
  const match = pathname.match(
    /^\/dashboard\/events\/(?!new(?:\/|$))([^/]+)(?:\/|$)/
  )

  return match?.[1] ?? null
}

export function DashboardShell({ children }: DashboardShellProps) {
  const pathname = usePathname()
  const [open, setOpen] = useState(true)
  const currentSlug = useMemo(() => getEventSlugFromPath(pathname), [pathname])

  return (
    <TooltipProvider>
      <SidebarProvider open={open} onOpenChange={setOpen}>
        <Sidebar collapsible="icon" className="border-r border-white/60 dark:border-white/10">
          <SidebarHeader className="h-[64px] justify-center group-data-[collapsible=icon]:px-2">
            <div className="flex items-center gap-3 group-data-[collapsible=icon]:justify-center">
              <Image
                src="/dlbc-logo.png"
                alt="DLBC"
                width={32}
                height={32}
                className="size-8 shrink-0 rounded-lg object-contain"
                priority
              />
              <div className="flex flex-col overflow-hidden group-data-[collapsible=icon]:hidden">
                <h1 className="text-[11px] font-black tracking-tight text-foreground uppercase">
                  DCLM Netherlands
                </h1>
                <p className="text-[9px] leading-none font-bold tracking-widest text-muted-foreground/50 uppercase">
                  Conference Dashboard
                </p>
              </div>
            </div>
          </SidebarHeader>

          <SidebarContent className="gap-0 px-3 pt-3">
            <EventSwitcher currentSlug={currentSlug} />
          </SidebarContent>

          <SidebarFooter className="p-3">
            <LogoutButton
              className={`h-8 rounded-md border border-border/50 bg-background/60 px-3 text-[10px] font-black tracking-widest uppercase transition-colors hover:bg-background ${
                open ? "w-full" : "w-8 px-0"
              }`}
              showIconOnly={!open}
            />
          </SidebarFooter>
        </Sidebar>

        <SidebarInset className="bg-black/5 dark:bg-white/2">
          <header className="sticky top-0 z-30 flex h-14 shrink-0 items-center justify-between gap-4 border-b border-white/60 bg-white/80 px-4 backdrop-blur-xl dark:border-white/10 dark:bg-black/40">
            <div className="flex items-center gap-4">
              <SidebarTrigger className="-ml-1" />
              <SidebarSeparator orientation="vertical" className="mr-2 h-4" />
            </div>
          </header>

          <div className="flex-1 overflow-x-hidden p-4 lg:p-6">
            <div className="mx-auto max-w-7xl">{children}</div>
          </div>
        </SidebarInset>
      </SidebarProvider>
    </TooltipProvider>
  )
}
