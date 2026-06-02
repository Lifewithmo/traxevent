# TraxEvent Design System

Established via UI UX Pro Max v2.5.0. All phase plans reference this document. Update here when new component types are introduced in later phases.

---

## Product Profile

**Type:** B2B SaaS — event management platform serving ministry, camps, sports, and corporate events
**Dashboard style:** Data-Dense (admin-facing, information-rich, efficient)
**Landing page style:** Minimal & Direct (fast load, single CTA, no noise)
**UI style:** Swiss Modernism 2.0 — strict grid, mathematical spacing, single accent, no decoration

---

## Color Palette

Source: UI UX Pro Max — CRM & Client Management (adapted for ministry/multi-vertical context)

```css
--color-primary:           #2563EB;   /* Blue — primary actions, links */
--color-on-primary:        #FFFFFF;
--color-secondary:         #3B82F6;   /* Lighter blue — hover states */
--color-on-secondary:      #FFFFFF;
--color-accent:            #059669;   /* Green — confirmed, success, paid */
--color-on-accent:         #FFFFFF;
--color-background:        #F8FAFC;   /* Page background */
--color-foreground:        #0F172A;   /* Primary text */
--color-card:              #FFFFFF;
--color-card-foreground:   #0F172A;
--color-muted:             #F1F5FD;   /* Subtle backgrounds, alt rows */
--color-muted-foreground:  #64748B;   /* Secondary text, labels */
--color-border:            #E4ECFC;
--color-destructive:       #DC2626;   /* Cancelled, errors, delete */
--color-on-destructive:    #FFFFFF;
--color-ring:              #2563EB;   /* Focus rings */
--color-warning:           #F59E0B;   /* Waitlisted, partial payment */
```

**Status color mapping (used throughout admin UI):**
| Status | Color | Hex |
|--------|-------|-----|
| Confirmed / Paid | Accent green | `#059669` |
| Pending | Warning amber | `#F59E0B` |
| Waitlisted | Warning amber | `#F59E0B` |
| Cancelled | Destructive red | `#DC2626` |
| Partial | Warning amber | `#F59E0B` |
| Unpaid | Destructive red | `#DC2626` |
| Waived | Muted | `#64748B` |

---

## Typography

Source: UI UX Pro Max — "Friendly SaaS" (Plus Jakarta Sans)

**Font:** Plus Jakarta Sans — single family, all weights 300–700
**Why:** Modern, approachable, professional. Handles both headings and body. Feels right for ministry orgs and corporate orgs simultaneously.

```css
/* Google Fonts import */
@import url('https://fonts.googleapis.com/css2?family=Plus+Jakarta+Sans:wght@300;400;500;600;700&display=swap');

/* Tailwind config */
fontFamily: { sans: ['Plus Jakarta Sans', 'sans-serif'] }
```

**Type scale:**
| Role | Size | Weight | Usage |
|------|------|--------|-------|
| Page title | 24px / 1.5rem | 700 | Dashboard headings |
| Section title | 18px / 1.125rem | 600 | Card headers, section labels |
| Body | 14px / 0.875rem | 400 | Table rows, form fields, content |
| Small / label | 12px / 0.75rem | 500 | Status badges, sub-labels, metadata |
| Mono | system-ui mono | 400 | IDs, tokens, codes |

---

## Spacing & Layout

Base unit: **8px**

```
4px   — tight gaps (badge padding, icon spacing)
8px   — component internal padding (inputs, badges)
12px  — compact card padding (data-dense views)
16px  — standard card padding, form field gaps
24px  — section gaps
32px  — page section spacing
48px  — major section breaks (landing page)
```

**Grid:** 12-column, 16px gap on desktop → 1 column on mobile
**Sidebar width:** 240px
**Slide-over panel width:** 440px (established in Phase 0)
**Header height:** 56px
**Table row height:** 40px
**Max content width:** 1280px

---

## Border Radius

| Element | Radius |
|---------|--------|
| Cards, panels | `rounded-lg` (8px) |
| Inputs, selects | `rounded-md` (6px) |
| Buttons | `rounded-md` (6px) |
| Badges / pills | `rounded-full` |
| Modals | `rounded-xl` (12px) |
| Tooltips | `rounded-md` (6px) |

---

## Shadows

```css
/* Cards */
box-shadow: 0 1px 3px rgba(0,0,0,0.06), 0 1px 2px rgba(0,0,0,0.04);

/* Slide-over / modal */
box-shadow: -4px 0 24px rgba(0,0,0,0.08);

/* Dropdown menus */
box-shadow: 0 4px 12px rgba(0,0,0,0.08);

/* No decoration on table rows — use hover background instead */
```

---

## Component Conventions

### Status Badges
Colored pill (`rounded-full`, `px-2 py-0.5`, `text-xs font-medium`). Colors from status map above. Background at 10% opacity, text at full color.

### Tables (admin data-dense style)
- Sticky header on scroll
- Row hover: `bg-muted` (`#F1F5FD`)
- Selected row: `bg-blue-50` border-left `2px solid #2563EB`
- Sortable columns: chevron icon, muted when inactive
- Row height: 40px
- Skeleton rows (not spinners) during data load

### Forms
- All inputs: `<label>` with `for` attribute — no placeholder-only fields (WCAG)
- Multi-step flows: visible step indicator ("Step 2 of 4") at top
- Submit feedback: loading state → success or error message (never silent)
- Error messages: inline below field, destructive red, `text-sm`
- Required fields: asterisk in label, not placeholder

### Buttons
| Variant | Use |
|---------|-----|
| Primary (filled blue) | Main action per page/panel |
| Secondary (outlined) | Secondary actions |
| Ghost | Tertiary, navigation actions |
| Destructive (red) | Delete, cancel, irreversible actions |
| Icon-only | Toolbar actions with tooltip |

### Empty States
Friendly heading + one-line description + action link. Centered in the content area. No icon illustrations required (Phase 1).

### Toast Notifications
Top-right, auto-dismiss 4s. Success (green), error (red), info (blue). Max 3 stacked.

---

## Dark Mode

Not in scope for Phase 1–2. Design tokens named semantically (not `blue-500` — use `primary`) so dark mode can be layered in Phase 3+ without component rewrites.

---

## Accessibility Baseline

- WCAG AA minimum throughout (AAA where achievable)
- All interactive elements keyboard-navigable
- Focus rings: `2px solid var(--color-ring)`, `2px offset`
- Color never the sole indicator of state (always pair with label or icon)
- Form inputs: always labeled, error messages linked via `aria-describedby`

---

## UI UX Pro Max Reference Queries

Queries run 2026-06-02 to establish this system:
- `product`: "SaaS event management registration platform" → SaaS (General) + Event Management
- `color`: "trust professional nonprofit ministry community" → CRM & Client Management palette
- `style`: "minimal clean professional dashboard admin" → Swiss Modernism 2.0 + Data-Dense Dashboard
- `typography`: "clean professional readable SaaS" → Friendly SaaS (Plus Jakarta Sans)
- `ux`: "registration form multi-step onboarding dashboard admin" → Progress indicators, submit feedback, form labels

Re-run queries when adding new surface areas (charts in Phase 3, client portal in Phase 5, mobile in Phase 6).
