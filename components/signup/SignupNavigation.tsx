"use client"

import { Button } from "@/components/ui/button"
import type { SignupStep } from "@/components/signup/state"

type SignupNavigationProps = {
  currentStepIndex: number
  totalSteps: number
  canProceed: boolean
  onBack: () => void
  onNext: () => void
  isSubmitting?: boolean
  showSubmit?: boolean
  submitLabel?: string
}

export function SignupNavigation({
  currentStepIndex,
  totalSteps,
  canProceed,
  onBack,
  onNext,
  isSubmitting = false,
  showSubmit = false,
  submitLabel = "Submit",
}: SignupNavigationProps) {
  const isFirstStep = currentStepIndex === 0
  const isLastStep = currentStepIndex === totalSteps - 1

  return (
    <div className="flex gap-2 pt-4">
      <Button
        type="button"
        variant="outline"
        onClick={onBack}
        disabled={isFirstStep || isSubmitting}
        className="touch:min-h-12 min-h-11 flex-1 md:flex-none"
      >
        Back
      </Button>
      {!showSubmit ? (
        <Button
          type="button"
          onClick={onNext}
          disabled={!canProceed}
          className="touch:min-h-12 min-h-11 flex-1 md:flex-none"
        >
          {isLastStep ? "Review" : "Next"}
        </Button>
      ) : (
        <Button
          type="button"
          onClick={onNext}
          disabled={!canProceed || isSubmitting}
          className="touch:min-h-12 min-h-11 flex-1 md:flex-none"
        >
          {isSubmitting ? "Submitting..." : submitLabel}
        </Button>
      )}
    </div>
  )
}
