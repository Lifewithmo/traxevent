import { describe, it, expect, vi } from 'vitest'
import { render, screen } from '@testing-library/react'
import { TemplateBuilderClient } from '@/components/admin/templates/TemplateBuilderClient'
import type { ProposalTemplate } from '@/lib/types'

vi.mock('@/actions/proposals', () => ({
  updateProposalDraft: vi.fn(),
}))
vi.mock('@/actions/proposal-templates', () => ({
  updateTemplateDraft: vi.fn(),
  renameProposalTemplate: vi.fn().mockResolvedValue(undefined),
  deleteProposalTemplate: vi.fn().mockResolvedValue(undefined),
}))
vi.mock('@/actions/proposal-images', () => ({
  uploadProposalImage: vi.fn().mockResolvedValue({ url: 'https://storage/x.png' }),
}))
vi.mock('next/navigation', () => ({
  useRouter: () => ({ push: vi.fn(), refresh: vi.fn() }),
}))

const template: ProposalTemplate = {
  id: 't1',
  org_id: 'o1',
  name: 'Standard wedding',
  blocks: [{ id: 'b1', type: 'heading', text: 'Cover', level: 2 }],
  line_items: [{ id: 'li1', description: 'Espresso bar', quantity: 1, unit_price: 500 }],
  created_at: 'x',
}

describe('TemplateBuilderClient', () => {
  it('renders the document canvases with the template name', () => {
    render(<TemplateBuilderClient orgId="o1" orgSlug="acme" template={template} />)
    expect(screen.getByText('Standard wedding')).toBeTruthy()
    expect(screen.getByText('Cover')).toBeTruthy()
    expect(screen.getByText('Espresso bar')).toBeTruthy()
  })

  it('shows no proposal-transaction affordances (send, client link, status, AI)', () => {
    render(<TemplateBuilderClient orgId="o1" orgSlug="acme" template={template} />)
    expect(screen.queryByRole('button', { name: /send/i })).toBeNull()
    expect(screen.queryByText(/copy link/i)).toBeNull()
    expect(screen.queryByText(/draft/i)).toBeNull()
    expect(screen.queryByText(/write with ai/i)).toBeNull()
  })
})
