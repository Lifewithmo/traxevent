import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen, fireEvent } from '@testing-library/react'
import { SendDialog } from '@/components/admin/proposal-builder/SendDialog'

function baseProps(overrides: Partial<Parameters<typeof SendDialog>[0]> = {}) {
  return {
    open: true,
    onOpenChange: vi.fn(),
    recipient: { name: 'Jamie Rivera', email: 'jamie@example.com' },
    placeholderCount: 0,
    rangeLabel: '$500.00',
    rangeMax: 500,
    expiresAt: '2026-09-01',
    shareLink: 'https://app.traxevent.com/p/abc123',
    busy: false,
    sent: false,
    onConfirmSend: vi.fn(),
    onJumpToPlaceholders: vi.fn(),
    ...overrides,
  }
}

describe('SendDialog', () => {
  beforeEach(() => {
    Object.assign(navigator, {
      clipboard: { writeText: vi.fn().mockResolvedValue(undefined) },
    })
  })

  it('pre-send: title, recipient, summary, deposit line, placeholder warning, Jump to first, no-expiry warning absent, Send calls onConfirmSend, disabled when busy', () => {
    const onConfirmSend = vi.fn()
    const onJumpToPlaceholders = vi.fn()
    render(
      <SendDialog
        {...baseProps({
          placeholderCount: 2,
          deposit: { type: 'percent', value: 50 },
          depositGate: 'after_accept',
          onConfirmSend,
          onJumpToPlaceholders,
        })}
      />,
    )

    expect(screen.getByText('Review & send')).toBeInTheDocument()
    expect(screen.getByText('Jamie Rivera')).toBeInTheDocument()
    expect(screen.getByText('jamie@example.com')).toBeInTheDocument()
    expect(screen.getByText('Client sees: $500.00')).toBeInTheDocument()
    expect(
      screen.getByText('Deposit due: $250.00 — requested after acceptance'),
    ).toBeInTheDocument()
    expect(
      screen.getByText('2 placeholder section(s) will be hidden from the client'),
    ).toBeInTheDocument()

    fireEvent.click(screen.getByRole('button', { name: 'Jump to first' }))
    expect(onJumpToPlaceholders).toHaveBeenCalled()

    expect(screen.queryByText('No expiry date set')).not.toBeInTheDocument()

    const sendButton = screen.getByRole('button', { name: 'Send' })
    fireEvent.click(sendButton)
    expect(onConfirmSend).toHaveBeenCalled()
  })

  it('shows "No expiry date set" warning when expiresAt is undefined, and disables Send when busy', () => {
    render(baseSendDialog({ expiresAt: undefined, busy: true }))
    expect(screen.getByText('No expiry date set')).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Send' })).toBeDisabled()
  })

  it('shows "before_accept" deposit gate phrasing', () => {
    render(
      baseSendDialog({
        deposit: { type: 'fixed', value: 100 },
        depositGate: 'before_accept',
      }),
    )
    expect(
      screen.getByText('Deposit due: $100.00 — required before accepting'),
    ).toBeInTheDocument()
  })

  it('zero placeholders + expiry set: no warning rows', () => {
    render(baseSendDialog({ placeholderCount: 0, expiresAt: '2026-09-01' }))
    expect(screen.queryByText(/placeholder section/)).not.toBeInTheDocument()
    expect(screen.queryByText('No expiry date set')).not.toBeInTheDocument()
  })

  it('sent: shows Sent!, readonly share link input, Copy link writes to clipboard', () => {
    render(baseSendDialog({ sent: true }))
    expect(screen.getByText('Sent!')).toBeInTheDocument()
    const linkInput = screen.getByDisplayValue('https://app.traxevent.com/p/abc123') as HTMLInputElement
    expect(linkInput).toHaveAttribute('readonly')

    fireEvent.click(screen.getByRole('button', { name: 'Copy link' }))
    expect(navigator.clipboard.writeText).toHaveBeenCalledWith('https://app.traxevent.com/p/abc123')
  })

  it('recipient null: recipient row absent, no crash', () => {
    render(baseSendDialog({ recipient: null }))
    expect(screen.getByText('Review & send')).toBeInTheDocument()
    expect(screen.queryByText('Jamie Rivera')).not.toBeInTheDocument()
  })
})

function baseSendDialog(overrides: Partial<Parameters<typeof SendDialog>[0]> = {}) {
  return <SendDialog {...baseProps(overrides)} />
}
