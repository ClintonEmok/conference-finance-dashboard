import * as React from "react"
import Link from "next/link"
import { ChevronRight, Home } from "lucide-react"
import { cn } from "@/lib/utils"

export interface BreadcrumbProps extends React.ComponentPropsWithoutRef<"nav"> {
  children: React.ReactNode
}

export function Breadcrumb({ children, className, ...props }: BreadcrumbProps) {
  return (
    <nav
      aria-label="Breadcrumb"
      className={cn("flex items-center gap-2", className)}
      {...props}
    >
      <ol className="flex flex-wrap items-center gap-2 break-words text-[10px] font-bold tracking-widest uppercase">
        {children}
      </ol>
    </nav>
  )
}

export interface BreadcrumbItemProps {
  href?: string
  children: React.ReactNode
  isLast?: boolean
  className?: string
}

export function BreadcrumbItem({
  href,
  children,
  isLast,
  className,
}: BreadcrumbItemProps) {
  const content = href ? (
    <Link
      href={href}
      className="text-muted-foreground transition-colors hover:text-foreground"
    >
      {children}
    </Link>
  ) : (
    <span className={cn("text-primary/70", className)}>{children}</span>
  )

  return (
    <li className="flex items-center gap-2">
      {content}
      {!isLast && (
        <ChevronRight className="size-3 shrink-0 text-muted-foreground/30" strokeWidth={3} />
      )}
    </li>
  )
}
