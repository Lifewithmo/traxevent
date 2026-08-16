import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen, fireEvent, waitFor, within, act } from '@testing-library/react'

const createSpy = vi.hoisted(() => vi.fn().mockResolvedValue({ id: 'new-1' }))
const renameSpy = vi.hoisted(() => vi.fn().mockResolvedValue(undefined))
const duplicateSpy = vi.hoisted(() => vi.fn().mockResolvedValue(undefined))
const deleteSpy = vi.hoisted(() => vi.fn().mockResolvedValue(undefined))
const refreshSpy = vi.hoisted(() => vi.fn())
const pushSpy = vi.hoisted(() => vi.fn())

// Server actions pull firebase-admin at module scope — always mock.
vi.mock('@/actions/proposal-templates', () => ({
  createProposalTemplate: createSpy,
  renameProposalTemplate: renameSpy,
  duplicateProposalTemplate: duplicateSpy,
  deleteProposalTemplate: deleteSpy,
}))
vi.mock('next/navigation', () => ({
  useRouter: () => ({ refresh: refreshSpy, push: pushSpy }),
}))

import { TemplateListClient } from '@/components/admin/templates/TemplateListClient'
import type { ProposalTemplate } from '@/lib/types'

const TEMPLATES: ProposalTemplate[] = [
  {
    id: 't1',
    org_id: 'o1',
    name: 'Standard wedding',
    line_items: [{ id: 'li1', description: 'Espresso bar', quantity: 1, unit_price: 500 }],
    usage_count: 3,
    updated_at: '2026-08-14T10:00:00Z',
    created_at: '2026-08-01T10:00:00Z',
  },
  {
    id: 't2',
    org_id: 'o1',
    name: 'Corporate offsite',
    line_items: [],
    usage_count: 0,
    created_at: '2026-08-02T10:00:00Z',
  },
  {
    // No `usage_count` at all — templates written before the counter existed
    // (and freshly created ones) omit the field entirely.
    id: 't3',
    org_id: 'o1',
    name: 'Holiday popup',
    line_items: [],
    created_at: '2026-08-03T10:00:00Z',
  },
]

function row(id: string): HTMLElement {
  return screen.getByTestId(`template-row-${id}`)
}

function emptyState(container: HTMLElement): HTMLElement {
  return container.querySelector('[data-slot="empty-state"]') as HTMLElement
}

describe('TemplateListClient', () => {
  beforeEach(() => vi.clearAllMocks())

  it('renders a row per template, each name linking to the editor', () => {
    render(<TemplateListClient orgId="o1" orgSlug="acme" templates={TEMPLATES} />)

    expect(screen.getAllByTestId(/^template-row-/)).toHaveLength(3)
    expect(screen.getByRole('link', { name: 'Standard wedding' })).toHaveAttribute(
      'href',
      '/acme/proposal-templates/t1'
    )
    expect(screen.getByRole('link', { name: 'Corporate offsite' })).toHaveAttribute(
      'href',
      '/acme/proposal-templates/t2'
    )
  })

  it('shows usage as a pill — used templates count, unused ones never read "used 0×"', () => {
    render(<TemplateListClient orgId="o1" orgSlug="acme" templates={TEMPLATES} />)

    expect(within(row('t1')).getByText('Used 3×')).toBeInTheDocument()
    expect(within(row('t2')).getByText('Unused')).toBeInTheDocument()
    expect(screen.queryByText(/used 0×/i)).toBeNull()
  })

  it('treats a missing usage_count as unused rather than rendering a blank pill', () => {
    render(<TemplateListClient orgId="o1" orgSlug="acme" templates={TEMPLATES} />)

    expect(within(row('t3')).getByText('Unused')).toBeInTheDocument()
    expect(within(row('t3')).queryByText(/^used \d/i)).toBeNull()
  })

  it('empty state offers a working create CTA, trimming the typed name', async () => {
    // Deliberately padded: the action must receive the trimmed value.
    const promptSpy = vi.spyOn(window, 'prompt').mockReturnValue('  Wedding  ')
    const { container } = render(<TemplateListClient orgId="o1" orgSlug="acme" templates={[]} />)

    const empty = emptyState(container)
    expect(within(empty).getByText('No templates yet')).toBeInTheDocument()

    fireEvent.click(within(empty).getByRole('button', { name: 'New template' }))

    expect(promptSpy).toHaveBeenCalledTimes(1)
    await waitFor(() => expect(createSpy).toHaveBeenCalledWith('o1', { name: 'Wedding' }))
    await waitFor(() => expect(pushSpy).toHaveBeenCalledWith('/acme/proposal-templates/new-1'))
    promptSpy.mockRestore()
  })

  it('creates nothing when the name prompt is cancelled', () => {
    const promptSpy = vi.spyOn(window, 'prompt').mockReturnValue(null)
    render(<TemplateListClient orgId="o1" orgSlug="acme" templates={TEMPLATES} />)

    fireEvent.click(screen.getByRole('button', { name: 'New template' }))

    expect(promptSpy).toHaveBeenCalledTimes(1)
    expect(createSpy).not.toHaveBeenCalled()
    expect(pushSpy).not.toHaveBeenCalled()
    promptSpy.mockRestore()
  })

  it('disables the create CTA while the create is in flight — a second click would orphan a template', async () => {
    const promptSpy = vi.spyOn(window, 'prompt').mockReturnValue('Wedding')
    let resolveCreate!: (t: { id: string }) => void
    createSpy.mockImplementationOnce(() => new Promise((res) => { resolveCreate = res }))
    const { container } = render(<TemplateListClient orgId="o1" orgSlug="acme" templates={[]} />)

    const cta = within(emptyState(container)).getByRole('button', { name: 'New template' })
    fireEvent.click(cta)

    await waitFor(() => expect(cta).toBeDisabled())
    // The header button is the same guarded control, so it locks too.
    expect(screen.getAllByRole('button', { name: 'New template' }).every((b) => (b as HTMLButtonElement).disabled)).toBe(true)

    // An impatient second click must not open a second prompt or write a second doc.
    fireEvent.click(cta)
    expect(promptSpy).toHaveBeenCalledTimes(1)
    expect(createSpy).toHaveBeenCalledTimes(1)

    await act(async () => { resolveCreate({ id: 'new-1' }) })
    promptSpy.mockRestore()
  })

  it('deletes a template after confirmation and refreshes', async () => {
    const confirmSpy = vi.spyOn(window, 'confirm').mockReturnValue(true)
    render(<TemplateListClient orgId="o1" orgSlug="acme" templates={TEMPLATES} />)

    fireEvent.click(within(row('t1')).getByRole('button', { name: 'Delete' }))

    expect(confirmSpy).toHaveBeenCalledTimes(1)
    expect(confirmSpy).toHaveBeenCalledWith(expect.stringContaining('Standard wedding'))
    await waitFor(() => expect(deleteSpy).toHaveBeenCalledWith('o1', 't1'))
    await waitFor(() => expect(refreshSpy).toHaveBeenCalled())
    confirmSpy.mockRestore()
  })

  it('deletes nothing when the confirm dialog is dismissed', () => {
    const confirmSpy = vi.spyOn(window, 'confirm').mockReturnValue(false)
    render(<TemplateListClient orgId="o1" orgSlug="acme" templates={TEMPLATES} />)

    fireEvent.click(within(row('t1')).getByRole('button', { name: 'Delete' }))

    expect(confirmSpy).toHaveBeenCalledTimes(1)
    expect(deleteSpy).not.toHaveBeenCalled()
    expect(refreshSpy).not.toHaveBeenCalled()
    confirmSpy.mockRestore()
  })

  it('renames a template with the trimmed new name and refreshes', async () => {
    const promptSpy = vi.spyOn(window, 'prompt').mockReturnValue('  Garden wedding  ')
    render(<TemplateListClient orgId="o1" orgSlug="acme" templates={TEMPLATES} />)

    fireEvent.click(within(row('t1')).getByRole('button', { name: 'Rename' }))

    expect(promptSpy).toHaveBeenCalledWith('Rename template:', 'Standard wedding')
    await waitFor(() => expect(renameSpy).toHaveBeenCalledWith('o1', 't1', 'Garden wedding'))
    await waitFor(() => expect(refreshSpy).toHaveBeenCalled())
    promptSpy.mockRestore()
  })

  it('skips the rename write when cancelled, blanked, or unchanged', () => {
    render(<TemplateListClient orgId="o1" orgSlug="acme" templates={TEMPLATES} />)
    const renameButton = within(row('t1')).getByRole('button', { name: 'Rename' })

    for (const value of [null, '   ', 'Standard wedding', '  Standard wedding  ']) {
      const promptSpy = vi.spyOn(window, 'prompt').mockReturnValue(value)
      fireEvent.click(renameButton)
      expect(promptSpy).toHaveBeenCalledTimes(1)
      promptSpy.mockRestore()
    }

    expect(renameSpy).not.toHaveBeenCalled()
    expect(refreshSpy).not.toHaveBeenCalled()
  })

  it('scopes the in-flight disable to the acting row, and clears it when the work settles', async () => {
    let resolveDuplicate!: () => void
    duplicateSpy.mockImplementationOnce(() => new Promise<void>((res) => { resolveDuplicate = () => res() }))
    render(<TemplateListClient orgId="o1" orgSlug="acme" templates={TEMPLATES} />)

    fireEvent.click(within(row('t1')).getByRole('button', { name: 'Duplicate' }))

    await waitFor(() => expect(within(row('t1')).getByRole('button', { name: 'Duplicate' })).toBeDisabled())
    expect(within(row('t1')).getByRole('button', { name: 'Rename' })).toBeDisabled()
    expect(within(row('t1')).getByRole('button', { name: 'Delete' })).toBeDisabled()
    // The other row stays usable — one row's work must not freeze the library.
    expect(within(row('t2')).getByRole('button', { name: 'Duplicate' })).not.toBeDisabled()
    expect(within(row('t2')).getByRole('button', { name: 'Delete' })).not.toBeDisabled()
    // Nor may it freeze the unrelated create action.
    expect(screen.getByRole('button', { name: 'New template' })).not.toBeDisabled()

    // Settling the action must release the row (a missing `finally` would not).
    await act(async () => { resolveDuplicate() })
    expect(within(row('t1')).getByRole('button', { name: 'Duplicate' })).not.toBeDisabled()
    expect(within(row('t1')).getByRole('button', { name: 'Rename' })).not.toBeDisabled()
    expect(within(row('t1')).getByRole('button', { name: 'Delete' })).not.toBeDisabled()
    expect(refreshSpy).toHaveBeenCalled()
  })

  // The interleaving that separates per-concern state from one shared `busy`
  // slot. With a single slot, starting the create overwrites the row key (so
  // t1 re-enables mid-flight) and the row's `finally` then clears the create
  // guard — re-opening the orphaned-template double-submit.
  it('keeps the create guard when a row action settles underneath it', async () => {
    let resolveDuplicate!: () => void
    duplicateSpy.mockImplementationOnce(() => new Promise<void>((res) => { resolveDuplicate = () => res() }))
    createSpy.mockImplementationOnce(() => new Promise(() => {}))
    vi.spyOn(window, 'prompt').mockReturnValue('Wedding')
    render(<TemplateListClient orgId="o1" orgSlug="acme" templates={TEMPLATES} />)

    fireEvent.click(within(row('t1')).getByRole('button', { name: 'Duplicate' }))
    await waitFor(() => expect(within(row('t1')).getByRole('button', { name: 'Duplicate' })).toBeDisabled())

    fireEvent.click(screen.getByRole('button', { name: 'New template' }))
    await waitFor(() => expect(screen.getByRole('button', { name: 'New template' })).toBeDisabled())
    // Starting the create must not release the row that is still working.
    expect(within(row('t1')).getByRole('button', { name: 'Duplicate' })).toBeDisabled()

    await act(async () => { resolveDuplicate() })
    // The row is free again, but the create is still in flight and stays gated.
    expect(within(row('t1')).getByRole('button', { name: 'Duplicate' })).not.toBeDisabled()
    expect(screen.getByRole('button', { name: 'New template' })).toBeDisabled()
    expect(createSpy).toHaveBeenCalledTimes(1)
  })

  // Rows run concurrently, so the guard cannot be a single id.
  it('holds a separate guard per in-flight row', async () => {
    let resolveT1!: () => void
    duplicateSpy
      .mockImplementationOnce(() => new Promise<void>((res) => { resolveT1 = () => res() }))
      .mockImplementationOnce(() => new Promise(() => {}))
    render(<TemplateListClient orgId="o1" orgSlug="acme" templates={TEMPLATES} />)

    fireEvent.click(within(row('t1')).getByRole('button', { name: 'Duplicate' }))
    await waitFor(() => expect(within(row('t1')).getByRole('button', { name: 'Duplicate' })).toBeDisabled())

    fireEvent.click(within(row('t2')).getByRole('button', { name: 'Duplicate' }))
    await waitFor(() => expect(within(row('t2')).getByRole('button', { name: 'Duplicate' })).toBeDisabled())
    // t2 starting must not release t1.
    expect(within(row('t1')).getByRole('button', { name: 'Duplicate' })).toBeDisabled()

    await act(async () => { resolveT1() })
    // t1 settling must not release t2, which is still working.
    expect(within(row('t1')).getByRole('button', { name: 'Duplicate' })).not.toBeDisabled()
    expect(within(row('t2')).getByRole('button', { name: 'Duplicate' })).toBeDisabled()
  })
})
