// Best-effort extraction of complete block objects from a PARTIAL structured-
// output JSON stream, for live preview only. The authoritative parse remains
// parseDraftResponse on the final message — nothing extracted here is applied.
import type { ProposalBlock } from '@/lib/types'

export function extractStreamedBlocks(partialJson: string): ProposalBlock[] {
  const start = partialJson.indexOf('"blocks"')
  if (start === -1) return []
  const arrayStart = partialJson.indexOf('[', start)
  if (arrayStart === -1) return []
  const out: ProposalBlock[] = []
  let depth = 0
  let inString = false
  let escaped = false
  let objStart = -1
  for (let i = arrayStart + 1; i < partialJson.length; i++) {
    const ch = partialJson[i]
    if (inString) {
      if (escaped) escaped = false
      else if (ch === '\\') escaped = true
      else if (ch === '"') inString = false
      continue
    }
    if (ch === '"') { inString = true; continue }
    if (ch === '{') { if (depth === 0) objStart = i; depth++; continue }
    if (ch === '}') {
      depth--
      if (depth === 0 && objStart !== -1) {
        try { out.push(JSON.parse(partialJson.slice(objStart, i + 1)) as ProposalBlock) } catch { /* skip malformed */ }
        objStart = -1
      }
      continue
    }
    if (ch === ']' && depth === 0) break // end of blocks array
  }
  return out
}
