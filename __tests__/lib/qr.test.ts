import { describe, it, expect } from 'vitest'
import {
  encodeQr,
  qrSvgPath,
  qrViewBox,
  functionPatternMap,
  rsComputeDivisor,
  rsComputeRemainder,
  ECC_M_TABLE,
  ALIGNMENT_POSITIONS,
  QR_QUIET_ZONE,
  type QrCode,
} from '@/lib/qr'

// ── Independent extraction helpers (round-trip verification) ────────────────
// These re-implement the READ side of the QR spec from scratch (mask formulas,
// format BCH, zigzag traversal, de-interleave) so a defect in the encoder's
// data path garbles the extraction and fails the payload assertions — decode
// hardware not required, but the data→matrix→data loop is closed.

/** ISO 18004 mask predicates, written independently of lib/qr's copies. */
function testMask(mask: number, x: number, y: number): boolean {
  switch (mask) {
    case 0: return (x + y) % 2 === 0
    case 1: return y % 2 === 0
    case 2: return x % 3 === 0
    case 3: return (x + y) % 3 === 0
    case 4: return (Math.floor(x / 3) + Math.floor(y / 2)) % 2 === 0
    case 5: return ((x * y) % 2) + ((x * y) % 3) === 0
    case 6: return (((x * y) % 2) + ((x * y) % 3)) % 2 === 0
    case 7: return (((x + y) % 2) + ((x * y) % 3)) % 2 === 0
    default: throw new Error('bad mask')
  }
}

/** Read the 15 format bits from the FIRST copy (around the top-left finder). */
function readFormatBits(qr: QrCode): number {
  const m = qr.modules
  const bits: boolean[] = []
  for (let i = 0; i <= 5; i++) bits.push(m[i][8])
  bits.push(m[7][8])
  bits.push(m[8][8])
  bits.push(m[8][7])
  for (let i = 9; i < 15; i++) bits.push(m[8][14 - i])
  let v = 0
  bits.forEach((b, i) => {
    if (b) v |= 1 << i
  })
  return v
}

/** Decode + BCH-verify the format info; returns { ecl, mask }. */
function decodeFormat(qr: QrCode): { ecl: number; mask: number } {
  const raw = readFormatBits(qr) ^ 0x5412
  const data = raw >>> 10
  // Recompute the BCH remainder from the 5 data bits and demand equality.
  let rem = data
  for (let i = 0; i < 10; i++) rem = (rem << 1) ^ ((rem >>> 9) * 0x537)
  expect(rem & 0x3ff).toBe(raw & 0x3ff)
  return { ecl: data >>> 3, mask: data & 7 }
}

/** Un-mask, zigzag-read, and de-interleave the codewords back out. */
function extractCodewords(qr: QrCode, mask: number): number[] {
  const isFunction = functionPatternMap(qr.version)
  const size = qr.size
  const bits: boolean[] = []
  for (let right = size - 1; right >= 1; right -= 2) {
    if (right === 6) right = 5
    for (let vert = 0; vert < size; vert++) {
      for (let j = 0; j < 2; j++) {
        const x = right - j
        const upward = ((right + 1) & 2) === 0
        const y = upward ? size - 1 - vert : vert
        if (!isFunction[y][x]) {
          bits.push(qr.modules[y][x] !== testMask(mask, x, y))
        }
      }
    }
  }
  const codewords: number[] = []
  for (let i = 0; i + 8 <= bits.length; i += 8) {
    let b = 0
    for (let j = 0; j < 8; j++) if (bits[i + j]) b |= 1 << (7 - j)
    codewords.push(b)
  }
  return codewords
}

/** Reverse the block interleave; returns { data, blocks } (data + per-block ecc). */
function deinterleave(codewords: number[], version: number): { data: number[]; blocks: { dat: number[]; ecc: number[] }[] } {
  const [total, eccPerBlock, numBlocks] = ECC_M_TABLE[version - 1]
  expect(codewords.length).toBe(total)
  const numShortBlocks = numBlocks - (total % numBlocks)
  const shortBlockLen = Math.floor(total / numBlocks)
  const shortDataLen = shortBlockLen - eccPerBlock

  const blocks = Array.from({ length: numBlocks }, () => ({ dat: [] as number[], ecc: [] as number[] }))
  let k = 0
  for (let i = 0; i < shortBlockLen + 1 - eccPerBlock; i++) {
    for (let j = 0; j < numBlocks; j++) {
      if (i === shortDataLen && j < numShortBlocks) continue
      blocks[j].dat.push(codewords[k++])
    }
  }
  for (let i = 0; i < eccPerBlock; i++) {
    for (let j = 0; j < numBlocks; j++) blocks[j].ecc.push(codewords[k++])
  }
  expect(k).toBe(total)
  return { data: blocks.flatMap((b) => b.dat), blocks }
}

/** Full round trip: matrix → format → codewords → RS check → payload bytes. */
function roundTrip(text: string): void {
  const qr = encodeQr(text)
  const { ecl, mask } = decodeFormat(qr)
  expect(ecl).toBe(0) // ECC level M encodes as 0b00
  expect(mask).toBe(qr.mask)

  const { data, blocks } = deinterleave(extractCodewords(qr, mask), qr.version)

  // Every block's ECC must equal the Reed-Solomon remainder of its data.
  const [, eccPerBlock] = ECC_M_TABLE[qr.version - 1]
  const divisor = rsComputeDivisor(eccPerBlock)
  for (const b of blocks) expect(b.ecc).toEqual(rsComputeRemainder(b.dat, divisor))

  // Bit stream: mode 0100, char count, then the UTF-8 payload.
  const expected = Array.from(new TextEncoder().encode(text))
  const ccBits = qr.version <= 9 ? 8 : 16
  const bitAt = (i: number) => (data[i >>> 3] >>> (7 - (i & 7))) & 1
  const readInt = (start: number, len: number) => {
    let v = 0
    for (let i = 0; i < len; i++) v = (v << 1) | bitAt(start + i)
    return v
  }
  expect(readInt(0, 4)).toBe(0x4)
  expect(readInt(4, ccBits)).toBe(expected.length)
  const payload = expected.map((_, i) => readInt(4 + ccBits + i * 8, 8))
  expect(payload).toEqual(expected)
}

// ── Structural invariants ───────────────────────────────────────────────────

function expectFinderAt(qr: QrCode, cx: number, cy: number): void {
  for (let dy = -3; dy <= 3; dy++) {
    for (let dx = -3; dx <= 3; dx++) {
      const dist = Math.max(Math.abs(dx), Math.abs(dy))
      expect(qr.modules[cy + dy][cx + dx]).toBe(dist !== 2)
    }
  }
}

describe('encodeQr — structure', () => {
  it('sizes the matrix as 17 + 4×version and picks the smallest fitting version', () => {
    const small = encodeQr('https://x.co/a')
    expect(small.version).toBe(1)
    expect(small.size).toBe(21)
    expect(small.modules).toHaveLength(21)

    const medium = encodeQr('https://traxevent.com/demo-brewtrax/smith-wedding-2026/ops/runsheet')
    expect(medium.size).toBe(17 + 4 * medium.version)
  })

  it('draws the three finder patterns with separators and the timing patterns', () => {
    const qr = encodeQr('https://traxevent.com/o/e/ops/loadout')
    expectFinderAt(qr, 3, 3)
    expectFinderAt(qr, qr.size - 4, 3)
    expectFinderAt(qr, 3, qr.size - 4)
    // Timing row + column alternate dark/light between the finders.
    for (let i = 8; i < qr.size - 8; i++) {
      expect(qr.modules[6][i]).toBe(i % 2 === 0)
      expect(qr.modules[i][6]).toBe(i % 2 === 0)
    }
    // The always-dark module by the bottom-left finder.
    expect(qr.modules[qr.size - 8][8]).toBe(true)
  })

  it('places alignment patterns at the table positions (v2+)', () => {
    // ~62 bytes → version 4 at ECC M (capacity table); alignment center (26,26).
    const url = `https://traxevent.com/demo/x/ops/loadout?long=${'a'.repeat(16)}`
    const qr = encodeQr(url)
    expect(qr.version).toBeGreaterThanOrEqual(2)
    const positions = ALIGNMENT_POSITIONS[qr.version - 1]
    const center = positions[positions.length - 1]
    // 5×5 alignment pattern: dark center, light ring, dark border.
    for (let dy = -2; dy <= 2; dy++) {
      for (let dx = -2; dx <= 2; dx++) {
        expect(qr.modules[center + dy][center + dx]).toBe(Math.max(Math.abs(dx), Math.abs(dy)) !== 1)
      }
    }
  })

  it('is deterministic — the same input yields the identical matrix and mask', () => {
    const a = encodeQr('https://traxevent.com/demo/x/ops/runsheet')
    const b = encodeQr('https://traxevent.com/demo/x/ops/runsheet')
    expect(b.mask).toBe(a.mask)
    expect(b.modules).toEqual(a.modules)
  })

  it('throws past version 10 capacity instead of emitting a truncated symbol', () => {
    expect(() => encodeQr('x'.repeat(214))).toThrow(/too long/i)
    expect(encodeQr('x'.repeat(213)).version).toBe(10)
  })
})

describe('encodeQr — data round trip (extraction re-implements the read side)', () => {
  it('recovers the exact payload from a version-1 symbol', () => {
    roundTrip('https://x.co/a')
  })

  it('recovers the exact payload from a mid-size admin URL', () => {
    roundTrip('https://traxevent.com/demo-brewtrax/smith-wedding-2026/ops/runsheet')
  })

  it('recovers the exact payload from a long preview-host URL (multi-block interleave)', () => {
    roundTrip('https://traxevent-git-fix-events-open-items-verra-works.vercel.app/demo-brewtrax/smith-wedding-2026/ops/loadout')
  })

  it('recovers a version-10 payload (16-bit char count path)', () => {
    roundTrip(`https://traxevent.com/x/y/ops/loadout?token=${'k'.repeat(160)}`)
  })
})

// Fixed known-good matrix pin: generated by this encoder, verified by the
// independent round-trip extraction above, and frozen here so any regression
// in tables, masking, or placement shows up as a diff — determinism is part of
// the print contract (reprinting an unchanged sheet reprints the same code).
describe('encodeQr — pinned matrix', () => {
  it('matches the frozen version-1 matrix for a short URL', () => {
    const qr = encodeQr('https://x.co/a')
    const rows = qr.modules.map((row) => row.map((m) => (m ? '#' : '.')).join(''))
    expect({ version: qr.version, mask: qr.mask, rows }).toMatchSnapshot()
  })
})

describe('qrSvgPath / qrViewBox', () => {
  it('emits one unit square per dark module inside a quiet-zone viewBox', () => {
    const qr = encodeQr('https://x.co/a')
    const path = qrSvgPath(qr)
    const darkCount = qr.modules.flat().filter(Boolean).length
    expect(path.match(/M\d+ \d+h1v1h-1z/g)).toHaveLength(darkCount)
    expect(qrViewBox(qr)).toBe(`-${QR_QUIET_ZONE} -${QR_QUIET_ZONE} ${21 + 2 * QR_QUIET_ZONE} ${21 + 2 * QR_QUIET_ZONE}`)
  })
})
