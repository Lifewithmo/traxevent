// BrewTrax marketing copy — single source of truth for all brand-scoped
// marketing pages (layout nav/footer, landing hero, vs/Hot Plate, etc).
export const BREWTRAX = {
  nav: [
    { label: 'Pricing', href: '/brand/brewtrax/pricing' },
    { label: 'vs Hot Plate', href: '/brand/brewtrax/vs/hotplate' },
  ],
  ctaMicrocopy: 'No credit card · live in minutes',
  hero: {
    eyebrow: 'For coffee carts & mobile bars',
    headline: ['Your store. Your customers.', 'Every dollar.'],
    sub: 'Sell your weekly drops online with zero per-order fees — then run the bookings, proposals, invoices, and event-day prep from the same place.',
    dropsEscapeHatch: 'Just here for drops? →',
  },
  wedge: {
    title: 'Your money. All of it.',
    body: 'Hot Plate adds 5% + 55¢ to every order. We add $0. We charge a flat monthly subscription — so we never need a cut of your sales.',
  },
  os: [
    { step: 'Book', body: 'Inquiry form → proposal → deposit, signed and paid.' },
    { step: 'Prep', body: 'Menu, shopping list, staffing, event-day checklist.' },
    { step: 'Serve', body: 'Show up ready. Run drops & pickups on the side.' },
    { step: 'Get paid', body: 'Final invoice, reporting, follow-up for the next one.' },
  ],
  objections: [
    { q: 'What does it cost?', a: 'Flat $39–$149/mo. 0% per order on every tier.' },
    { q: 'Will my customers use it?', a: 'They order from a link — no app, no account.' },
    { q: 'Can I leave?', a: 'Export your data anytime. No contract.' },
    { q: 'Is it legit?', a: 'Payments run on Stripe. Your money goes straight to you.' },
  ],
  close: { title: 'Keep what you earn.', cta: 'Claim your page' },
} as const
