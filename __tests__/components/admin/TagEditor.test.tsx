import { render, screen, fireEvent, waitFor } from '@testing-library/react'
import { describe, it, expect, vi, beforeEach } from 'vitest'
import { TagEditor } from '@/components/admin/TagEditor'

describe('TagEditor', () => {
  beforeEach(() => vi.clearAllMocks())

  it('adds a typed tag on Enter', async () => {
    const onSave = vi.fn().mockResolvedValue(undefined)
    render(<TagEditor tags={['vip']} suggestions={[]} onSave={onSave} />)
    const input = screen.getByLabelText('Add tag')
    fireEvent.change(input, { target: { value: 'repeat' } })
    fireEvent.keyDown(input, { key: 'Enter' })
    await waitFor(() => expect(onSave).toHaveBeenCalledWith(['vip', 'repeat']))
  })

  it('removes a tag via its remove button', async () => {
    const onSave = vi.fn().mockResolvedValue(undefined)
    render(<TagEditor tags={['vip', 'repeat']} suggestions={[]} onSave={onSave} />)
    fireEvent.click(screen.getByRole('button', { name: 'Remove vip' }))
    await waitFor(() => expect(onSave).toHaveBeenCalledWith(['repeat']))
  })

  it('suggests existing org tags matching the input, excluding ones already applied', () => {
    render(<TagEditor tags={['vip']} suggestions={['vip', 'venue-partner', 'repeat']} onSave={vi.fn()} />)
    const input = screen.getByLabelText('Add tag')
    fireEvent.change(input, { target: { value: 've' } })
    expect(screen.getByRole('button', { name: 'venue-partner' })).toBeInTheDocument()
    expect(screen.queryByRole('button', { name: 'vip' })).not.toBeInTheDocument()
  })

  it('adds a suggestion on click', async () => {
    const onSave = vi.fn().mockResolvedValue(undefined)
    render(<TagEditor tags={[]} suggestions={['repeat']} onSave={onSave} />)
    fireEvent.change(screen.getByLabelText('Add tag'), { target: { value: 'rep' } })
    fireEvent.click(screen.getByRole('button', { name: 'repeat' }))
    await waitFor(() => expect(onSave).toHaveBeenCalledWith(['repeat']))
  })
})
