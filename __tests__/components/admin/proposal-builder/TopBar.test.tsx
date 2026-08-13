import { describe, it, expect, vi } from 'vitest'
import { render, screen, fireEvent, within } from '@testing-library/react'
import { TopBar } from '@/components/admin/proposal-builder/TopBar'

function baseProps(overrides: Partial<Parameters<typeof TopBar>[0]> = {}) {
  return {
    orgSlug: 'acme',
    leadId: 'lead-1',
    title: 'A proposal',
    onTitle: vi.fn(),
    status: 'draft' as const,
    token: 'tok-123',
    locked: false,
    viewport: 'desktop' as const,
    onViewport: vi.fn(),
    saveStatus: 'saved' as const,
    retryNow: vi.fn(),
    placeholderCount: 0,
    onPlaceholderChip: vi.fn(),
    aiEnabled: false,
    onOpenAi: vi.fn(),
    onSend: vi.fn(),
    onCopyLink: vi.fn(),
    onVoid: vi.fn(),
    onDelete: vi.fn(),
    busy: false,
    ...overrides,
  }
}

describe('TopBar', () => {
  it('draft state: primary Send to client… calls onSend; AI button present/absent by aiEnabled; no Copy client link', () => {
    const onSend = vi.fn()
    const onOpenAi = vi.fn()
    render(<TopBar {...baseProps({ status: 'draft', locked: false, onSend, aiEnabled: true, onOpenAi })} />)

    fireEvent.click(screen.getByRole('button', { name: 'Send to client…' }))
    expect(onSend).toHaveBeenCalled()

    fireEvent.click(screen.getByRole('button', { name: '✦ Draft with AI' }))
    expect(onOpenAi).toHaveBeenCalled()

    expect(screen.queryByRole('button', { name: 'Copy client link' })).not.toBeInTheDocument()
  })

  it('AI button absent when aiEnabled is false', () => {
    render(<TopBar {...baseProps({ status: 'draft', locked: false, aiEnabled: false })} />)
    expect(screen.queryByRole('button', { name: '✦ Draft with AI' })).not.toBeInTheDocument()
  })

  it('sent state: primary Copy client link calls onCopyLink; overflow contains print/viewport/void, no Delete', () => {
    const onCopyLink = vi.fn()
    render(<TopBar {...baseProps({ status: 'sent', locked: false, onCopyLink })} />)

    fireEvent.click(screen.getByRole('button', { name: 'Copy client link' }))
    expect(onCopyLink).toHaveBeenCalled()

    fireEvent.click(screen.getByRole('button', { name: 'More actions' }))
    const menu = screen.getByRole('menu')
    expect(within(menu).getByText('Open print view')).toBeInTheDocument()
    expect(within(menu).getByText('Desktop')).toBeInTheDocument()
    expect(within(menu).getByText('Mobile')).toBeInTheDocument()
    expect(within(menu).getByText('Void proposal')).toBeInTheDocument()
    expect(within(menu).queryByText('Delete')).not.toBeInTheDocument()
  })

  it('draft overflow contains Delete (-> onDelete) and not Void proposal', () => {
    const onDelete = vi.fn()
    render(<TopBar {...baseProps({ status: 'draft', locked: false, onDelete })} />)

    fireEvent.click(screen.getByRole('button', { name: 'More actions' }))
    const menu = screen.getByRole('menu')
    expect(within(menu).queryByText('Void proposal')).not.toBeInTheDocument()
    fireEvent.click(within(menu).getByText('Delete'))
    expect(onDelete).toHaveBeenCalled()
  })

  it('saveStatus retrying renders Retry now -> retryNow; saved renders Saved', () => {
    const retryNow = vi.fn()
    const { rerender } = render(<TopBar {...baseProps({ saveStatus: 'retrying', retryNow })} />)
    fireEvent.click(screen.getByRole('button', { name: 'Retry now' }))
    expect(retryNow).toHaveBeenCalled()

    rerender(<TopBar {...baseProps({ saveStatus: 'saved', retryNow })} />)
    expect(screen.getByText('Saved')).toBeInTheDocument()
  })

  it('placeholderCount 2 renders chip "2 placeholders" -> onPlaceholderChip; 0 renders no chip', () => {
    const onPlaceholderChip = vi.fn()
    const { rerender } = render(<TopBar {...baseProps({ placeholderCount: 2, onPlaceholderChip })} />)
    fireEvent.click(screen.getByRole('button', { name: '2 placeholders' }))
    expect(onPlaceholderChip).toHaveBeenCalled()

    rerender(<TopBar {...baseProps({ placeholderCount: 0, onPlaceholderChip })} />)
    expect(screen.queryByRole('button', { name: /placeholder/ })).not.toBeInTheDocument()
  })
})
