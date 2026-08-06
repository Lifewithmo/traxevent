import type { ProposalBlock } from '@/lib/types'

export const MAX_BLOCKS = 100
export const MAX_PARAGRAPH_CHARS = 5000
export const MAX_LIST_ITEMS = 50
export const MAX_LIST_ITEM_CHARS = 500

export interface NormalizeResult {
  blocks: ProposalBlock[]
  adjustments: string[]
}

export interface InlineToken {
  text: string
  bold?: boolean
  italic?: boolean
}

function str(v: unknown): string {
  return typeof v === 'string' ? v : ''
}

function isHttpUrl(v: unknown): boolean {
  const s = str(v)
  return /^https?:\/\//i.test(s)
}

/**
 * Validate and bound untrusted block input. Total size matters: the whole
 * proposal is one Firestore document with a 1MB ceiling, and the caps here
 * are the only enforcement point — the AI generation schema in increment 2
 * cannot express length constraints.
 *
 * Invalid blocks are dropped rather than throwing, and every change is
 * reported in `adjustments` so the caller can tell the user what happened.
 */
export function normalizeBlocks(input: unknown): NormalizeResult {
  const adjustments: string[] = []
  if (!Array.isArray(input)) return { blocks: [], adjustments }

  const capped = input.slice(0, MAX_BLOCKS)
  if (input.length > capped.length) {
    adjustments.push(`Kept the first ${MAX_BLOCKS} blocks and dropped ${input.length - MAX_BLOCKS}.`)
  }

  const seen = new Set<string>()
  const blocks: ProposalBlock[] = []

  capped.forEach((raw, index) => {
    if (!raw || typeof raw !== 'object') return
    const b = raw as Record<string, unknown>

    let id = str(b.id).trim()
    if (!id || seen.has(id)) id = `blk-${index}`
    seen.add(id)

    switch (b.type) {
      case 'heading': {
        const text = str(b.text).trim()
        if (!text) return
        const level = b.level === 3 ? 3 : 2
        blocks.push({ id, type: 'heading', text, level })
        return
      }
      case 'paragraph': {
        let text = str(b.text).trim()
        if (!text) return
        if (text.length > MAX_PARAGRAPH_CHARS) {
          text = text.slice(0, MAX_PARAGRAPH_CHARS)
          adjustments.push(`Shortened a paragraph to ${MAX_PARAGRAPH_CHARS} characters.`)
        }
        blocks.push({ id, type: 'paragraph', text })
        return
      }
      case 'list': {
        if (!Array.isArray(b.items)) return
        let items = b.items.map((i) => str(i).trim()).filter(Boolean)
        if (items.length === 0) return
        if (items.length > MAX_LIST_ITEMS) {
          items = items.slice(0, MAX_LIST_ITEMS)
          adjustments.push(`Shortened a list to ${MAX_LIST_ITEMS} items.`)
        }
        items = items.map((i) =>
          i.length > MAX_LIST_ITEM_CHARS ? i.slice(0, MAX_LIST_ITEM_CHARS) : i,
        )
        blocks.push({ id, type: 'list', items, ...(b.ordered === true ? { ordered: true } : {}) })
        return
      }
      case 'image': {
        if (!isHttpUrl(b.url)) return
        const alt = str(b.alt).trim()
        const caption = str(b.caption).trim()
        blocks.push({
          id, type: 'image', url: str(b.url),
          ...(alt ? { alt } : {}), ...(caption ? { caption } : {}),
        })
        return
      }
      case 'testimonial': {
        const quote = str(b.quote).trim()
        if (!quote) return
        const attribution = str(b.attribution).trim()
        blocks.push({ id, type: 'testimonial', quote, ...(attribution ? { attribution } : {}) })
        return
      }
      default:
        adjustments.push(`Dropped an unsupported block of type "${str(b.type) || 'unknown'}".`)
    }
  })

  return { blocks, adjustments }
}

/**
 * Parse the supported inline markdown subset (**bold**, *italic*) into tokens.
 * Returns data, never markup — the renderer turns tokens into React elements,
 * so generated text can never inject HTML.
 */
export function parseInline(text: string): InlineToken[] {
  const parts = text.split(/(\*\*[^*]+\*\*|\*[^*\s][^*]*\*)/g).filter((p) => p !== '')
  if (parts.length === 0) return [{ text: '' }]
  return parts.map((p) => {
    if (p.startsWith('**') && p.endsWith('**') && p.length > 4) {
      return { text: p.slice(2, -2), bold: true }
    }
    if (p.startsWith('*') && p.endsWith('*') && p.length > 2) {
      return { text: p.slice(1, -1), italic: true }
    }
    return { text: p }
  })
}
