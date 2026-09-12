// Square Transactions-CSV → closeout sales prefill (inc-3 spec S2, BINDING B4).
//
// ONE layout on purpose: the *Transactions CSV* exported from Square's
// dashboard — the only export with a per-row date plus a "Total Collected"
// money column, which is what makes the event-date filter possible. Header
// layouts are NOT verified from primary sources (B4), so this parser is
// defensive by construction: it finds the two columns it needs BY HEADER NAME
// (case/whitespace-tolerant name variants), and anything it does not
// recognize is a TYPED failure — it never guess-sums a file.
//
// Column decision (S2): "Total Collected" — gross, matching what the operator
// reconciles against the cash box. The UI caption labels it "(gross)".
//
// Refund decision (documented): refund rows carry a NEGATIVE Total Collected.
// Amounts are summed SIGNED, so refunds SUBTRACT from the prefill total —
// ignoring them would overstate the day. Refund rows are counted separately
// (`refundCount`) so the evidence caption can disclose them.
//
// Zero dependencies: the tokenizer handles quoted fields, escaped quotes
// (""), CRLF line endings, and a UTF-8 BOM — everything a spreadsheet-shaped
// export can throw. Pure module: no imports, safe on client and server.

export type SquareCsvError =
  /** No data at all (zero rows). */
  | 'empty_file'
  /** The date / Total Collected headers weren't found — or the date column
   *  never produced a readable date. We don't understand this file; refusing
   *  beats guessing (B4). */
  | 'unrecognized_layout'
  /** Layout understood, but no transaction row falls on the event's date. */
  | 'no_rows_for_date'
  /** A row ON the event date has a money cell we can't read — a partial sum
   *  would be a guessed sum, so the whole prefill is refused. */
  | 'unreadable_money'

export interface SquareCsvPrefill {
  ok: true
  /** Signed sum of Total Collected for the matched date (refunds subtract),
   *  rounded to cents. */
  total: number
  /** Rows matched to the event date (payments AND refunds). */
  rowCount: number
  /** Matched rows with a negative amount — disclosed in the caption. */
  refundCount: number
  /** YYYY-MM-DD the rows were filtered to. */
  dateMatched: string
  /** Non-USD symbols/codes seen in matched money cells. The total still
   *  parses (the digits are unambiguous) but the operator must be told the
   *  export doesn't look like dollars. */
  currencyWarnings: string[]
}

export interface SquareCsvFailure {
  ok: false
  error: SquareCsvError
}

export type SquareCsvResult = SquareCsvPrefill | SquareCsvFailure

// ── Header detection (B4: by NAME variants, case/whitespace-tolerant) ───────
// Every accepted variant unambiguously names the column we need; anything
// else fails typed. Do NOT add fuzzy/positional matching here.

const DATE_HEADERS = new Set(['date', 'transaction date', 'payment date'])
const MONEY_HEADERS = new Set(['total collected'])

function normalizeHeader(h: string): string {
  return h.toLowerCase().replace(/\s+/g, ' ').trim()
}

// ── CSV tokenizer ────────────────────────────────────────────────────────────

function parseCsv(input: string): string[][] {
  const text = input.charCodeAt(0) === 0xfeff ? input.slice(1) : input
  const rows: string[][] = []
  let row: string[] = []
  let field = ''
  let inQuotes = false
  let i = 0
  while (i < text.length) {
    const ch = text[i]
    if (inQuotes) {
      if (ch === '"') {
        if (text[i + 1] === '"') { field += '"'; i += 2; continue } // escaped quote
        inQuotes = false; i++; continue
      }
      field += ch; i++; continue
    }
    if (ch === '"') { inQuotes = true; i++; continue }
    if (ch === ',') { row.push(field); field = ''; i++; continue }
    if (ch === '\r' || ch === '\n') {
      if (ch === '\r' && text[i + 1] === '\n') i++
      row.push(field); field = ''
      rows.push(row); row = []
      i++; continue
    }
    field += ch; i++
  }
  row.push(field)
  rows.push(row)
  // Trailing-newline artifacts and fully blank lines are not rows.
  return rows.filter((r) => r.some((c) => c.trim() !== ''))
}

// ── Cell parsers ─────────────────────────────────────────────────────────────

function validYmd(y: number, mo: number, d: number): string | null {
  if (y < 1970 || y > 9999 || mo < 1 || mo > 12 || d < 1 || d > 31) return null
  return `${y}-${String(mo).padStart(2, '0')}-${String(d).padStart(2, '0')}`
}

/**
 * Date cell → YYYY-MM-DD, or null when the cell isn't a date (footer "Total"
 * rows, blanks). A null NEVER matches the event date, so an unreadable row
 * can only ever be EXCLUDED from the sum — it can never inflate it.
 * Accepted shapes: ISO (2026-08-22, incl. a trailing time), and slash dates.
 * Slash dates are read M/D/YYYY (Square is US-first); when the first number
 * cannot be a month (>12) the cell is unambiguous D/M and is accepted as such.
 */
function normalizeDateCell(raw: string): string | null {
  const token = raw.trim().split(/[T\s]/)[0]
  if (!token) return null
  let m = /^(\d{4})-(\d{1,2})-(\d{1,2})$/.exec(token)
  if (m) return validYmd(Number(m[1]), Number(m[2]), Number(m[3]))
  m = /^(\d{1,2})\/(\d{1,2})\/(\d{2}|\d{4})$/.exec(token)
  if (m) {
    const a = Number(m[1])
    const b = Number(m[2])
    const y = m[3].length === 2 ? 2000 + Number(m[3]) : Number(m[3])
    if (a > 12 && b <= 12) return validYmd(y, b, a) // unambiguous D/M
    return validYmd(y, a, b)
  }
  return null
}

/**
 * Money cell → signed dollars. Handles "$1,234.56", plain "1234.56",
 * negatives as "-$5.00" / "−$5.00" / "($5.00)", and locale-formatted
 * "1.234,56" (decimal-separator inference below). Returns null when the
 * digits are ambiguous or absent — the caller fails the WHOLE prefill then
 * (B4: never a guessed sum). Non-$ currency marks parse but carry a warning.
 */
function parseMoneyCell(raw: string): { value: number; warning?: string } | null {
  let s = raw.trim()
  if (!s) return null
  let sign = 1
  const paren = /^\((.*)\)$/.exec(s)
  if (paren) { sign = -1; s = paren[1].trim() }
  if (/^[-−]/.test(s)) { sign *= -1; s = s.slice(1).trim() }

  let warning: string | undefined
  const foreignSym = /[€£¥]/.exec(s)
  const code = /(?:^|[\s])([A-Za-z]{3})(?:[\s]|$)/.exec(s)
  if (foreignSym) {
    warning = `Amounts appear in ${foreignSym[0]}, not $ — check the export's currency.`
  } else if (code && code[1].toUpperCase() !== 'USD') {
    warning = `Amounts appear in ${code[1].toUpperCase()}, not $ — check the export's currency.`
  }

  s = s.replace(/[$€£¥]/g, '').replace(/(?:^|(?<=\s))[A-Za-z]{3}(?=(\s|$))/g, '').replace(/\s+/g, '')
  if (!/^[\d.,]+$/.test(s) || !/\d/.test(s)) return null

  const lastDot = s.lastIndexOf('.')
  const lastComma = s.lastIndexOf(',')
  let normalized: string
  if (lastDot !== -1 && lastComma !== -1) {
    // Both present: whichever comes LAST is the decimal separator.
    normalized = lastDot > lastComma
      ? s.replace(/,/g, '')
      : s.replace(/\./g, '').replace(',', '.')
  } else if (lastComma !== -1) {
    // Comma only. Groups of exactly three ⇒ thousands ("1,234"); a single
    // comma with 1–2 trailing digits ⇒ decimal comma ("12,34"). Anything
    // else is unreadable, not guessable.
    if (/^\d{1,3}(,\d{3})+$/.test(s)) normalized = s.replace(/,/g, '')
    else if (/^\d+,\d{1,2}$/.test(s)) normalized = s.replace(',', '.')
    else return null
  } else {
    normalized = s // dot-only or plain digits: standard decimal point
  }
  const value = Number(normalized)
  if (!Number.isFinite(value)) return null
  return { value: sign * value, ...(warning ? { warning } : {}) }
}

// ── The parser ───────────────────────────────────────────────────────────────

/**
 * Parse a Square Transactions CSV and total the event day's collections.
 * @param text      raw file contents
 * @param eventDate the day to filter to — YYYY-MM-DD (longer ISO strings are
 *                  truncated to their date part)
 */
export function parseSquareTransactionsCsv(text: string, eventDate: string): SquareCsvResult {
  const wanted = eventDate.slice(0, 10)
  const rows = parseCsv(text)
  if (rows.length === 0) return { ok: false, error: 'empty_file' }

  const headers = rows[0].map(normalizeHeader)
  const dateCol = headers.findIndex((h) => DATE_HEADERS.has(h))
  const moneyCol = headers.findIndex((h) => MONEY_HEADERS.has(h))
  if (dateCol === -1 || moneyCol === -1) return { ok: false, error: 'unrecognized_layout' }

  const dataRows = rows.slice(1)
  if (dataRows.length === 0) return { ok: false, error: 'no_rows_for_date' }

  let datedRows = 0
  const matchedCells: string[] = []
  for (const r of dataRows) {
    const ymd = normalizeDateCell(r[dateCol] ?? '')
    if (!ymd) continue // dateless footer/summary rows: excluded, never summed
    datedRows++
    if (ymd === wanted) matchedCells.push(r[moneyCol] ?? '')
  }
  // A "date" column that never yields a date is a layout we don't actually
  // understand — that's a designed failure, not an empty day.
  if (datedRows === 0) return { ok: false, error: 'unrecognized_layout' }
  if (matchedCells.length === 0) return { ok: false, error: 'no_rows_for_date' }

  let total = 0
  let refundCount = 0
  const warnings = new Set<string>()
  for (const cell of matchedCells) {
    const parsed = parseMoneyCell(cell)
    if (!parsed) return { ok: false, error: 'unreadable_money' }
    total += parsed.value
    if (parsed.value < 0) refundCount++
    if (parsed.warning) warnings.add(parsed.warning)
  }

  return {
    ok: true,
    total: Math.round(total * 100) / 100,
    rowCount: matchedCells.length,
    refundCount,
    dateMatched: wanted,
    currencyWarnings: [...warnings],
  }
}
