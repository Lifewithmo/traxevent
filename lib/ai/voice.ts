// Voice few-shot material (redesign spec §4): pure helpers, no DB imports.
// The org's most recently SENT proposals are ground truth for how the
// operator writes — every human edit to a prior AI draft is baked in.
import type { ProposalBlock } from '@/lib/types'

export interface VoiceExample {
  proposal_id: string
  title: string
  text: string
  sent_at: string
}

export const MAX_VOICE_EXAMPLES = 3
// Guardrail so three long proposals can't blow out the cached prefix.
const MAX_EXAMPLE_CHARS = 4000

export function blocksToVoiceText(blocks: ProposalBlock[]): string {
  const lines: string[] = []
  for (const b of blocks) {
    if ((b as { placeholder?: boolean }).placeholder === true) continue
    if (b.type === 'heading') lines.push(`## ${b.text}`)
    else if (b.type === 'paragraph') lines.push(b.text)
    else if (b.type === 'list') lines.push(...b.items.map((i) => `- ${i}`))
    else if (b.type === 'testimonial') lines.push(`"${b.quote}"${b.attribution ? ` — ${b.attribution}` : ''}`)
    // images and unknown block types carry no voice
  }
  return lines.join('\n').slice(0, MAX_EXAMPLE_CHARS)
}

export function pushVoiceExample(existing: VoiceExample[], next: VoiceExample): VoiceExample[] {
  return [next, ...existing.filter((e) => e.proposal_id !== next.proposal_id)].slice(0, MAX_VOICE_EXAMPLES)
}

export function serializeVoice(examples: VoiceExample[], note?: string): string | null {
  const trimmedNote = note?.trim()
  if (!examples.length && !trimmedNote) return null
  const parts: string[] = ['# Voice (write like the operator)']
  if (trimmedNote) parts.push(`Operator's own description of how they sound: ${trimmedNote}`)
  for (const ex of examples) {
    parts.push(`## Example — "${ex.title}" (sent ${ex.sent_at})\n${ex.text}`)
  }
  parts.push('Match the tone, vocabulary, and sentence rhythm of these examples. Never copy their event-specific facts.')
  return parts.join('\n\n')
}
