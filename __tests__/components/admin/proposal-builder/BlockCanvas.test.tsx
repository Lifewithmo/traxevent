import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen, fireEvent, waitFor } from '@testing-library/react'
import { BlockCanvas } from '@/components/admin/proposal-builder/BlockCanvas'
import type { ProposalBlock as PlaceholderBlock } from '@/lib/types'

const blocks: PlaceholderBlock[] = [
  { id: 'h1', type: 'heading', text: 'Our offer', level: 2 },
  { id: 'p1', type: 'paragraph', text: 'Replace this intro', placeholder: true },
]

type OnChange = (next: PlaceholderBlock[]) => void
type OnUpload = (file: File) => Promise<{ url: string }>

function lastChange(fn: ReturnType<typeof vi.fn<OnChange>>): PlaceholderBlock[] {
  return fn.mock.calls[fn.mock.calls.length - 1][0]
}

let onChange: ReturnType<typeof vi.fn<OnChange>>
let onUploadImage: ReturnType<typeof vi.fn<OnUpload>>

beforeEach(() => {
  onChange = vi.fn<OnChange>()
  onUploadImage = vi.fn<OnUpload>().mockResolvedValue({ url: 'https://storage/x.png' })
})

function canvas(over: Partial<Parameters<typeof BlockCanvas>[0]> = {}) {
  return render(
    <BlockCanvas
      blocks={blocks}
      onChange={onChange}
      onUploadImage={onUploadImage}
      disabled={false}
      {...over}
    />,
  )
}

describe('BlockCanvas', () => {
  it('renders blocks in the customer typography, placeholders greyed', () => {
    canvas()
    expect(screen.getByRole('heading', { name: 'Our offer', level: 2 })).toBeInTheDocument()
    const placeholderWrap = screen.getByText('Replace this intro').closest('[data-placeholder]')
    expect(placeholderWrap).not.toBeNull()
  })

  it('inserts a block of the chosen type through the + divider menu', () => {
    canvas()
    fireEvent.click(screen.getAllByRole('button', { name: /add block/i })[0])
    fireEvent.click(screen.getByRole('button', { name: /^paragraph$/i }))
    const next = lastChange(onChange)
    expect(next).toHaveLength(3)
    expect(next[0].type).toBe('paragraph')
  })

  it('moves a block down via the keyboard-accessible menu', () => {
    canvas()
    fireEvent.click(screen.getAllByRole('button', { name: /move down/i })[0])
    const next = lastChange(onChange)
    expect(next.map((b) => b.id)).toEqual(['p1', 'h1'])
  })

  it('deletes a block', () => {
    vi.spyOn(window, 'confirm').mockReturnValue(true)
    canvas()
    fireEvent.click(screen.getAllByRole('button', { name: /delete block/i })[0])
    expect(lastChange(onChange).map((b) => b.id)).toEqual(['p1'])
  })

  it('clears the placeholder flag when the operator commits an edit', () => {
    canvas()
    fireEvent.click(screen.getByText('Replace this intro'))
    const box = screen.getByRole('textbox', { name: /paragraph/i })
    fireEvent.change(box, { target: { value: 'Real intro now' } })
    fireEvent.keyDown(box, { key: 'Enter' })
    const next = lastChange(onChange)
    const edited = next.find((b) => b.id === 'p1') as PlaceholderBlock & { text: string }
    expect(edited.text).toBe('Real intro now')
    expect(edited.placeholder).toBeUndefined()
  })

  it('opens a placeholder block EMPTY — the instruction becomes the hint, not prefilled text', () => {
    canvas()
    fireEvent.click(screen.getByText('Replace this intro'))
    const box = screen.getByRole('textbox', { name: /paragraph/i }) as HTMLTextAreaElement
    // Browser-walk regression: prefilling the instruction made the first
    // keystroke APPEND to it instead of replacing it.
    expect(box.value).toBe('')
    expect(box.placeholder).toBe('Replace this intro')
  })

  it('uploads into an empty image block and lands the url on that block', async () => {
    canvas({
      blocks: [
        { id: 'img', type: 'image', url: '', placeholder: true },
        { id: 'p1', type: 'paragraph', text: 'Body' },
      ],
    })
    const input = screen.getByLabelText(/upload image/i)
    fireEvent.change(input, {
      target: { files: [new File(['x'], 'x.png', { type: 'image/png' })] },
    })
    await waitFor(() => expect(onChange).toHaveBeenCalled())
    const next = lastChange(onChange)
    const img = next.find((b) => b.id === 'img') as PlaceholderBlock & { url: string }
    expect(img.url).toBe('https://storage/x.png')
    expect(img.placeholder).toBeUndefined()
  })

  it('renders no editing chrome when disabled', () => {
    canvas({ disabled: true })
    expect(screen.queryByRole('button', { name: /add block/i })).not.toBeInTheDocument()
    expect(screen.queryByRole('button', { name: /move down/i })).not.toBeInTheDocument()
    fireEvent.click(screen.getByText('Replace this intro'))
    expect(screen.queryByRole('textbox')).not.toBeInTheDocument()
  })
})
