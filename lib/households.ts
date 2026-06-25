export interface HouseholdRow {
  email: string
  first_name: string
  last_name: string
  phone: string
  registrant_uid: string | null
  created_at: string
  camp_id: string
  camp_name: string
  year: number
  registration_status: string
  payment_status: string
}

export interface HouseholdEvent {
  camp_id: string
  camp_name: string
  year: number
  registration_status: string
  payment_status: string
}

export interface Household {
  email: string
  name: string
  phone: string
  registrant_uid: string | null
  events: HouseholdEvent[]
  event_count: number
}

// Group per-event family rows into one household per normalized email.
export function buildHouseholds(rows: HouseholdRow[]): Household[] {
  const byEmail = new Map<string, HouseholdRow[]>()
  for (const r of rows) {
    const key = r.email.trim().toLowerCase()
    if (!key) continue
    const list = byEmail.get(key)
    if (list) list.push(r)
    else byEmail.set(key, [r])
  }

  const households: Household[] = []
  for (const [email, list] of byEmail) {
    const latest = list.reduce((a, b) => (b.created_at > a.created_at ? b : a))
    const events = list
      .map((r) => ({
        camp_id: r.camp_id,
        camp_name: r.camp_name,
        year: r.year,
        registration_status: r.registration_status,
        payment_status: r.payment_status,
      }))
      .sort((a, b) => b.year - a.year || a.camp_name.localeCompare(b.camp_name))
    households.push({
      email,
      name: `${latest.first_name} ${latest.last_name}`.trim(),
      phone: latest.phone,
      registrant_uid: latest.registrant_uid,
      events,
      event_count: events.length,
    })
  }

  return households.sort((a, b) => a.name.localeCompare(b.name) || a.email.localeCompare(b.email))
}
