"use client"

import { ChevronLeft, ChevronRight, Loader2 } from "lucide-react"
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
    <div className="flex flex-col-reverse gap-3 pt-6 sm:flex-row sm:justify-end">
      {!isFirstStep && (
        <Button
          type="button"
          variant="outline"
          onClick={onBack}
          disabled={isSubmitting}
          className="h-11 px-6 font-bold sm:min-w-32"
        >
          <ChevronLeft className="mr-2 size-4" />
          Back
        </Button>
      )}

      {!showSubmit ? (
        <Button
          type="button"
          onClick={onNext}
          disabled={!canProceed}
          className="h-11 px-8 font-bold sm:min-w-40"
        >
          {isLastStep ? "Review & Finish" : "Continue"}
          <ChevronRight className="ml-2 size-4" />
        </Button>
      ) : (
        <Button
          type="button"
          onClick={onNext}
          disabled={!canProceed || isSubmitting}
          className="h-11 px-8 font-bold sm:min-w-40"
        >
          {isSubmitting ? (
            <>
              <Loader2 className="mr-2 size-4 animate-spin" />
              Processing...
            </>
          ) : (
            submitLabel
          )}
        </Button>
      )}
    </div>
  )
}
