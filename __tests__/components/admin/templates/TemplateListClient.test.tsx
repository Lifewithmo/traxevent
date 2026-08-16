import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen, fireEvent, waitFor, within } from '@testing-library/react'

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
]

function row(id: string): HTMLElement {
  return screen.getByTestId(`template-row-${id}`)
}

describe('TemplateListClient', () => {
  beforeEach(() => vi.clearAllMocks())

  it('renders a row per template, each name linking to the editor', () => {
    render(<TemplateListClient orgId="o1" orgSlug="acme" templates={TEMPLATES} />)

    expect(screen.getAllByTestId(/^template-row-/)).toHaveLength(2)
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

  it('empty state offers a working create CTA', async () => {
    const promptSpy = vi.spyOn(window, 'prompt').mockReturnValue('Wedding')
    const { container } = render(<TemplateListClient orgId="o1" orgSlug="acme" templates={[]} />)

    const empty = container.querySelector('[data-slot="empty-state"]') as HTMLElement
    expect(within(empty).getByText('No templates yet')).toBeInTheDocument()

    fireEvent.click(within(empty).getByRole('button', { name: 'New template' }))

    await waitFor(() => expect(createSpy).toHaveBeenCalledWith('o1', { name: 'Wedding' }))
    await waitFor(() => expect(pushSpy).toHaveBeenCalledWith('/acme/proposal-templates/new-1'))
    promptSpy.mockRestore()
  })

  it('deletes a template after confirmation and refreshes', async () => {
    const confirmSpy = vi.spyOn(window, 'confirm').mockReturnValue(true)
    render(<TemplateListClient orgId="o1" orgSlug="acme" templates={TEMPLATES} />)

    fireEvent.click(within(row('t1')).getByRole('button', { name: 'Delete' }))

    await waitFor(() => expect(deleteSpy).toHaveBeenCalledWith('o1', 't1'))
    await waitFor(() => expect(refreshSpy).toHaveBeenCalled())
    confirmSpy.mockRestore()
  })

  it('scopes the in-flight disable to the acting row', async () => {
    duplicateSpy.mockImplementationOnce(() => new Promise(() => {}))
    render(<TemplateListClient orgId="o1" orgSlug="acme" templates={TEMPLATES} />)

    fireEvent.click(within(row('t1')).getByRole('button', { name: 'Duplicate' }))

    await waitFor(() => expect(within(row('t1')).getByRole('button', { name: 'Duplicate' })).toBeDisabled())
    expect(within(row('t1')).getByRole('button', { name: 'Rename' })).toBeDisabled()
    // The other row stays usable — one row's work must not freeze the library.
    expect(within(row('t2')).getByRole('button', { name: 'Duplicate' })).not.toBeDisabled()
    expect(within(row('t2')).getByRole('button', { name: 'Delete' })).not.toBeDisabled()
  })
})
