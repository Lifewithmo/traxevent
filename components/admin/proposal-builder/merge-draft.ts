// Pure merge for AI "draft into document" mode (spec §3 AI seating): the
// draft fills placeholder blocks and leaves human-authored blocks alone.
// Overwrite-protection is structural — the placeholder flag clears on first
// human edit, and only flagged blocks are ever fillable — so a generation
// returning after the user hand-edited a placeholder cannot overwrite it.
import type { ProposalBlock as PlaceholderBlock } from '@/lib/types'
import type { ProposalBlock } from '@/lib/types'

export function mergeDraftIntoBlocks(
  current: PlaceholderBlock[],
  draft: ProposalBlock[],
): { blocks: PlaceholderBlock[]; filled: number } {
  // An empty document has no slots to fill: the draft IS the document.
  if (current.length === 0) {
    return { blocks: draft.map((b) => ({ ...b })), filled: draft.length }
  }

  const unused = [...draft]
  let filled = 0
  const blocks = current.map((block) => {
    if (block.placeholder !== true) return block
    const matchIndex = unused.findIndex((d) => d.type === block.type)
    if (matchIndex === -1) return block
    const [match] = unused.splice(matchIndex, 1)
    filled += 1
    // Keep the placeholder's id (stable for React keys and server ids) and
    // clear the flag by omission — the block is now real content.
    const { id: _draftId, ...content } = match
    return { ...content, id: block.id } as PlaceholderBlock
  })
  return { blocks, filled }
}
