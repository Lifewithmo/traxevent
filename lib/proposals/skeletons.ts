// Content skeletons for proposal creation (spec §3). One visual theme, three
// content skeletons + Blank. These are code constants: typed block factories
// whose placeholder text reads as instructions to the operator. Every
// scaffolded block carries `placeholder: true` — the builder greys it, the
// public page and print silently skip it, and the flag clears on first human
// edit. CRM autofill happens here only for the intro greeting; the proposal
// title is autofilled by the creation route.
import type { PlaceholderBlock } from '@/lib/proposal-builder-stubs'

export type SkeletonKey = 'full' | 'quick' | 'visual' | 'blank'

export interface SkeletonDef {
  key: SkeletonKey
  name: string
  description: string
  makeBlocks(opts: { contactName?: string }): PlaceholderBlock[]
}

// Ids only need to be unique within one proposal; skeleton blocks are always
// scaffolded into an empty document, so a fixed `sk-<n>` sequence is safe.
function mint(): () => string {
  let n = 0
  return () => `sk-${n++}`
}

function greeting(contactName?: string): string {
  const hi = contactName ? `Hi ${contactName} —` : 'Hi —'
  return `${hi} thanks for talking with us. Replace this paragraph with a short, personal intro: what the event is, when it is, and why you're the right fit.`
}

export const PROPOSAL_SKELETONS: SkeletonDef[] = [
  {
    key: 'full',
    name: 'Full proposal',
    description: 'Cover, your understanding of the job, recommendation, photos, and terms.',
    makeBlocks({ contactName }) {
      const id = mint()
      const blocks: PlaceholderBlock[] = [
        { id: id(), type: 'heading', text: 'Replace with a short, confident cover title', level: 2 },
        { id: id(), type: 'paragraph', text: greeting(contactName) },
        { id: id(), type: 'heading', text: 'What you told us', level: 3 },
        { id: id(), type: 'paragraph', text: 'Summarize the customer’s needs in their own words — date, headcount, venue, must-haves. Showing you listened is what sells.' },
        { id: id(), type: 'heading', text: 'Our recommendation', level: 3 },
        { id: id(), type: 'paragraph', text: 'Describe what you propose and why it fits. Keep it concrete: what happens, who does it, what it includes.' },
        { id: id(), type: 'image', url: '' },
        { id: id(), type: 'heading', text: 'Terms', level: 3 },
        { id: id(), type: 'paragraph', text: 'State your booking terms: what confirms the date, payment schedule, weather or cancellation policy.' },
      ]
      return blocks.map((b) => ({ ...b, placeholder: true }))
    },
  },
  {
    key: 'quick',
    name: 'Quick quote',
    description: 'A one-line intro and the price, front and center.',
    makeBlocks({ contactName }) {
      const id = mint()
      const blocks: PlaceholderBlock[] = [
        { id: id(), type: 'heading', text: 'Replace with a short quote title', level: 2 },
        { id: id(), type: 'paragraph', text: greeting(contactName) },
        { id: id(), type: 'heading', text: 'Terms', level: 3 },
        { id: id(), type: 'paragraph', text: 'One or two sentences: how long this quote is valid and what confirms the booking.' },
      ]
      return blocks.map((b) => ({ ...b, placeholder: true }))
    },
  },
  {
    key: 'visual',
    name: 'Visual showcase',
    description: 'Photo-forward: alternating images and short copy, plus a testimonial.',
    makeBlocks({ contactName }) {
      const id = mint()
      const blocks: PlaceholderBlock[] = [
        { id: id(), type: 'heading', text: 'Replace with a bold cover title', level: 2 },
        { id: id(), type: 'paragraph', text: greeting(contactName) },
        { id: id(), type: 'image', url: '' },
        { id: id(), type: 'paragraph', text: 'One short paragraph about the photo above — what it shows and why it matters for this event.' },
        { id: id(), type: 'image', url: '' },
        { id: id(), type: 'paragraph', text: 'Another short paragraph — a second look, a different angle, a different event.' },
        { id: id(), type: 'testimonial', quote: 'Replace with a real customer quote — ask permission first.' },
        { id: id(), type: 'heading', text: 'Terms', level: 3 },
        { id: id(), type: 'paragraph', text: 'State your booking terms: what confirms the date, payment schedule, cancellation policy.' },
      ]
      return blocks.map((b) => ({ ...b, placeholder: true }))
    },
  },
  {
    key: 'blank',
    name: 'Blank',
    description: 'Start from an empty document.',
    makeBlocks() {
      return []
    },
  },
]

export function getSkeleton(key: SkeletonKey): SkeletonDef {
  const found = PROPOSAL_SKELETONS.find((s) => s.key === key)
  if (!found) throw new Error(`Unknown skeleton: ${key}`)
  return found
}
