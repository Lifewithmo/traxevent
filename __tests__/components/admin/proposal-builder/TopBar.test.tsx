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

  it('AI button absent when locked, even if aiEnabled is true', () => {
    render(<TopBar {...baseProps({ status: 'accepted', locked: true, aiEnabled: true })} />)
    expect(screen.queryByRole('button', { name: '✦ Draft with AI' })).not.toBeInTheDocument()
  })

  it('sent state: primary Copy client link calls onCopyLink; overflow contains print/viewport/void, no Delete', () => {
    const onCopyLink = vi.fn()
    render(<TopBar {...baseProps({ status: 'sent', locked: false, onCopyLink })} />)

    fireEvent.click(screen.getByRole('button', { name: 'Copy client link' }))
    expect(onCopyLink).toHaveBeenCalled()

    fireEvent.click(screen.getByRole('button', { name: 'More actions' }))
    const menu = screen.getByRole('menu')
    expect(within(menu).getByRole('menuitem', { name: 'Open print view' })).toBeInTheDocument()
    expect(within(menu).getByRole('menuitem', { name: 'Desktop' })).toBeInTheDocument()
    expect(within(menu).getByRole('menuitem', { name: 'Mobile' })).toBeInTheDocument()
    expect(within(menu).getByRole('menuitem', { name: 'Void proposal' })).toBeInTheDocument()
    expect(within(menu).queryByRole('menuitem', { name: 'Delete' })).not.toBeInTheDocument()
  })

  it('Save as template renders only when handed a handler, fires it, and is busy-gated', () => {
    const onSaveAsTemplate = vi.fn()

    // Absent when the prop is not supplied at all.
    const { unmount } = render(<TopBar {...baseProps({ status: 'draft', locked: false })} />)
    fireEvent.click(screen.getByRole('button', { name: 'More actions' }))
    expect(screen.queryByRole('menuitem', { name: 'Save as template' })).not.toBeInTheDocument()
    unmount()

    render(<TopBar {...baseProps({ status: 'draft', locked: false, onSaveAsTemplate })} />)
    fireEvent.click(screen.getByRole('button', { name: 'More actions' }))
    fireEvent.click(screen.getByRole('menuitem', { name: 'Save as template' }))
    expect(onSaveAsTemplate).toHaveBeenCalled()

    onSaveAsTemplate.mockClear()
    // Fresh mount rather than rerender: activating the item above closed the menu.
    render(<TopBar {...baseProps({ status: 'draft', locked: false, busy: true, onSaveAsTemplate })} />)
    fireEvent.click(screen.getAllByRole('button', { name: 'More actions' })[1])
    const item = screen.getByRole('menuitem', { name: 'Save as template' })
    expect(item).toHaveAttribute('aria-disabled', 'true')
    fireEvent.click(item)
    expect(onSaveAsTemplate).not.toHaveBeenCalled()
  })

  it('viewport items pass the matching argument: Mobile -> onViewport("mobile"), Desktop -> onViewport("desktop")', () => {
    const onViewport = vi.fn()
    const { unmount } = render(<TopBar {...baseProps({ status: 'draft', locked: false, onViewport })} />)
    fireEvent.click(screen.getByRole('button', { name: 'More actions' }))
    fireEvent.click(screen.getByRole('menuitem', { name: 'Mobile' }))
    expect(onViewport).toHaveBeenCalledWith('mobile')
    unmount()

    onViewport.mockClear()
    render(<TopBar {...baseProps({ status: 'draft', locked: false, viewport: 'mobile', onViewport })} />)
    fireEvent.click(screen.getByRole('button', { name: 'More actions' }))
    fireEvent.click(screen.getByRole('menuitem', { name: 'Desktop' }))
    expect(onViewport).toHaveBeenCalledWith('desktop')
  })

  it('Open print view opens the tokenized print URL in a new tab', () => {
    const open = vi.fn()
    const spy = vi.spyOn(window, 'open').mockImplementation(open)
    try {
      render(<TopBar {...baseProps({ status: 'draft', locked: false, token: 'tok-123' })} />)
      fireEvent.click(screen.getByRole('button', { name: 'More actions' }))
      fireEvent.click(screen.getByRole('menuitem', { name: 'Open print view' }))

      expect(open).toHaveBeenCalledTimes(1)
      const [url, target] = open.mock.calls[0]
      expect(url).toContain('tok-123')
      expect(url).toContain('/print')
      expect(target).toBe('_blank')
    } finally {
      spy.mockRestore()
    }
  })

  it('busy disables the gated overflow items: Save as template, Delete (draft) and Void proposal (sent)', () => {
    const onDelete = vi.fn()
    const onVoid = vi.fn()
    const { rerender } = render(
      <TopBar {...baseProps({ status: 'draft', locked: false, busy: true, onDelete, onVoid })} />
    )
    fireEvent.click(screen.getByRole('button', { name: 'More actions' }))
    // Kit menu items are divs, so "disabled" is aria-disabled plus an inert
    // handler — not the DOM disabled attribute toBeDisabled() looks for. Assert
    // both the attribute and that the action genuinely cannot fire.
    const del = screen.getByRole('menuitem', { name: 'Delete' })
    expect(del).toHaveAttribute('aria-disabled', 'true')
    fireEvent.click(del)
    expect(onDelete).not.toHaveBeenCalled()

    rerender(<TopBar {...baseProps({ status: 'sent', locked: false, busy: true, onDelete, onVoid })} />)
    const voidItem = screen.getByRole('menuitem', { name: 'Void proposal' })
    expect(voidItem).toHaveAttribute('aria-disabled', 'true')
    fireEvent.click(voidItem)
    expect(onVoid).not.toHaveBeenCalled()
  })

  it('signed (locked) proposal still shows Void proposal in the overflow — voiding a signed proposal is deliberate product behavior', () => {
    const onVoid = vi.fn()
    render(<TopBar {...baseProps({ status: 'accepted', locked: true, onVoid })} />)

    fireEvent.click(screen.getByRole('button', { name: 'More actions' }))
    const menu = screen.getByRole('menu')
    fireEvent.click(within(menu).getByRole('menuitem', { name: 'Void proposal' }))
    expect(onVoid).toHaveBeenCalled()
  })

  it('draft overflow contains Delete (-> onDelete) and not Void proposal', () => {
    const onDelete = vi.fn()
    render(<TopBar {...baseProps({ status: 'draft', locked: false, onDelete })} />)

    fireEvent.click(screen.getByRole('button', { name: 'More actions' }))
    const menu = screen.getByRole('menu')
    expect(within(menu).queryByRole('menuitem', { name: 'Void proposal' })).not.toBeInTheDocument()
    fireEvent.click(within(menu).getByRole('menuitem', { name: 'Delete' }))
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
