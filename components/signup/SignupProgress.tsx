"use client"

import { Badge } from "@/components/ui/badge"
import { SIGNUP_STEP_ORDER, type SignupStep } from "@/components/signup/state"

type SignupProgressProps = {
  currentStep: SignupStep
  completedByStep: Record<SignupStep, boolean>
  onStepClick: (step: SignupStep) => void
  canAccessStep: (step: SignupStep) => boolean
}

const STEP_LABELS: Record<SignupStep, string> = {
  tickets: "Tickets",
  buyer: "Your Details",
  attendees: "Attendee details",
  rooms: "Rooms",
  review: "Review & submit",
}

export function SignupProgress({
  currentStep,
  completedByStep,
  onStepClick,
  canAccessStep,
}: SignupProgressProps) {
  const currentStepIndex = SIGNUP_STEP_ORDER.indexOf(currentStep)

  return (
    <div className="relative">
      <div className="flex gap-2 overflow-x-auto pb-2 md:grid md:grid-cols-5 md:overflow-visible md:pb-0">
        {SIGNUP_STEP_ORDER.map((step, index) => {
          const isActive = currentStep === step
          const isComplete = completedByStep[step] && index < currentStepIndex
          const label = STEP_LABELS[step]

          return (
            <button
              key={step}
              type="button"
              className="min-w-[120px] shrink-0 rounded-lg border border-border/70 px-3 py-2 text-left transition-colors hover:bg-muted/50 disabled:cursor-not-allowed disabled:opacity-50 md:min-w-0"
              disabled={!canAccessStep(step)}
              onClick={() => onStepClick(step)}
            >
              <p className="text-xs text-muted-foreground">Step {index + 1}</p>
              <p className="text-sm font-medium">{label}</p>
              {isActive ? (
                <Badge className="mt-2">Active</Badge>
              ) : isComplete ? (
                <Badge className="mt-2" variant="secondary">
                  Complete
                </Badge>
              ) : null}
            </button>
          )
        })}
      </div>
    </div>
  )
}
