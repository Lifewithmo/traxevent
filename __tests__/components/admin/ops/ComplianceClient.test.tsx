import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen, fireEvent, waitFor } from '@testing-library/react'

vi.mock('@/actions/compliance', () => ({
  createComplianceDoc: vi.fn().mockImplementation(async (_o: string, input: object) => ({
    id: 'cd-new', created_at: '2026-08-05T00:00:00.000Z', ...input,
  })),
  updateComplianceDoc: vi.fn().mockResolvedValue(undefined),
  deleteComplianceDoc: vi.fn().mockResolvedValue(undefined),
}))

import { createComplianceDoc, deleteComplianceDoc } from '@/actions/compliance'
import { ComplianceClient } from '@/components/admin/ops/ComplianceClient'
import type { ComplianceDoc } from '@/lib/types'

const expired: ComplianceDoc = { id: '1', name: 'Health permit', expires_on: '2000-01-01', created_at: 'x' }
const valid: ComplianceDoc = { id: '2', name: 'Liability insurance', expires_on: '2999-01-01', created_at: 'x' }
const noExpiry: ComplianceDoc = { id: '3', name: 'Food handler card', created_at: 'x' }

beforeEach(() => vi.clearAllMocks())

describe('ComplianceClient', () => {
  it('badges expired / valid / no-expiry docs', () => {
    render(<ComplianceClient orgId="o1" isAdmin docs={[expired, valid, noExpiry]} />)
    expect(screen.getByText('expired')).toBeInTheDocument()
    expect(screen.getByText('valid')).toBeInTheDocument()
    expect(screen.getByText('Food handler card')).toBeInTheDocument()
  })

  it('creates a document', async () => {
    render(<ComplianceClient orgId="o1" isAdmin docs={[]} />)
    fireEvent.change(screen.getByLabelText('Name'), { target: { value: 'Fire cert' } })
    fireEvent.change(screen.getByLabelText('Expires on'), { target: { value: '2026-12-31' } })
    fireEvent.click(screen.getByRole('button', { name: 'Add document' }))
    await waitFor(() => expect(createComplianceDoc).toHaveBeenCalledWith('o1', {
      name: 'Fire cert', expires_on: '2026-12-31',
    }))
    expect(await screen.findByText('Fire cert')).toBeInTheDocument()
  })

  it('deletes after confirm', async () => {
    vi.spyOn(window, 'confirm').mockReturnValue(true)
    render(<ComplianceClient orgId="o1" isAdmin docs={[valid]} />)
    fireEvent.click(screen.getByRole('button', { name: 'Delete Liability insurance' }))
    await waitFor(() => expect(deleteComplianceDoc).toHaveBeenCalledWith('o1', '2'))
  })

  it('hides write controls for non-admins', () => {
    render(<ComplianceClient orgId="o1" isAdmin={false} docs={[valid]} />)
    expect(screen.queryByRole('button', { name: 'Add document' })).not.toBeInTheDocument()
  })
})
