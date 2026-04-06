"use client"

import { Check } from "lucide-react"

import { cn } from "@/lib/utils"
import { SIGNUP_STEP_ORDER, type SignupStep } from "@/components/signup/state"

type SignupProgressProps = {
  currentStep: SignupStep
  completedByStep: Record<SignupStep, boolean>
  onStepClick: (step: SignupStep) => void
  canAccessStep: (step: SignupStep) => boolean
  skipRooms?: boolean
}

const STEP_LABELS: Record<SignupStep, string> = {
  tickets: "Ticket Selection",
  buyer: "Contact Details",
  attendees: "Attendee Info",
  rooms: "Room Assignment",
  review: "Review & Submit",
}

export function SignupProgress({
  currentStep,
  completedByStep,
  onStepClick,
  canAccessStep,
  skipRooms = false,
}: SignupProgressProps) {
  const currentStepIndex = SIGNUP_STEP_ORDER.indexOf(currentStep)

  const visibleSteps = SIGNUP_STEP_ORDER.filter(
    (step) => step !== "rooms" || !skipRooms
  )

  return (
    <nav aria-label="Signup Progress" className="w-full">
      <div className="flex gap-4 overflow-x-auto pb-4 md:flex-col md:overflow-visible md:pb-0">
        {visibleSteps.map((step, index) => {
          const isActive = currentStep === step
          const originalIndex = SIGNUP_STEP_ORDER.indexOf(step)
          const isComplete =
            completedByStep[step] && originalIndex < currentStepIndex
          const isUpcoming = originalIndex > currentStepIndex
          const label = STEP_LABELS[step]
          const isDisabled = !canAccessStep(step)

          return (
            <button
              key={step}
              type="button"
              disabled={isDisabled}
              onClick={() => onStepClick(step)}
              className={cn(
                "group flex min-w-[140px] items-start gap-3 text-left transition-all focus-visible:outline-none md:min-w-0",
                isDisabled
                  ? "cursor-not-allowed opacity-40"
                  : "hover:opacity-80"
              )}
            >
              <div className="relative flex flex-col items-center">
                <div
                  className={cn(
                    "flex size-7 items-center justify-center rounded-full border-2 transition-all duration-300",
                    isComplete
                      ? "border-primary bg-primary text-primary-foreground shadow-sm shadow-primary/20"
                      : isActive
                        ? "border-primary ring-2 ring-primary/40 ring-offset-2 ring-offset-background"
                        : "border-muted-foreground/30 bg-background"
                  )}
                >
                  {isComplete ? (
                    <Check className="size-4 stroke-[3px]" />
                  ) : (
                    <span
                      className={cn(
                        "text-[10px] font-bold",
                        isActive ? "text-primary" : "text-muted-foreground"
                      )}
                    >
                      {index + 1}
                    </span>
                  )}
                </div>
                {index < visibleSteps.length - 1 && (
                  <div
                    className={cn(
                      "mt-1 hidden h-8 w-[2px] rounded-full transition-colors duration-300 md:block",
                      isComplete ? "bg-primary" : "bg-muted/30"
                    )}
                  />
                )}
              </div>

              <div className="flex flex-col pt-0.5">
                <span
                  className={cn(
                    "text-[10px] font-black tracking-widest uppercase transition-colors",
                    isActive ? "text-primary" : "text-muted-foreground/50"
                  )}
                >
                  Step {index + 1}
                </span>
                <span
                  className={cn(
                    "text-sm font-bold tracking-tight whitespace-nowrap",
                    isActive
                      ? "text-foreground"
                      : isUpcoming
                        ? "text-muted-foreground/60"
                        : "text-foreground/80"
                  )}
                >
                  {label}
                </span>
              </div>
            </button>
          )
        })}
      </div>
    </nav>
  )
}
