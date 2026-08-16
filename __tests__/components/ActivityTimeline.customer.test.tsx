import { render, screen } from '@testing-library/react'
import { it, expect, vi } from 'vitest'
import { ActivityTimeline } from '@/components/admin/opportunity/ActivityTimeline'

const createNote = vi.fn(async (..._args: unknown[]) => {})
vi.mock('@/actions/notes', () => ({ createNote: (...a: unknown[]) => createNote(...a) }))
vi.mock('next/navigation', () => ({ useRouter: () => ({ refresh: () => {} }) }))

it('adds a customer note through the parent-agnostic props', async () => {
  const { default: userEvent } = await import('@testing-library/user-event')
  const user = userEvent.setup()
  render(<ActivityTimeline orgId="o" parentType="customer" parentId="c1" activity={[]} />)
  await user.click(screen.getByRole('button', { name: /add a note/i }))
  await user.type(screen.getByPlaceholderText(/add a note/i), 'Called about the wedding')
  await user.click(screen.getByRole('button', { name: /add note/i }))
  expect(createNote).toHaveBeenCalledWith('o', expect.objectContaining({ parent_type: 'customer', parent_id: 'c1', body: 'Called about the wedding' }))
})
