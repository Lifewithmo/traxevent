import { parseInline } from '@/lib/proposals/blocks'
import type { PlaceholderBlock } from '@/lib/proposal-builder-stubs'
import type { ProposalBlock } from '@/lib/types'

function Inline({ text }: { text: string }) {
  return (
    <>
      {parseInline(text).map((t, i) => {
        if (t.bold) return <strong key={i}>{t.text}</strong>
        if (t.italic) return <em key={i}>{t.text}</em>
        return <span key={i}>{t.text}</span>
      })}
    </>
  )
}

// Single-block presentation, exported so the builder canvas renders the
// customer's exact typography around its editing chrome. All colors come from
// the --proposal-* variables (ProposalTheme provider) with neutral fallbacks,
// so builder, public, and print surfaces cannot drift.
// Print page-break rules live here too (spec §6): headings keep their
// following content; images and testimonials never split across pages.
export function ProposalBlockView({ block }: { block: ProposalBlock }) {
  switch (block.type) {
    case 'heading':
      return block.level === 3
        ? (
          <h3
            className="mt-6 mb-2 text-lg font-semibold break-after-avoid"
            style={{ color: 'var(--proposal-accent, #111827)' }}
          >
            <Inline text={block.text} />
          </h3>
        )
        : (
          <h2
            className="mt-8 mb-3 text-xl font-bold break-after-avoid"
            style={{ color: 'var(--proposal-accent, #111827)' }}
          >
            <Inline text={block.text} />
          </h2>
        )
    case 'paragraph':
      return <p className="mb-4 leading-relaxed text-gray-700"><Inline text={block.text} /></p>
    case 'list': {
      const items = block.items.map((item, i) => (
        <li key={i} className="mb-1"><Inline text={item} /></li>
      ))
      return block.ordered
        ? <ol className="mb-4 list-decimal pl-6 text-gray-700">{items}</ol>
        : <ul className="mb-4 list-disc pl-6 text-gray-700">{items}</ul>
    }
    case 'image':
      return (
        <figure className="mb-6 break-inside-avoid">
          {/* Plain <img> is deliberate: next.config.ts has no images.remotePatterns,
              and next/image would couple it to the storage bucket domain. */}
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src={block.url} alt={block.alt ?? ''} loading="lazy" className="w-full rounded-md" />
          {block.caption && (
            <figcaption className="mt-2 text-sm text-gray-500">{block.caption}</figcaption>
          )}
        </figure>
      )
    case 'testimonial':
      return (
        <blockquote
          className="mb-6 border-l-4 pl-4 italic text-gray-700 break-inside-avoid"
          style={{ borderColor: 'var(--proposal-secondary, #d1d5db)' }}
        >
          <p className="mb-1"><Inline text={block.quote} /></p>
          {block.attribution && (
            <cite className="text-sm not-italic text-gray-500">— {block.attribution}</cite>
          )}
        </blockquote>
      )
  }
}

// Placeholder blocks (spec §3) are un-replaced skeleton instructions. They
// are SILENTLY skipped here by default so they can never reach a customer;
// only the builder canvas opts in via `showPlaceholders`.
export function ProposalDocument({
  blocks,
  showPlaceholders = false,
}: {
  blocks?: PlaceholderBlock[]
  showPlaceholders?: boolean
}) {
  const visible = (blocks ?? []).filter((b) => showPlaceholders || b.placeholder !== true)
  if (visible.length === 0) return null
  return (
    <div className="mb-8">
      {visible.map((b) => <ProposalBlockView key={b.id} block={b} />)}
    </div>
  )
}
