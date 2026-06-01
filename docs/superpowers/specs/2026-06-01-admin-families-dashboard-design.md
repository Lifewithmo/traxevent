# Admin Families Dashboard Design

## Goal

Build an admin dashboard for viewing, processing, and editing camp registrations — with a slide-over panel for detail work and bulk actions for efficient processing.

## Architecture

The dashboard lives at `/admin/[orgSlug]/[campSlug]/families`.

Three layers:

1. **List + toolbar** — full-width table with search, status filter pills, and a bulk action bar that appears when rows are checked
2. **Slide-over panel** — mounts over the right side of the list when a row is clicked; URL updates to `?familyId=xxx` so the view is bookmarkable and survives refresh
3. **Detail tabs inside the panel** — Details, Campers, Payment, Notes

The list is a server component that fetches all families for the camp. The slide-over is client-side; it fetches the selected family's full data when opened. All mutations go through server actions.

**Route:** `app/(admin)/[orgSlug]/[campSlug]/families/page.tsx`
**URL shape:** `/acme/summer-2025/families?status=pending&familyId=abc123`

## Data Model

Families live at `orgs/{orgId}/camps/{campId}/families/{familyId}` — existing collection.

**Read-only (set at registration time):**
- `submitted_at` — ISO timestamp
- `access_token` — registrant portal token
- `family_id` — stable identifier

**Editable by admin (existing fields on `Family`):**
- Contact: `first_name`, `last_name`, `email`, `phone`
- `emergency_contact` — object with `name`, `phone`, `relationship`
- `address` — object with `street`, `city`, `state`, `zip`
- `registration_status` — enum: `pending | confirmed | waitlisted | cancelled`
- `payment_status` — enum: `unpaid | paid | partial | waived`

**Editable by admin (new fields to add to `Family`):**
- `amount_due` (number) — admin-set registration cost
- `amount_paid` (number) — recorded payments
- `payment_notes` (string)
- `notes` — array of `{ id, text, author, created_at }`, append-only

**`FamilyMember` fields (existing, per member):**
- `first_name`, `last_name`, `birth_year`, `gender`, `grade`
- `allergies`, `dietary_restrictions`, `tshirt_size`, `medical_notes`

**Derived (display only):**
- Balance = `amount_due - amount_paid`
- Camper count = family members count

No new Firestore collections required. Notes and payment amounts are added as new fields on the existing `Family` doc.

## List View

**Columns:**
| Column | Content |
|--------|---------|
| Checkbox | Row selection for bulk actions |
| Family | `last_name, first_name` + email (subtext) |
| Campers | Comma-separated camper first names |
| Status | Colored badge: pending / confirmed / waitlisted / cancelled |
| Balance | `amount_due - amount_paid`, shown in red if > $0 |
| — | "View" link that opens the slide-over |

**Status filter pills** (above table, persisted in URL as `?status=`):
- All (N) · Pending (N) · Confirmed (N) · Waitlist (N) · Cancelled (N)

**Search:** Single text input, client-side filter across `last_name`, `first_name`, `email`. No server round-trip.

**Bulk action toolbar** — appears when ≥1 row is checked:
- Confirm · Waitlist · Cancel (status changes applied to all selected)
- Export selected (CSV)
- Clear selection
- Shows "N selected" count

**Export CSV** — available two ways:
1. "Export selected" in bulk toolbar
2. "Export all" button always visible in the search bar area

CSV columns: family name, email, phone, campers (semicolon-separated), status, balance, submitted date.

**Row click** — opens slide-over, highlights row. Keyboard: arrow keys move between rows, Escape closes panel.

## Slide-over Panel

Width: 440px. Opens from the right, overlaid on the list. URL updates to `?familyId=xxx`.

**Header:**
- Family name (large), email + registration date (subtext), status badge
- ✕ close button (top-right)

**Four tabs:**

### Details tab
Editable fields rendered as inputs:
- `first_name`, `last_name`, `email`, `phone`
- `emergency_contact.name`, `emergency_contact.phone`, `emergency_contact.relationship`
- `address.street`, `address.city`, `address.state`, `address.zip`

Edit in-place. A "Save changes" button appears when any field is dirty. Saving calls `updateFamily` server action.

### Campers tab
One card per camper with all fields editable:
- `first_name`, `last_name`, `birth_year`, `gender`, `grade`
- `allergies`, `dietary_restrictions`, `tshirt_size`, `medical_notes`

"Add camper" button appends a blank card. Trash icon removes a camper (with confirmation). A single "Save all" button at the bottom commits all changes.

### Payment tab
- Amount due (editable)
- Amount paid (editable) + "Record payment" shortcut
- Balance (computed, red if > $0, read-only display)
- Payment notes (text area)

### Notes tab
- Notes list in reverse chronological order
- System-generated entries (status changes, registration submitted) shown with lighter styling
- Textarea + "Add note" button at bottom
- Notes are append-only — no edit or delete

**Footer (persistent across tabs):**
- Primary action: `Confirm` (if pending or waitlisted), greyed out if already confirmed
- Secondary: `Waitlist` button
- Navigation: `← Prev` / `Next →` — moves through the current filtered list without closing the panel

**Dirty state:** Navigating away from a tab with unsaved changes shows a browser confirmation prompt (`beforeunload`-style or custom modal).

## Error Handling & Permissions

**Auth:** Dashboard accessible only to org admins. The existing `(admin)` layout guard handles this — no new auth code needed.

**Optimistic updates:** Status changes (confirm, waitlist, cancel) update the UI immediately and revert on server action failure. Toast notification on success or error.

**Concurrent edits:** Last write wins. Notes array is append-only so notes from concurrent admins are both preserved.

**Empty states:**
- No families registered: friendly message + link to registration form
- Search returns nothing: "No families match your search"
- Filter returns nothing: "No [status] registrations"

**CSV export failure:** Inline error with retry button — no silent failures.

## Components

| Component | Path | Responsibility |
|-----------|------|----------------|
| `FamiliesPage` | `app/(admin)/[orgSlug]/[campSlug]/families/page.tsx` | Server component, fetches families list |
| `FamiliesTable` | `components/admin/FamiliesTable.tsx` | Client component, table + search + filters + bulk toolbar |
| `FamilySlideOver` | `components/admin/FamilySlideOver.tsx` | Slide-over shell, tab routing, URL sync |
| `FamilyDetailsTab` | `components/admin/tabs/FamilyDetailsTab.tsx` | Editable contact fields |
| `FamilyCampersTab` | `components/admin/tabs/FamilyCampersTab.tsx` | Camper cards, add/remove |
| `FamilyPaymentTab` | `components/admin/tabs/FamilyPaymentTab.tsx` | Payment fields + balance |
| `FamilyNotesTab` | `components/admin/tabs/FamilyNotesTab.tsx` | Notes list + add note |
| `StatusBadge` | `components/admin/StatusBadge.tsx` | Reusable colored badge |
| `BulkToolbar` | `components/admin/BulkToolbar.tsx` | Bulk action bar |
| `exportFamiliesCsv` | `lib/csv.ts` | CSV generation utility |
| Server actions | `actions/admin-families.ts` | updateFamily, updateStatus, addNote, bulkUpdateStatus |

## Server Actions

```typescript
// actions/admin-families.ts

updateFamily(orgId, campId, familyId, updates: Partial<Family>): Promise<void>
updateFamilyStatus(orgId, campId, familyId, status: Family['registration_status']): Promise<void>
bulkUpdateStatus(orgId, campId, familyIds: string[], status: Family['registration_status']): Promise<void>
addFamilyNote(orgId, campId, familyId, text: string, author: string): Promise<void>
```

## Testing

- Unit tests for `exportFamiliesCsv` (columns, encoding, empty input)
- Unit tests for server actions (status transitions, note append, bulk update)
- Component tests for `FamiliesTable`: search filtering, bulk select/deselect, filter pills
- Component tests for `FamilySlideOver`: tab switching, dirty-state guard, prev/next navigation
