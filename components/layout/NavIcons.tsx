// 16px, 1.3 stroke, round caps/joins — the design kit's bespoke nav family
// (ui_kits/admin/NavIcons.jsx). Path data is normative; do not swap for a library.
import type { ReactNode } from 'react'

const P = {
  today: (<><circle cx="8" cy="8" r="6.2" /><path d="M8 4.6V8l2.4 1.6" /></>),
  calendar: (<><rect x="2" y="3.2" width="12" height="10.8" rx="1.8" /><path d="M2 6.4h12M5.4 1.8v2.6M10.6 1.8v2.6" /></>),
  clients: (<><circle cx="8" cy="5.6" r="2.6" /><path d="M2.8 13.6c0-2.5 2.3-4.2 5.2-4.2s5.2 1.7 5.2 4.2" /></>),
  events: (<><path d="M2.4 13.2V6.4l5.6-3.6 5.6 3.6v6.8" /><path d="M1.4 13.4h13.2" /><path d="M6.4 13.2V9.2h3.2v4" /></>),
  pipeline: (<><rect x="1.8" y="3" width="3.6" height="10" rx="1" /><rect x="6.2" y="3" width="3.6" height="7" rx="1" /><rect x="10.6" y="3" width="3.6" height="4.4" rx="1" /></>),
  proposals: (<><path d="M3.4 1.8h6l3.2 3.2v9.2H3.4z" /><path d="M9.2 1.8V5h3.2" /><path d="M5.6 8.4h4.8M5.6 11h3.2" /></>),
  invoices: (<><path d="M3.4 1.8h9.2v12.4l-2-1.2-2 1.2-2-1.2-2 1.2z" /><path d="M6 5.6h4M6 8.4h4" /></>),
  vendors: (<><path d="M2 5.6h12l-.9 8H2.9z" /><path d="M2.6 5.6 4.4 2.2h7.2l1.8 3.4" /><path d="M6 8.4v2.8M10 8.4v2.8" /></>),
  packages: (<><path d="M8 1.8 14 5v6L8 14.2 2 11V5z" /><path d="M2 5l6 3.2L14 5M8 8.2v6" /></>),
  forms: (<><rect x="2.4" y="2.2" width="11.2" height="11.6" rx="1.8" /><path d="M5.2 6h5.6M5.2 9.2h3.4" /></>),
  compliance: (<><path d="M8 1.8 13.2 4v4.2c0 3-2.2 5-5.2 6-3-1-5.2-3-5.2-6V4z" /><path d="m5.8 8 1.6 1.6 3-3.2" /></>),
  reports: (<><path d="M2.2 13.4h11.6" /><path d="M4.4 13V8.2M8 13V3.6M11.6 13V6.4" /></>),
  settings: (<><circle cx="8" cy="8" r="2.2" /><path d="M8 1.6v1.8M8 12.6v1.8M14.4 8h-1.8M3.4 8H1.6M12.5 3.5l-1.3 1.3M4.8 11.2l-1.3 1.3M12.5 12.5l-1.3-1.3M4.8 4.8 3.5 3.5" /></>),
  members: (<><circle cx="6" cy="5.8" r="2.3" /><path d="M1.8 13.2c0-2.2 1.9-3.6 4.2-3.6s4.2 1.4 4.2 3.6" /><path d="M11 3.8a2.2 2.2 0 0 1 0 4.2M12.2 13.2c0-1.6-.6-2.7-1.6-3.3" /></>),
  permissions: (<><rect x="3" y="7" width="10" height="6.6" rx="1.6" /><path d="M5.4 7V5a2.6 2.6 0 0 1 5.2 0v2" /></>),
  billing: (<><rect x="1.8" y="3.6" width="12.4" height="8.8" rx="1.6" /><path d="M1.8 6.6h12.4M4.4 9.8h2.4" /></>),
  branding: (<><path d="M8 1.8 9.9 5.7l4.3.6-3.1 3 .7 4.3L8 11.6l-3.8 2 .7-4.3-3.1-3 4.3-.6z" /></>),
  profile: (<><circle cx="8" cy="8" r="6.2" /><path d="M1.8 8h12.4" /><path d="M8 1.8c1.6 1.7 2.5 3.9 2.5 6.2S9.6 12.5 8 14.2C6.4 12.5 5.5 10.3 5.5 8s.9-4.5 2.5-6.2z" /></>),
  email: (<><rect x="1.8" y="3.4" width="12.4" height="9.2" rx="1.6" /><path d="m2.4 4.6 5.6 4 5.6-4" /></>),
  types: (<><path d="M2.6 2.6h4.2v4.2H2.6zM9.2 2.6h4.2v4.2H9.2zM2.6 9.2h4.2v4.2H2.6z" /><circle cx="11.3" cy="11.3" r="2.1" /></>),
  departments: (<><rect x="5.4" y="1.8" width="5.2" height="3.6" rx="1" /><path d="M8 5.4v2.4M3.6 13.2v-2.4h8.8v2.4M8 7.8v3" /><rect x="1.8" y="12.4" width="3.6" height="1.8" rx=".8" /><rect x="10.6" y="12.4" width="3.6" height="1.8" rx=".8" /></>),
  signout: (<><path d="M6.2 2.4H3.6a1.4 1.4 0 0 0-1.4 1.4v8.4a1.4 1.4 0 0 0 1.4 1.4h2.6" /><path d="M10 11.2 13.4 8 10 4.8M13.2 8H6" /></>),
} satisfies Record<string, ReactNode>

export type NavIconName = keyof typeof P

export function NavIcon({ name }: { name: NavIconName }) {
  const d = P[name]
  if (!d) return null
  return (
    <svg width="16" height="16" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.3"
      strokeLinecap="round" strokeLinejoin="round" aria-hidden focusable="false" className="shrink-0">{d}</svg>
  )
}
