export interface OnboardRow {
  orgName: string
  adminEmail: string
  error?: string
}

const EMAIL_RE = /^[^@\s]+@[^@\s]+\.[^@\s]+$/

// Parse pasted "Org Name, admin@email" lines. The email is the LAST comma-separated
// token (so org names may contain commas); the rest is the name. Blank lines ignored.
// Rows missing a field or with an invalid email get an `error` string.
export function parseOnboardRows(text: string): OnboardRow[] {
  const rows: OnboardRow[] = []
  for (const raw of text.split('\n')) {
    const line = raw.trim()
    if (!line) continue
    const parts = line.split(',').map((p) => p.trim())
    if (parts.length < 2) {
      rows.push({ orgName: parts[0] ?? '', adminEmail: '', error: 'Missing admin email (use "Name, email")' })
      continue
    }
    const adminEmail = parts[parts.length - 1]
    const orgName = parts.slice(0, -1).join(', ').trim()
    if (!orgName) {
      rows.push({ orgName: '', adminEmail, error: 'Missing organization name' })
    } else if (!EMAIL_RE.test(adminEmail)) {
      rows.push({ orgName, adminEmail, error: 'Invalid email address' })
    } else {
      rows.push({ orgName, adminEmail })
    }
  }
  return rows
}
