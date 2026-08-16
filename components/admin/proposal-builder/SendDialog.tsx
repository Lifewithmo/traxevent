'use client'

// Review & Send preflight (spec §4): a centered Dialog standing in for the
// spec's right-side Sheet (the repo has no Sheet primitive and we add no
// dependencies — same content and flow). Presentational only: the caller
// (ProposalBuilderClient, Task 9) owns all state, including `sent`, which
// flips the dialog body to the post-send success state.
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from '@/components/ui/dialog'
import { depositAmount } from '@/lib/proposals'
import type { ProposalDeposit } from '@/lib/types'

export interface SendRecipient {
  name: string
  email?: string
}

export function SendDialog({
  open,
  onOpenChange,
  recipient,
  placeholderCount,
  rangeLabel,
  rangeMax,
  deposit,
  depositGate,
  expiresAt,
  shareLink,
  busy,
  sent,
  onConfirmSend,
  onJumpToPlaceholders,
}: {
  open: boolean
  onOpenChange: (open: boolean) => void
  recipient: SendRecipient | null
  placeholderCount: number
  rangeLabel: string
  rangeMax: number
  deposit?: ProposalDeposit
  depositGate?: 'before_accept' | 'after_accept'
  expiresAt?: string
  shareLink: string
  busy: boolean
  sent: boolean
  onConfirmSend: () => void
  onJumpToPlaceholders: () => void
}) {
  const depositDue = depositAmount(rangeMax, deposit)
  const showDepositLine = Boolean(deposit && deposit.value > 0 && depositDue > 0)
  const gateLabel = depositGate === 'before_accept' ? 'required before accepting' : 'requested after acceptance'

  const handleCopy = () => {
    navigator.clipboard.writeText(shareLink)
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>{sent ? 'Sent!' : 'Review & send'}</DialogTitle>
        </DialogHeader>

        {sent ? (
          <div className="flex flex-col gap-3">
            <p className="text-sm text-muted-foreground">
              The client can view and accept the proposal at this link.
            </p>
            <div className="flex gap-2">
              <Input readOnly value={shareLink} onFocus={(e) => e.currentTarget.select()} />
              <Button type="button" onClick={handleCopy}>
                Copy link
              </Button>
            </div>
          </div>
        ) : (
          <>
            <dl className="grid grid-cols-[auto_1fr] gap-x-3 gap-y-1 text-sm">
              {recipient && (
                <>
                  <dt className="text-muted-foreground">To</dt>
                  <dd>
                    <span>{recipient.name}</span>
                    {recipient.email ? (
                      <span className="text-muted-foreground">
                        {' · '}
                        <span>{recipient.email}</span>
                      </span>
                    ) : null}
                  </dd>
                </>
              )}
              <dt className="text-muted-foreground">Total</dt>
              <dd>Client sees: {rangeLabel}</dd>
              {showDepositLine && (
                <>
                  <dt className="text-muted-foreground">Deposit</dt>
                  <dd>
                    Deposit due: ${depositDue.toFixed(2)} — {gateLabel}
                  </dd>
                </>
              )}
            </dl>

            {(placeholderCount > 0 || !expiresAt) && (
              <div className="flex flex-col gap-2">
                {placeholderCount > 0 && (
                  <div className="flex items-center justify-between gap-2 rounded-md bg-[var(--warn-bg)] px-3 py-2 text-[var(--warn-fg)]">
                    <span>{placeholderCount} placeholder section(s) will be hidden from the client</span>
                    <Button type="button" variant="ghost" size="sm" onClick={onJumpToPlaceholders}>
                      Jump to first
                    </Button>
                  </div>
                )}
                {!expiresAt && (
                  <div className="rounded-md bg-[var(--warn-bg)] px-3 py-2 text-[var(--warn-fg)]">No expiry date set</div>
                )}
              </div>
            )}
          </>
        )}

        {!sent && (
          <DialogFooter>
            <Button type="button" onClick={onConfirmSend} disabled={busy}>
              Send
            </Button>
          </DialogFooter>
        )}
      </DialogContent>
    </Dialog>
  )
}
