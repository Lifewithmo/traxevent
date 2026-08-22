import { describe, it, expect } from 'vitest'
import { readFileSync } from 'node:fs'
import path from 'node:path'
import { KIND_DOT, KIND_SHAPE } from '@/components/admin/calendar/kind-color'
import { CALENDAR_KINDS } from '@/lib/calendar'

/**
 * The palette guard.
 *
 * KIND_DOT holds `var(--…)` strings, so a unit test that only compares those
 * strings proves nothing about what a human sees — the previous version of this
 * suite asserted "all seven tokens are distinct" and passed while `--primary`
 * and `--link` resolved to the SAME hex, making a booked job and a tentative
 * hold ΔE 0.0 apart in both themes. So this file resolves the tokens back out
 * of app/globals.css — following `var()` chains, per theme block — and does the
 * colour science on the concrete values.
 *
 * ΔE here is CIE76 in CIE Lab (the same maths as
 * scripts/calendar-palette-check.mjs, which is where the ramp was derived).
 * A floor of 20 is deliberately below the ~25 the shipped ramp achieves: it is
 * a regression bar, not the design target.
 */

const CSS = readFileSync(path.resolve(__dirname, '../../../../app/globals.css'), 'utf8').replace(
  /\/\*[\s\S]*?\*\//g,
  ''
)

function block(selector: string): Record<string, string> {
  const re = new RegExp(`^${selector.replace('.', '\\.')}\\s*\\{([\\s\\S]*?)^\\}`, 'm')
  const m = CSS.match(re)
  if (!m) throw new Error(`no ${selector} block in app/globals.css`)
  const out: Record<string, string> = {}
  for (const [, name, value] of m[1].matchAll(/(--[a-z0-9-]+)\s*:\s*([^;]+);/g)) {
    out[name] = value.trim()
  }
  return out
}

const ROOT = block(':root')
const DARK = block('.dark')

/** Resolve a `var(--x)` expression (or a bare token name) down to a hex literal. */
function resolve(expr: string, vars: Record<string, string>): string {
  let v = expr.trim()
  for (let i = 0; i < 10 && v.includes('var('); i++) {
    v = v.replace(/var\(\s*(--[a-z0-9-]+)\s*\)/g, (_, name: string) => {
      const next = vars[name] ?? ROOT[name]
      if (next === undefined) throw new Error(`unresolved ${name}`)
      return next
    })
  }
  v = v.trim()
  if (!/^#[0-9a-f]{6}$/i.test(v)) throw new Error(`not a hex colour: "${expr}" -> "${v}"`)
  return v.toLowerCase()
}

// ── colour maths (lifted from scripts/calendar-palette-check.mjs) ───────────
const rgb = (h: string) => [0, 2, 4].map((i) => parseInt(h.slice(1 + i, 3 + i), 16))
const lin = (c: number) => (c /= 255) <= 0.04045 ? c / 12.92 : Math.pow((c + 0.055) / 1.055, 2.4)
const relLum = ([r, g, b]: number[]) => 0.2126 * lin(r) + 0.7152 * lin(g) + 0.0722 * lin(b)
function ratio(a: string, b: string): number {
  const [x, y] = [relLum(rgb(a)), relLum(rgb(b))].sort((p, q) => q - p)
  return (x + 0.05) / (y + 0.05)
}
function lab(h: string): [number, number, number] {
  const [r, g, b] = rgb(h).map(lin)
  const X = (0.4124 * r + 0.3576 * g + 0.1805 * b) / 0.95047
  const Y = 0.2126 * r + 0.7152 * g + 0.0722 * b
  const Z = (0.0193 * r + 0.1192 * g + 0.9505 * b) / 1.08883
  const f = (t: number) => (t > 0.008856 ? Math.cbrt(t) : 7.787 * t + 16 / 116)
  const [fx, fy, fz] = [f(X), f(Y), f(Z)]
  return [116 * fy - 16, 500 * (fx - fy), 200 * (fy - fz)]
}
function deltaE(a: string, b: string): number {
  const [A, B] = [lab(a), lab(b)]
  return Math.hypot(A[0] - B[0], A[1] - B[1], A[2] - B[2])
}

const MIN_DELTA_E = 20
const THEMES = [
  { name: 'light', vars: ROOT },
  { name: 'dark', vars: DARK },
] as const

function marks(vars: Record<string, string>): Record<string, string> {
  return Object.fromEntries(CALENDAR_KINDS.map((k) => [k, resolve(KIND_DOT[k], vars)]))
}

describe('calendar kind palette', () => {
  it('resolves every kind token to a real hex in both themes', () => {
    for (const { name, vars } of THEMES) {
      const m = marks(vars)
      for (const k of CALENDAR_KINDS) {
        expect(m[k], `${name}/${k}`).toMatch(/^#[0-9a-f]{6}$/)
      }
      // Seven tokens, seven values — the aliasing this whole file exists for.
      expect(new Set(Object.values(m)).size, `${name} distinct values`).toBe(CALENDAR_KINDS.length)
    }
  })

  it.each(THEMES.map((t) => t.name))(
    `keeps all 21 kind pairs at least ΔE ${MIN_DELTA_E} apart (%s)`,
    (themeName) => {
      const vars = THEMES.find((t) => t.name === themeName)!.vars
      const m = marks(vars)
      const rows: Array<[string, string, number]> = []
      for (let i = 0; i < CALENDAR_KINDS.length; i++) {
        for (let j = i + 1; j < CALENDAR_KINDS.length; j++) {
          const [a, b] = [CALENDAR_KINDS[i], CALENDAR_KINDS[j]]
          rows.push([a, b, deltaE(m[a], m[b])])
        }
      }
      expect(rows).toHaveLength(21)
      const failures = rows
        .filter(([, , d]) => d < MIN_DELTA_E)
        .map(([a, b, d]) => `${a}/${b}=${d.toFixed(1)} (${m[a]} vs ${m[b]})`)
      expect(failures, `${themeName}: pairs under ΔE ${MIN_DELTA_E}`).toEqual([])
    }
  )

  it('clears 3:1 for every mark against both surfaces, in both themes', () => {
    for (const { name, vars } of THEMES) {
      const m = marks(vars)
      const surfaces = {
        card: resolve('var(--card)', vars),
        background: resolve('var(--background)', vars),
      }
      const failures: string[] = []
      for (const k of CALENDAR_KINDS) {
        for (const [label, bg] of Object.entries(surfaces)) {
          const r = ratio(m[k], bg)
          if (r < 3) failures.push(`${name}/${k} on ${label} ${bg} = ${r.toFixed(2)}`)
        }
      }
      expect(failures).toEqual([])
    }
  })

  it('gives every kind its own non-colour silhouette', () => {
    // WCAG 1.4.1: the ramp above is worthless on a greyscale render or to a
    // dichromat unless shape carries the same information.
    const shapes = CALENDAR_KINDS.map((k) => KIND_SHAPE[k])
    expect(new Set(shapes).size).toBe(CALENDAR_KINDS.length)
  })
})

describe('focus and hover indicators', () => {
  it('paints the global focus outline at full strength, not ring/50', () => {
    // At 50% alpha --ring composited to 2.44:1 on white and 2.72:1 on the dark
    // ground — under the 3:1 WCAG 1.4.11 requires of a UI-component indicator.
    const base = CSS.match(/@layer base \{[\s\S]*?\n\}/)?.[0] ?? ''
    expect(base).toMatch(/outline-ring\b/)
    expect(base).not.toMatch(/outline-ring\/\d/)
  })

  it('clears 3:1 for --ring against both surfaces, in both themes', () => {
    for (const { name, vars } of THEMES) {
      const ring = resolve('var(--ring)', vars)
      for (const surface of ['var(--card)', 'var(--background)']) {
        const bg = resolve(surface, vars)
        expect(ratio(ring, bg), `${name} ring ${ring} on ${bg}`).toBeGreaterThanOrEqual(3)
      }
    }
  })

  it('gives the rail a hover surface that is actually visible', () => {
    for (const { name, vars } of THEMES) {
      const sidebar = resolve('var(--sidebar)', vars)
      const hover = resolve('var(--sidebar-hover)', vars)
      // What the rail used to use. In light mode --card IS --sidebar: 1.000.
      const card = resolve('var(--card)', vars)
      if (name === 'light') expect(card).toBe(sidebar)
      expect(ratio(hover, sidebar), `${name} hover ${hover} on rail ${sidebar}`).toBeGreaterThan(1.15)
    }
  })

  it('keeps rail ink legible on the hover surface', () => {
    for (const { name, vars } of THEMES) {
      const hover = resolve('var(--sidebar-hover)', vars)
      expect(ratio(resolve('var(--sidebar-foreground)', vars), hover), `${name} ink`).toBeGreaterThanOrEqual(4.5)
      expect(ratio(resolve('var(--muted-foreground)', vars), hover), `${name} muted`).toBeGreaterThanOrEqual(4.5)
    }
  })
})
