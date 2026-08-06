import { parseInline } from '@/lib/proposals/blocks'
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

function Block({ block }: { block: ProposalBlock }) {
  switch (block.type) {
    case 'heading':
      return block.level === 3
        ? <h3 className="mt-6 mb-2 text-lg font-semibold text-gray-900"><Inline text={block.text} /></h3>
        : <h2 className="mt-8 mb-3 text-xl font-bold text-gray-900"><Inline text={block.text} /></h2>
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
        <figure className="mb-6">
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
        <blockquote className="mb-6 border-l-4 border-gray-300 pl-4 italic text-gray-700">
          <p className="mb-1"><Inline text={block.quote} /></p>
          {block.attribution && (
            <cite className="text-sm not-italic text-gray-500">— {block.attribution}</cite>
          )}
        </blockquote>
      )
  }
}

export function ProposalDocument({ blocks }: { blocks?: ProposalBlock[] }) {
  if (!blocks || blocks.length === 0) return null
  return (
    <div className="mb-8">
      {blocks.map((b) => <Block key={b.id} block={b} />)}
    </div>
  )
}
