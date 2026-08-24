/*
 * Byte-mode QR Code encoder — vendored, zero-dependency (inc-2 S4.1).
 *
 * Adapted from Project Nayuki's "QR Code generator library" (TypeScript),
 * https://www.nayuki.io/page/qr-code-generator-library — trimmed to what the
 * printed→live bridge needs: byte mode, error-correction level M, versions
 * 1–10 (≈213 UTF-8 bytes), best-mask selection, SVG path output. The decision
 * to VENDOR rather than add an npm dependency is the spec's ("no npm dep in a
 * deliberately lean tree").
 *
 * MIT License — Copyright © Project Nayuki
 *
 * Permission is hereby granted, free of charge, to any person obtaining a copy
 * of this software and associated documentation files (the "Software"), to
 * deal in the Software without restriction, including without limitation the
 * rights to use, copy, modify, merge, publish, distribute, sublicense, and/or
 * sell copies of the Software, and to permit persons to whom the Software is
 * furnished to do so, subject to the following conditions:
 *
 * - The above copyright notice and this permission notice shall be included in
 *   all copies or substantial portions of the Software.
 * - The Software is provided "as is", without warranty of any kind, express or
 *   implied, including but not limited to the warranties of merchantability,
 *   fitness for a particular purpose and noninfringement. In no event shall
 *   the authors or copyright holders be liable for any claim, damages or other
 *   liability, whether in an action of contract, tort or otherwise, arising
 *   from, out of or in connection with the Software or the use of other
 *   dealings in the Software.
 */

export interface QrCode {
  /** QR version, 1–10. */
  version: number
  /** Modules per side: 17 + 4 × version. */
  size: number
  /** Mask pattern applied, 0–7 (chosen by penalty score). */
  mask: number
  /** modules[row][col] — true = dark. */
  modules: boolean[][]
}

/** Standard quiet zone: 4 light modules on every side. */
export const QR_QUIET_ZONE = 4

const MAX_VERSION = 10

// Error-correction level M (formatBits = 0b00). Per version 1–10:
// [total codewords, ECC codewords per block, number of blocks].
// Exported for the round-trip extraction test.
export const ECC_M_TABLE: ReadonlyArray<readonly [number, number, number]> = [
  [26, 10, 1],   // v1  → 16 data codewords
  [44, 16, 1],   // v2  → 28
  [70, 26, 1],   // v3  → 44
  [100, 18, 2],  // v4  → 64
  [134, 24, 2],  // v5  → 86
  [172, 16, 4],  // v6  → 108
  [196, 18, 4],  // v7  → 124
  [242, 22, 4],  // v8  → 154
  [292, 22, 5],  // v9  → 182
  [346, 26, 5],  // v10 → 216
]

// Alignment-pattern center positions per version (standard table, v1 has none).
export const ALIGNMENT_POSITIONS: ReadonlyArray<readonly number[]> = [
  [], [6, 18], [6, 22], [6, 26], [6, 30], [6, 34], [6, 22, 38], [6, 24, 42], [6, 26, 46], [6, 28, 50],
]

const ECL_M_FORMAT_BITS = 0

function dataCodewords(version: number): number {
  const [total, eccPerBlock, numBlocks] = ECC_M_TABLE[version - 1]
  return total - eccPerBlock * numBlocks
}

function charCountBits(version: number): number {
  return version <= 9 ? 8 : 16
}

/** UTF-8 byte capacity at ECC M for a version (mode + count header deducted). */
function byteCapacity(version: number): number {
  return Math.floor((dataCodewords(version) * 8 - 4 - charCountBits(version)) / 8)
}

// ── GF(256) Reed-Solomon (reduce polynomial 0x11D) ───────────────────────────

function gfMultiply(x: number, y: number): number {
  let z = 0
  for (let i = 7; i >= 0; i--) {
    z = (z << 1) ^ ((z >>> 7) * 0x11d)
    z ^= ((y >>> i) & 1) * x
  }
  return z & 0xff
}

/** Exported for the test suite's data→matrix→data round-trip verification. */
export function rsComputeDivisor(degree: number): number[] {
  // Product of (x - r^i) for i = 0 .. degree-1; leading coefficient dropped.
  const result: number[] = new Array<number>(degree).fill(0)
  result[degree - 1] = 1
  let root = 1
  for (let i = 0; i < degree; i++) {
    for (let j = 0; j < result.length; j++) {
      result[j] = gfMultiply(result[j], root)
      if (j + 1 < result.length) result[j] ^= result[j + 1]
    }
    root = gfMultiply(root, 0x02)
  }
  return result
}

/** Exported for the test suite's data→matrix→data round-trip verification. */
export function rsComputeRemainder(data: readonly number[], divisor: readonly number[]): number[] {
  const result: number[] = divisor.map(() => 0)
  for (const b of data) {
    const factor = b ^ (result.shift() as number)
    result.push(0)
    divisor.forEach((coef, i) => {
      result[i] ^= gfMultiply(coef, factor)
    })
  }
  return result
}

// ── Encoding pipeline ────────────────────────────────────────────────────────

function toUtf8(text: string): number[] {
  return Array.from(new TextEncoder().encode(text))
}

function buildCodewords(bytes: number[], version: number): number[] {
  const bits: number[] = []
  const appendBits = (val: number, len: number) => {
    for (let i = len - 1; i >= 0; i--) bits.push((val >>> i) & 1)
  }
  appendBits(0x4, 4) // byte mode
  appendBits(bytes.length, charCountBits(version))
  for (const b of bytes) appendBits(b, 8)

  const capacityBits = dataCodewords(version) * 8
  // Terminator (up to 4 zero bits), then pad to a byte boundary.
  appendBits(0, Math.min(4, capacityBits - bits.length))
  appendBits(0, (8 - (bits.length % 8)) % 8)
  // Alternating pad bytes until full.
  for (let pad = 0xec; bits.length < capacityBits; pad ^= 0xec ^ 0x11) appendBits(pad, 8)

  const codewords: number[] = new Array<number>(bits.length / 8).fill(0)
  bits.forEach((bit, i) => {
    codewords[i >>> 3] |= bit << (7 - (i & 7))
  })
  return codewords
}

function addEccAndInterleave(data: number[], version: number): number[] {
  const [totalCodewords, eccPerBlock, numBlocks] = ECC_M_TABLE[version - 1]
  const numShortBlocks = numBlocks - (totalCodewords % numBlocks)
  const shortBlockLen = Math.floor(totalCodewords / numBlocks)

  const blocks: number[][] = []
  const rsDiv = rsComputeDivisor(eccPerBlock)
  for (let i = 0, k = 0; i < numBlocks; i++) {
    const dataLen = shortBlockLen - eccPerBlock + (i < numShortBlocks ? 0 : 1)
    const dat = data.slice(k, k + dataLen)
    k += dataLen
    const ecc = rsComputeRemainder(dat, rsDiv)
    if (i < numShortBlocks) dat.push(0) // placeholder so every block is "long"
    blocks.push(dat.concat(ecc))
  }

  const result: number[] = []
  for (let i = 0; i < blocks[0].length; i++) {
    blocks.forEach((block, j) => {
      // Skip the padding byte in short blocks.
      if (i !== shortBlockLen - eccPerBlock || j >= numShortBlocks) result.push(block[i])
    })
  }
  return result
}

// ── Matrix drawing ───────────────────────────────────────────────────────────

interface Grid {
  size: number
  modules: boolean[][]
  isFunction: boolean[][]
}

function setFunctionModule(g: Grid, x: number, y: number, isDark: boolean): void {
  g.modules[y][x] = isDark
  g.isFunction[y][x] = true
}

function drawFinderPattern(g: Grid, x: number, y: number): void {
  for (let dy = -4; dy <= 4; dy++) {
    for (let dx = -4; dx <= 4; dx++) {
      const dist = Math.max(Math.abs(dx), Math.abs(dy))
      const xx = x + dx
      const yy = y + dy
      if (xx >= 0 && xx < g.size && yy >= 0 && yy < g.size) {
        setFunctionModule(g, xx, yy, dist !== 2 && dist !== 4)
      }
    }
  }
}

function drawAlignmentPattern(g: Grid, x: number, y: number): void {
  for (let dy = -2; dy <= 2; dy++) {
    for (let dx = -2; dx <= 2; dx++) {
      setFunctionModule(g, x + dx, y + dy, Math.max(Math.abs(dx), Math.abs(dy)) !== 1)
    }
  }
}

function getBit(x: number, i: number): boolean {
  return ((x >>> i) & 1) !== 0
}

function drawFormatBits(g: Grid, mask: number): void {
  // BCH(15,5): data = ECL bits (M = 0b00) then mask.
  const data = (ECL_M_FORMAT_BITS << 3) | mask
  let rem = data
  for (let i = 0; i < 10; i++) rem = (rem << 1) ^ ((rem >>> 9) * 0x537)
  const bits = ((data << 10) | rem) ^ 0x5412

  // First copy (around the top-left finder).
  for (let i = 0; i <= 5; i++) setFunctionModule(g, 8, i, getBit(bits, i))
  setFunctionModule(g, 8, 7, getBit(bits, 6))
  setFunctionModule(g, 8, 8, getBit(bits, 7))
  setFunctionModule(g, 7, 8, getBit(bits, 8))
  for (let i = 9; i < 15; i++) setFunctionModule(g, 14 - i, 8, getBit(bits, i))

  // Second copy (split between the other two finders).
  for (let i = 0; i < 8; i++) setFunctionModule(g, g.size - 1 - i, 8, getBit(bits, i))
  for (let i = 8; i < 15; i++) setFunctionModule(g, 8, g.size - 15 + i, getBit(bits, i))
  setFunctionModule(g, 8, g.size - 8, true) // the always-dark module
}

function drawVersionBits(g: Grid, version: number): void {
  if (version < 7) return
  // BCH(18,6).
  let rem = version
  for (let i = 0; i < 12; i++) rem = (rem << 1) ^ ((rem >>> 11) * 0x1f25)
  const bits = (version << 12) | rem
  for (let i = 0; i < 18; i++) {
    const bit = getBit(bits, i)
    const a = g.size - 11 + (i % 3)
    const b = Math.floor(i / 3)
    setFunctionModule(g, a, b, bit)
    setFunctionModule(g, b, a, bit)
  }
}

function drawFunctionPatterns(g: Grid, version: number): void {
  for (let i = 0; i < g.size; i++) {
    setFunctionModule(g, 6, i, i % 2 === 0)
    setFunctionModule(g, i, 6, i % 2 === 0)
  }
  drawFinderPattern(g, 3, 3)
  drawFinderPattern(g, g.size - 4, 3)
  drawFinderPattern(g, 3, g.size - 4)

  const align = ALIGNMENT_POSITIONS[version - 1]
  const n = align.length
  for (let i = 0; i < n; i++) {
    for (let j = 0; j < n; j++) {
      // Skip the three corners occupied by finder patterns.
      if ((i === 0 && j === 0) || (i === 0 && j === n - 1) || (i === n - 1 && j === 0)) continue
      drawAlignmentPattern(g, align[i], align[j])
    }
  }

  drawFormatBits(g, 0) // reserve the modules; real bits drawn after masking
  drawVersionBits(g, version)
}

function drawCodewords(g: Grid, codewords: number[]): void {
  let i = 0
  for (let right = g.size - 1; right >= 1; right -= 2) {
    if (right === 6) right = 5
    for (let vert = 0; vert < g.size; vert++) {
      for (let j = 0; j < 2; j++) {
        const x = right - j
        const upward = ((right + 1) & 2) === 0
        const y = upward ? g.size - 1 - vert : vert
        if (!g.isFunction[y][x] && i < codewords.length * 8) {
          g.modules[y][x] = getBit(codewords[i >>> 3], 7 - (i & 7))
          i++
        }
      }
    }
  }
}

function maskPredicate(mask: number, x: number, y: number): boolean {
  switch (mask) {
    case 0: return (x + y) % 2 === 0
    case 1: return y % 2 === 0
    case 2: return x % 3 === 0
    case 3: return (x + y) % 3 === 0
    case 4: return (Math.floor(x / 3) + Math.floor(y / 2)) % 2 === 0
    case 5: return ((x * y) % 2) + ((x * y) % 3) === 0
    case 6: return (((x * y) % 2) + ((x * y) % 3)) % 2 === 0
    default: return (((x + y) % 2) + ((x * y) % 3)) % 2 === 0
  }
}

function applyMask(g: Grid, mask: number): void {
  for (let y = 0; y < g.size; y++) {
    for (let x = 0; x < g.size; x++) {
      if (!g.isFunction[y][x] && maskPredicate(mask, x, y)) g.modules[y][x] = !g.modules[y][x]
    }
  }
}

// Penalty scoring — determines only WHICH mask is chosen (any mask yields a
// valid symbol; the format bits record the choice), so the constants follow
// the spec: N1=3, N2=3, N3=40, N4=10.
function penaltyScore(g: Grid): number {
  const { size, modules } = g
  let score = 0

  const runScore = (line: (i: number) => boolean) => {
    let s = 0
    let runColor = false
    let runLen = 0
    for (let i = 0; i < size; i++) {
      if (i > 0 && line(i) === runColor) {
        runLen++
        if (runLen === 5) s += 3
        else if (runLen > 5) s++
      } else {
        runColor = line(i)
        runLen = 1
      }
    }
    return s
  }
  for (let y = 0; y < size; y++) score += runScore((x) => modules[y][x])
  for (let x = 0; x < size; x++) score += runScore((y) => modules[y][x])

  for (let y = 0; y < size - 1; y++) {
    for (let x = 0; x < size - 1; x++) {
      const c = modules[y][x]
      if (c === modules[y][x + 1] && c === modules[y + 1][x] && c === modules[y + 1][x + 1]) score += 3
    }
  }

  // Finder-like 1:1:3:1:1 runs with 4 light modules on either side, scanned as
  // 11-module windows across every row and every column.
  const FINDER_A = [true, false, true, true, true, false, true, false, false, false, false]
  const FINDER_B = [...FINDER_A].reverse()
  const windowMatches = (get: (i: number) => boolean) =>
    FINDER_A.every((p, i) => get(i) === p) || FINDER_B.every((p, i) => get(i) === p)
  for (let line = 0; line < size; line++) {
    for (let start = 0; start <= size - 11; start++) {
      if (windowMatches((i) => modules[line][start + i])) score += 40 // row scan
      if (windowMatches((i) => modules[start + i][line])) score += 40 // column scan
    }
  }

  let dark = 0
  for (const row of modules) for (const m of row) if (m) dark++
  const total = size * size
  // Each 5% deviation from 50% dark costs 10.
  const k = Math.ceil(Math.abs(dark * 20 - total * 10) / total) - 1
  score += k * 10
  return score
}

/**
 * Encode UTF-8 text as a byte-mode QR symbol at ECC level M (versions 1–10).
 * Deterministic: same input → same version, mask, and matrix.
 * Throws when the text exceeds version 10's ~213-byte capacity.
 */
export function encodeQr(text: string): QrCode {
  const bytes = toUtf8(text)
  let version = 1
  while (byteCapacity(version) < bytes.length) {
    version++
    if (version > MAX_VERSION) {
      throw new Error(`Data too long for QR versions 1-${MAX_VERSION} at ECC M (${bytes.length} bytes)`)
    }
  }

  const size = 17 + version * 4
  const g: Grid = {
    size,
    modules: Array.from({ length: size }, () => new Array<boolean>(size).fill(false)),
    isFunction: Array.from({ length: size }, () => new Array<boolean>(size).fill(false)),
  }
  drawFunctionPatterns(g, version)
  drawCodewords(g, addEccAndInterleave(buildCodewords(bytes, version), version))

  // Try all 8 masks; keep the lowest penalty (ties → lowest mask index).
  let bestMask = 0
  let bestScore = Infinity
  for (let mask = 0; mask < 8; mask++) {
    applyMask(g, mask)
    drawFormatBits(g, mask)
    const score = penaltyScore(g)
    if (score < bestScore) {
      bestScore = score
      bestMask = mask
    }
    applyMask(g, mask) // XOR is its own inverse — undo
  }
  applyMask(g, bestMask)
  drawFormatBits(g, bestMask)

  return { version, size, mask: bestMask, modules: g.modules }
}

/**
 * One SVG path drawing every dark module as a unit square at its (col,row)
 * coordinate. Render as:
 *   <svg viewBox={qrViewBox(qr)}><path d={qrSvgPath(qr)} fill="#000"/></svg>
 * with a white ground behind it (print pages force white — the paper rule).
 */
export function qrSvgPath(qr: QrCode): string {
  const parts: string[] = []
  for (let y = 0; y < qr.size; y++) {
    for (let x = 0; x < qr.size; x++) {
      if (qr.modules[y][x]) parts.push(`M${x} ${y}h1v1h-1z`)
    }
  }
  return parts.join('')
}

/** viewBox including the standard 4-module quiet zone on every side. */
export function qrViewBox(qr: QrCode): string {
  return `${-QR_QUIET_ZONE} ${-QR_QUIET_ZONE} ${qr.size + 2 * QR_QUIET_ZONE} ${qr.size + 2 * QR_QUIET_ZONE}`
}

/**
 * The function-module reservation map for a version (finders, separators,
 * timing, alignment, format/version areas). Exported ONLY for the test suite's
 * round-trip extraction — it must walk the same zigzag skip-set the encoder
 * used; every structural property of the map itself is asserted independently
 * in the tests.
 */
export function functionPatternMap(version: number): boolean[][] {
  const size = 17 + version * 4
  const g: Grid = {
    size,
    modules: Array.from({ length: size }, () => new Array<boolean>(size).fill(false)),
    isFunction: Array.from({ length: size }, () => new Array<boolean>(size).fill(false)),
  }
  drawFunctionPatterns(g, version)
  return g.isFunction
}
