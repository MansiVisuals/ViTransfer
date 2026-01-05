"use client"

import * as React from "react"
import { ChevronDown, ChevronUp } from "lucide-react"

import { cn } from "@/lib/utils"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"

export interface CollapsibleSectionProps {
  title: React.ReactNode
  description?: React.ReactNode
  open: boolean
  onOpenChange: (open: boolean) => void
  children: React.ReactNode
  className?: string
  headerClassName?: string
  contentClassName?: string
  iconClassName?: string
}

export function CollapsibleSection({
  title,
  description,
  open,
  onOpenChange,
  children,
  className,
  headerClassName,
  contentClassName,
  iconClassName,
}: CollapsibleSectionProps) {
  const contentId = React.useId()

  const toggle = React.useCallback(() => {
    onOpenChange(!open)
  }, [onOpenChange, open])

  return (
    <Card className={className}>
      <CardHeader
        role="button"
        tabIndex={0}
        aria-expanded={open}
        aria-controls={contentId}
        className={cn("cursor-pointer hover:bg-accent/50 transition-colors", headerClassName)}
        onClick={toggle}
        onKeyDown={(event) => {
          if (event.key === "Enter" || event.key === " ") {
            event.preventDefault()
            toggle()
          }
        }}
      >
        <div className="flex items-center justify-between">
          <div>
            <CardTitle>{title}</CardTitle>
            {description ? <CardDescription>{description}</CardDescription> : null}
          </div>
          {open ? (
            <ChevronUp className={cn("w-5 h-5 text-muted-foreground flex-shrink-0", iconClassName)} />
          ) : (
            <ChevronDown className={cn("w-5 h-5 text-muted-foreground flex-shrink-0", iconClassName)} />
          )}
        </div>
      </CardHeader>

      {open ? (
        <CardContent id={contentId} className={contentClassName}>
          {children}
        </CardContent>
      ) : null}
    </Card>
  )
}

