"use client"

import { useState } from "react"
import { ChevronDown, ChevronUp } from "lucide-react"
import {
  Card,
  CardContent,
  CardHeader,
  CardTitle,
  CardDescription,
} from "@/components/ui/card"
import { Badge } from "@/components/ui/badge"

type ReviewSectionProps = {
  title: string
  subtitle?: string
  badge?: string | number
  defaultExpanded?: boolean
  children: React.ReactNode
}

export function ReviewSection({
  title,
  subtitle,
  badge,
  defaultExpanded = false,
  children,
}: ReviewSectionProps) {
  const [isExpanded, setIsExpanded] = useState(defaultExpanded)

  return (
    <Card>
      <CardHeader
        className="cursor-pointer transition-colors hover:bg-muted/50"
        onClick={() => setIsExpanded(!isExpanded)}
      >
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div>
              <CardTitle className="text-base">{title}</CardTitle>
              {subtitle ? (
                <CardDescription className="text-sm">
                  {subtitle}
                </CardDescription>
              ) : null}
            </div>
            {badge !== undefined ? (
              <Badge
                variant="default"
                className="rounded-full bg-primary text-primary-foreground"
              >
                {badge}
              </Badge>
            ) : null}
          </div>
          <div className="text-muted-foreground">
            {isExpanded ? (
              <ChevronUp className="h-5 w-5" />
            ) : (
              <ChevronDown className="h-5 w-5" />
            )}
          </div>
        </div>
      </CardHeader>
      {isExpanded ? (
        <CardContent className="space-y-4 text-sm text-muted-foreground">
          {children}
        </CardContent>
      ) : null}
    </Card>
  )
}
