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
  /** When false, section is always open with no toggle chevron. Default true. */
  collapsible?: boolean
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
  collapsible = true,
}: CollapsibleSectionProps) {
  const contentId = React.useId()
  const isOpen = collapsible ? open : true

  const toggle = React.useCallback(() => {
    if (collapsible) onOpenChange(!open)
  }, [collapsible, onOpenChange, open])

  return (
    <Card className={className}>
      <CardHeader
        role={collapsible ? "button" : undefined}
        tabIndex={collapsible ? 0 : undefined}
        aria-expanded={collapsible ? isOpen : undefined}
        aria-controls={collapsible ? contentId : undefined}
        className={cn(collapsible && "cursor-pointer hover:bg-accent/50 transition-colors", headerClassName)}
        onClick={collapsible ? toggle : undefined}
        onKeyDown={collapsible ? (event) => {
          if (event.key === "Enter" || event.key === " ") {
            event.preventDefault()
            toggle()
          }
        } : undefined}
      >
        <div className="flex items-center justify-between">
          <div>
            <CardTitle>{title}</CardTitle>
            {description ? <CardDescription>{description}</CardDescription> : null}
          </div>
          {collapsible && (
            isOpen ? (
              <ChevronUp className={cn("w-5 h-5 text-muted-foreground flex-shrink-0", iconClassName)} />
            ) : (
              <ChevronDown className={cn("w-5 h-5 text-muted-foreground flex-shrink-0", iconClassName)} />
            )
          )}
        </div>
      </CardHeader>

      {isOpen ? (
        <CardContent id={contentId} className={contentClassName}>
          {children}
        </CardContent>
      ) : null}
    </Card>
  )
}

