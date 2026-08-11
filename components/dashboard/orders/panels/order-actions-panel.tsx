"use client"

import {
  AlertCircle,
  CheckCircle2,
  Loader2,
  Mail,
  Trash2,
} from "lucide-react"

import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert"
import { Button } from "@/components/ui/button"
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog"

type OrderActionsPanelProps = {
  canResendConfirmation: boolean
  isResendingEmail: boolean
  resendMessage: string | null
  resendErrorMessage: string | null
  onResendConfirmation: () => void
  isDeleteDialogOpen: boolean
  onOpenDeleteDialog: () => void
  onCloseDeleteDialog: () => void
  isDeleting: boolean
  deleteError: string | null
  onDelete: () => void
}

export function OrderActionsPanel({
  canResendConfirmation,
  isResendingEmail,
  resendMessage,
  resendErrorMessage,
  onResendConfirmation,
  isDeleteDialogOpen,
  onOpenDeleteDialog,
  onCloseDeleteDialog,
  isDeleting,
  deleteError,
  onDelete,
}: OrderActionsPanelProps) {
  return (
    <div className="mt-6 flex flex-wrap items-center gap-3">
      <Button
        variant="outline"
        size="sm"
        onClick={onResendConfirmation}
        disabled={isResendingEmail || !canResendConfirmation}
        className="h-9 rounded-lg border-white/20 text-[11px] font-bold tracking-wider uppercase"
      >
        {isResendingEmail ? (
          <>
            <Loader2 className="mr-2 size-3.5 animate-spin" />
            Sending
          </>
        ) : resendMessage ? (
          <>
            <CheckCircle2 className="mr-2 size-3.5 text-emerald-600" />
            Sent
          </>
        ) : (
          <>
            <Mail className="mr-2 size-3.5" />
            Send email
          </>
        )}
      </Button>
      <Button
        variant="destructive"
        size="sm"
        onClick={onOpenDeleteDialog}
        className="h-9 rounded-lg px-3 text-[11px] font-bold tracking-wider uppercase"
      >
        <Trash2 className="mr-2 size-3.5" />
        Delete Order
      </Button>
      {!canResendConfirmation && (
        <p className="text-xs text-muted-foreground">
          Missing recipient email or booking reference.
        </p>
      )}

      {resendErrorMessage && (
        <Alert variant="destructive" className="w-full rounded-xl border-destructive/20">
          <AlertCircle className="size-4" />
          <AlertTitle className="text-destructive">Send failed</AlertTitle>
          <AlertDescription className="text-destructive/80">
            {resendErrorMessage}
          </AlertDescription>
        </Alert>
      )}

      {resendMessage && (
        <Alert className="w-full rounded-xl border-emerald-500/20 bg-emerald-500/5 text-emerald-700 dark:text-emerald-300">
          <CheckCircle2 className="size-4" />
          <AlertTitle className="text-emerald-700 dark:text-emerald-300">Sent</AlertTitle>
          <AlertDescription className="text-emerald-700/90 dark:text-emerald-300/90">
            {resendMessage}
          </AlertDescription>
        </Alert>
      )}

      <Dialog
        open={isDeleteDialogOpen}
        onOpenChange={(open) => {
          if (!open) onCloseDeleteDialog()
        }}
      >
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>Delete Order</DialogTitle>
            <DialogDescription>
              This order will be deleted.
            </DialogDescription>
          </DialogHeader>

          {deleteError && (
            <Alert variant="destructive" className="rounded-xl">
              <AlertCircle className="size-4" />
              <AlertTitle className="text-destructive">Delete failed</AlertTitle>
              <AlertDescription className="text-destructive/80">
                {deleteError}
              </AlertDescription>
            </Alert>
          )}

          <DialogFooter>
            <Button
              type="button"
              variant="ghost"
              onClick={onCloseDeleteDialog}
              className="h-9 rounded-lg px-4 text-[11px] font-bold tracking-wider uppercase"
            >
              Cancel
            </Button>
            <Button
              type="button"
              variant="destructive"
              disabled={isDeleting}
              onClick={onDelete}
              className="h-9 rounded-lg px-4 text-[11px] font-bold tracking-wider uppercase"
            >
              {isDeleting ? (
                <>
                  <Loader2 className="mr-2 size-3.5 animate-spin" />
                  Deleting…
                </>
              ) : (
                "Delete Order"
              )}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  )
}
