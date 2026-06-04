# TraxEvent Phase 1 — Foundation Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Create the TraxEvent multi-tenant SaaS platform foundation — new Next.js 15 repo at `/Users/rm/vw/traxevent`, Firebase Auth with custom claims, Firestore multi-tenant security rules, subdomain routing middleware, org/camp management UI, member invitations, and staff permission matrix.

**Architecture:** Next.js 15 App Router with route groups: `(auth)`, `(admin)`, `(public)`, `(marketing)`. Firebase Auth custom claims carry `{ orgId, orgSlug, role }` for fast authorization without extra lookups. Firestore sub-collections `orgs/{orgId}/camps/{campId}/...` isolate data per org, enforced by security rules. Next.js middleware rewrites `{orgSlug}.traxevent.com` requests to inject the `orgSlug` route param. All server-side data access goes through Server Actions using the Firebase Admin SDK.

**Tech Stack:** Next.js 15 App Router · TypeScript · Tailwind CSS · shadcn/ui · Firebase Auth (client) · Firebase Admin SDK (server) · Firestore · Vitest + React Testing Library · Vercel

**Scope note:** This plan covers the Foundation scaffolding. Porting existing camp features (families, accommodations, teams, budget, itinerary, communicate) from the single-tenant app is Phase 1b — a separate plan to be written once this foundation is stable and deployed.

---

## File Map

```
/Users/rm/vw/traxevent/
├── app/
│   ├── layout.tsx                                  # root layout
│   ├── (marketing)/
│   │   └── page.tsx                                # placeholder landing
│   ├── (auth)/
│   │   ├── layout.tsx                              # centered card wrapper
│   │   ├── login/page.tsx
│   │   ├── signup/page.tsx
│   │   ├── onboarding/page.tsx                     # create org wizard
│   │   └── accept-invite/page.tsx                  # accept team invitation
│   ├── (admin)/
│   │   └── [orgSlug]/
│   │       ├── layout.tsx                          # sidebar + main shell
│   │       ├── page.tsx                            # org home: camp list
│   │       ├── new-camp/page.tsx
│   │       ├── members/page.tsx
│   │       └── [campSlug]/
│   │           ├── layout.tsx
│   │           └── dashboard/page.tsx              # placeholder (Phase 1b fills this in)
│   └── (public)/
│       └── [orgSlug]/[campSlug]/
│           └── register/page.tsx                   # placeholder
├── actions/
│   ├── auth.ts                                     # setOrgClaims, createUser, verifyToken
│   ├── orgs.ts                                     # createOrg, getOrg, getOrgBySlug
│   ├── camps.ts                                    # createCamp, listCamps, getCampBySlug
│   └── members.ts                                  # createInvitation, acceptInvitation, listMembers, updateStaffCampAccess
├── components/
│   ├── layout/
│   │   └── AdminSidebar.tsx
│   └── members/
│       ├── InviteMemberModal.tsx
│       └── PermissionMatrix.tsx
├── hooks/
│   └── useAuth.ts                                  # Firebase Auth state + claims hook
├── lib/
│   ├── firebase.ts                                 # client Firebase init
│   ├── firebase-admin.ts                           # server Admin SDK init
│   ├── types.ts                                    # shared TypeScript types
│   └── utils.ts                                    # shadcn cn() utility (auto-generated)
├── middleware.ts                                    # subdomain → orgSlug rewrite
├── firestore.rules
└── __tests__/
    ├── middleware.test.ts
    ├── actions/auth.test.ts
    ├── actions/orgs.test.ts
    ├── actions/camps.test.ts
    └── actions/members.test.ts
```

---

### Task 1: Bootstrap the project

**Files:**
- Create: `/Users/rm/vw/traxevent/` (entire project)

- [ ] **Step 1: Create the Next.js app**

```bash
cd /Users/rm/vw
npx create-next-app@latest traxevent \
  --typescript \
  --tailwind \
  --eslint \
  --app \
  --no-src-dir \
  --import-alias "@/*"
cd traxevent
```

- [ ] **Step 2: Install Firebase and testing dependencies**

```bash
npm install firebase firebase-admin
npm install --save-dev vitest @vitejs/plugin-react @vitest/coverage-v8 \
  @testing-library/react @testing-library/user-event \
  @testing-library/jest-dom jsdom
```

- [ ] **Step 3: Create `vitest.config.ts`**

```typescript
import { defineConfig } from 'vitest/config'
import react from '@vitejs/plugin-react'
import path from 'path'

export default defineConfig({
  plugins: [react()],
  test: {
    environment: 'jsdom',
    globals: true,
    setupFiles: ['./vitest.setup.ts'],
  },
  resolve: {
    alias: { '@': path.resolve(__dirname, '.') },
  },
})
```

- [ ] **Step 4: Create `vitest.setup.ts`**

```typescript
import '@testing-library/jest-dom'
```

- [ ] **Step 5: Add test scripts to `package.json`**

Add inside `"scripts"`:
```json
"test": "vitest run",
"test:watch": "vitest"
```

- [ ] **Step 6: Initialize shadcn/ui**

```bash
npx shadcn@latest init
```

Select: Default style, Slate base color, CSS variables yes.

- [ ] **Step 7: Add shadcn components**

```bash
npx shadcn@latest add button input label card dialog badge separator table
```

- [ ] **Step 8: Run tests to confirm baseline passes**

```bash
npm test
```
Expected: no tests yet, exit 0 (or "no test files found").

- [ ] **Step 9: Initialize git and make first commit**

```bash
git init
git add .
git commit -m "chore: bootstrap Next.js 15 + Firebase + shadcn/ui"
```

---

### Task 2: Environment variables + Firebase config

**Files:**
- Create: `lib/firebase.ts`
- Create: `lib/firebase-admin.ts`
- Create: `.env.example`
- Create: `.env.local` (not committed)

- [ ] **Step 1: Create `.env.example`**

```bash
cat > .env.example << 'EOF'
# Firebase client SDK (public — safe to expose)
NEXT_PUBLIC_FIREBASE_API_KEY=
NEXT_PUBLIC_FIREBASE_AUTH_DOMAIN=
NEXT_PUBLIC_FIREBASE_PROJECT_ID=
NEXT_PUBLIC_FIREBASE_STORAGE_BUCKET=
NEXT_PUBLIC_FIREBASE_MESSAGING_SENDER_ID=
NEXT_PUBLIC_FIREBASE_APP_ID=

# Firebase Admin SDK (server-only — never expose)
FIREBASE_PROJECT_ID=
FIREBASE_CLIENT_EMAIL=
FIREBASE_PRIVATE_KEY=
EOF
```

- [ ] **Step 2: Copy to `.env.local` and fill in values**

Get client values from Firebase Console → Project Settings → Your Apps → Web app config.
Get admin values from Firebase Console → Project Settings → Service Accounts → Generate new private key.

```bash
cp .env.example .env.local
# Edit .env.local with your Firebase project values
```

Note: `FIREBASE_PRIVATE_KEY` must be wrapped in quotes in `.env.local` because it contains newlines:
```
FIREBASE_PRIVATE_KEY="-----BEGIN PRIVATE KEY-----\nABC...\n-----END PRIVATE KEY-----\n"
```

- [ ] **Step 3: Create `lib/firebase.ts`**

```typescript
import { initializeApp, getApps, getApp } from 'firebase/app'
import { getAuth } from 'firebase/auth'
import { getFirestore } from 'firebase/firestore'

const firebaseConfig = {
  apiKey: process.env.NEXT_PUBLIC_FIREBASE_API_KEY,
  authDomain: process.env.NEXT_PUBLIC_FIREBASE_AUTH_DOMAIN,
  projectId: process.env.NEXT_PUBLIC_FIREBASE_PROJECT_ID,
  storageBucket: process.env.NEXT_PUBLIC_FIREBASE_STORAGE_BUCKET,
  messagingSenderId: process.env.NEXT_PUBLIC_FIREBASE_MESSAGING_SENDER_ID,
  appId: process.env.NEXT_PUBLIC_FIREBASE_APP_ID,
}

const app = getApps().length ? getApp() : initializeApp(firebaseConfig)

export const auth = getAuth(app)
export const db = getFirestore(app)
```

- [ ] **Step 4: Create `lib/firebase-admin.ts`**

```typescript
import { initializeApp, getApps, cert, type App } from 'firebase-admin/app'
import { getAuth } from 'firebase-admin/auth'
import { getFirestore } from 'firebase-admin/firestore'

function getAdminApp(): App {
  if (getApps().length > 0) return getApps()[0]
  return initializeApp({
    credential: cert({
      projectId: process.env.FIREBASE_PROJECT_ID,
      clientEmail: process.env.FIREBASE_CLIENT_EMAIL,
      privateKey: process.env.FIREBASE_PRIVATE_KEY?.replace(/\\n/g, '\n'),
    }),
  })
}

const adminApp = getAdminApp()
export const adminAuth = getAuth(adminApp)
export const adminDb = getFirestore(adminApp)
```

- [ ] **Step 5: Verify `.gitignore` excludes `.env.local`**

`create-next-app` adds this by default. Confirm the line exists:
```bash
grep '.env.local' .gitignore
```
Expected: `.env.local` appears in output.

- [ ] **Step 6: Commit**

```bash
git add lib/firebase.ts lib/firebase-admin.ts .env.example
git commit -m "feat: Firebase client and admin SDK setup"
```

---

### Task 3: Shared TypeScript types

**Files:**
- Create: `lib/types.ts`

- [ ] **Step 1: Write `lib/types.ts`**

```typescript
export type OrgRole = 'owner' | 'admin' | 'staff'

export type CampRegistrationType = 'family' | 'individual' | 'child'

export interface Org {
  id: string
  name: string
  slug: string
  billing_status: 'active' | 'trialing' | 'inactive'
  created_at: string
}

export interface OrgMember {
  uid: string
  role: OrgRole
  display_name: string
  email: string
  camp_access: Record<string, { pages: CampPage[] }>
}

export interface OrgInvitation {
  token: string
  email: string
  role: OrgRole
  created_at: string
  expires_at: string
  accepted_at?: string
}

export interface Camp {
  id: string
  name: string
  slug: string
  year: number
  status: 'draft' | 'active' | 'archived'
  registration_type: CampRegistrationType
  features: {
    accommodations: boolean
    teams: boolean
    budget: boolean
    itinerary: boolean
    communicate: boolean
  }
  camp_start: string
  camp_end: string
  created_at: string
}

export const CAMP_PAGES = [
  'dashboard',
  'families',
  'assignments',
  'teams',
  'budget',
  'itinerary',
  'communicate',
  'reports',
] as const

export type CampPage = typeof CAMP_PAGES[number]

// Shape of our Firebase Auth JWT custom claims
export interface AuthClaims {
  orgId: string
  orgSlug: string
  role: OrgRole | 'platform_admin'
}
```

- [ ] **Step 2: Commit**

```bash
git add lib/types.ts
git commit -m "feat: shared TypeScript types"
```

---

### Task 4: Firestore security rules

**Files:**
- Create: `firestore.rules`

- [ ] **Step 1: Write `firestore.rules`**

```
rules_version = '2';
service cloud.firestore {
  match /databases/{database}/documents {

    // Platform admin helper
    function isPlatformAdmin() {
      return request.auth != null && request.auth.token.role == 'platform_admin';
    }

    // Org membership helper
    function isOrgMember(orgId) {
      return request.auth != null && request.auth.token.orgId == orgId;
    }

    function isOrgAdmin(orgId) {
      return isOrgMember(orgId) && request.auth.token.role in ['owner', 'admin'];
    }

    // User profile — each user reads/writes their own doc
    match /users/{uid} {
      allow read, write: if request.auth != null && request.auth.uid == uid;
    }

    // Platform admin roster — platform admin only
    match /platform_admins/{uid} {
      allow read: if isPlatformAdmin();
      allow write: if isPlatformAdmin();
    }

    // Stripe subscription data
    match /subscriptions/{orgId} {
      allow read: if isOrgMember(orgId) || isPlatformAdmin();
      allow write: if isPlatformAdmin();
    }

    // Org root document
    match /orgs/{orgId} {
      allow read: if isOrgMember(orgId) || isPlatformAdmin();
      allow write: if isOrgAdmin(orgId) || isPlatformAdmin();

      // Members — readable by all org members, writable by admins
      match /members/{uid} {
        allow read: if isOrgMember(orgId);
        allow write: if isOrgAdmin(orgId);
      }

      // Invitations — public read (so accept-invite page works without auth),
      // writable by org admins only
      match /invitations/{token} {
        allow read: if true;
        allow write: if isOrgAdmin(orgId);
      }

      // Integrations — org admins only (credentials stored here)
      match /integrations/{slug} {
        allow read, write: if isOrgAdmin(orgId);
      }

      // Camps and all sub-collections
      // Staff access is enforced at the Server Action layer, not here,
      // because per-page granularity cannot be expressed in security rules.
      match /camps/{campId} {
        allow read, write: if isOrgAdmin(orgId) || isPlatformAdmin();

        match /{collection}/{docId} {
          allow read, write: if isOrgAdmin(orgId) || isPlatformAdmin();
        }
      }
    }
  }
}
```

- [ ] **Step 2: Install Firebase CLI and deploy rules**

```bash
npm install -g firebase-tools
firebase login
firebase init firestore
# Prompts:
#   Which Firebase project? → select your project
#   What file should be used for Firestore Rules? → firestore.rules (default)
#   What file should be used for Firestore indexes? → firestore.indexes.json (default)

firebase deploy --only firestore:rules
```

- [ ] **Step 3: Commit**

```bash
git add firestore.rules firestore.indexes.json .firebaserc firebase.json
git commit -m "feat: Firestore multi-tenant security rules"
```

---

### Task 5: Auth server actions — custom claims

**Files:**
- Create: `actions/auth.ts`
- Create: `__tests__/actions/auth.test.ts`

- [ ] **Step 1: Write failing test**

```typescript
// __tests__/actions/auth.test.ts
import { describe, it, expect, vi, beforeEach } from 'vitest'

vi.mock('@/lib/firebase-admin', () => ({
  adminAuth: { setCustomUserClaims: vi.fn().mockResolvedValue(undefined) },
  adminDb: {
    collection: vi.fn().mockReturnThis(),
    doc: vi.fn().mockReturnThis(),
    set: vi.fn().mockResolvedValue(undefined),
  },
}))

import { setOrgClaims } from '@/actions/auth'
import { adminAuth } from '@/lib/firebase-admin'

describe('setOrgClaims', () => {
  beforeEach(() => vi.clearAllMocks())

  it('sets orgId, orgSlug, and role on the user token', async () => {
    await setOrgClaims('uid-123', 'org-abc', 'first-hills', 'admin')

    expect(adminAuth.setCustomUserClaims).toHaveBeenCalledWith('uid-123', {
      orgId: 'org-abc',
      orgSlug: 'first-hills',
      role: 'admin',
    })
  })
})
```

- [ ] **Step 2: Run test to verify it fails**

```bash
npm test __tests__/actions/auth.test.ts
```
Expected: FAIL — `setOrgClaims is not a function`

- [ ] **Step 3: Implement `actions/auth.ts`**

```typescript
'use server'

import { adminAuth, adminDb } from '@/lib/firebase-admin'
import type { OrgRole } from '@/lib/types'

export async function setOrgClaims(
  uid: string,
  orgId: string,
  orgSlug: string,
  role: OrgRole
): Promise<void> {
  await adminAuth.setCustomUserClaims(uid, { orgId, orgSlug, role })
}

export async function setPlatformAdminClaim(uid: string): Promise<void> {
  await adminAuth.setCustomUserClaims(uid, { role: 'platform_admin' })
}

export async function createUser(
  uid: string,
  email: string,
  displayName: string
): Promise<void> {
  await adminDb.collection('users').doc(uid).set({
    email,
    display_name: displayName,
    created_at: new Date().toISOString(),
  })
}

export async function verifyIdToken(
  idToken: string
): Promise<{ uid: string; orgId?: string; orgSlug?: string; role?: string } | null> {
  try {
    const decoded = await adminAuth.verifyIdToken(idToken)
    return {
      uid: decoded.uid,
      orgId: decoded.orgId as string | undefined,
      orgSlug: decoded.orgSlug as string | undefined,
      role: decoded.role as string | undefined,
    }
  } catch {
    return null
  }
}
```

- [ ] **Step 4: Run test to verify it passes**

```bash
npm test __tests__/actions/auth.test.ts
```
Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add actions/auth.ts __tests__/actions/auth.test.ts
git commit -m "feat: Firebase Auth custom claims server action"
```

---

### Task 6: Firebase Auth client hook

**Files:**
- Create: `hooks/useAuth.ts`
- Create: `app/providers.tsx`
- Modify: `app/layout.tsx`

- [ ] **Step 1: Create `hooks/useAuth.ts`**

```typescript
'use client'

import { useEffect, useState } from 'react'
import { onAuthStateChanged, type User } from 'firebase/auth'
import { auth } from '@/lib/firebase'

export interface AuthState {
  user: User | null
  loading: boolean
  orgId: string | null
  orgSlug: string | null
  role: string | null
}

export function useAuth(): AuthState {
  const [state, setState] = useState<AuthState>({
    user: null,
    loading: true,
    orgId: null,
    orgSlug: null,
    role: null,
  })

  useEffect(() => {
    return onAuthStateChanged(auth, async (user) => {
      if (user) {
        const result = await user.getIdTokenResult()
        setState({
          user,
          loading: false,
          orgId: (result.claims.orgId as string) ?? null,
          orgSlug: (result.claims.orgSlug as string) ?? null,
          role: (result.claims.role as string) ?? null,
        })
      } else {
        setState({ user: null, loading: false, orgId: null, orgSlug: null, role: null })
      }
    })
  }, [])

  return state
}
```

- [ ] **Step 2: Create `app/providers.tsx`**

```typescript
'use client'

// Thin wrapper — add providers here as the app grows (SWR, Jotai, etc.)
export function Providers({ children }: { children: React.ReactNode }) {
  return <>{children}</>
}
```

- [ ] **Step 3: Replace contents of `app/layout.tsx`**

```typescript
import type { Metadata } from 'next'
import { Inter } from 'next/font/google'
import './globals.css'
import { Providers } from './providers'

const inter = Inter({ subsets: ['latin'] })

export const metadata: Metadata = {
  title: 'TraxEvent',
  description: 'Camp registration and management platform',
}

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <body className={inter.className}>
        <Providers>{children}</Providers>
      </body>
    </html>
  )
}
```

- [ ] **Step 4: Commit**

```bash
git add hooks/useAuth.ts app/providers.tsx app/layout.tsx
git commit -m "feat: Firebase Auth client hook and root layout"
```

---

### Task 7: Login + signup + auth layout

**Files:**
- Create: `app/(auth)/layout.tsx`
- Create: `app/(auth)/login/page.tsx`
- Create: `app/(auth)/signup/page.tsx`

- [ ] **Step 1: Create `app/(auth)/layout.tsx`**

```typescript
export default function AuthLayout({ children }: { children: React.ReactNode }) {
  return (
    <div className="min-h-screen flex items-center justify-center bg-gray-50">
      <div className="w-full max-w-md px-4">{children}</div>
    </div>
  )
}
```

- [ ] **Step 2: Create `app/(auth)/login/page.tsx`**

```typescript
'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import { signInWithEmailAndPassword } from 'firebase/auth'
import { auth } from '@/lib/firebase'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import Link from 'next/link'

export default function LoginPage() {
  const router = useRouter()
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [error, setError] = useState<string | null>(null)
  const [loading, setLoading] = useState(false)

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    setError(null)
    setLoading(true)
    try {
      const cred = await signInWithEmailAndPassword(auth, email, password)
      // Force token refresh to get latest claims
      const result = await cred.user.getIdTokenResult(true)
      const orgSlug = result.claims.orgSlug as string | undefined
      router.push(orgSlug ? `/${orgSlug}` : '/onboarding')
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : 'Login failed')
    } finally {
      setLoading(false)
    }
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle>Sign in to TraxEvent</CardTitle>
      </CardHeader>
      <CardContent>
        <form onSubmit={handleSubmit} className="space-y-4">
          <div className="space-y-1">
            <Label htmlFor="email">Email</Label>
            <Input
              id="email"
              type="email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              required
            />
          </div>
          <div className="space-y-1">
            <Label htmlFor="password">Password</Label>
            <Input
              id="password"
              type="password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              required
            />
          </div>
          {error && <p className="text-sm text-red-600">{error}</p>}
          <Button type="submit" className="w-full" disabled={loading}>
            {loading ? 'Signing in…' : 'Sign in'}
          </Button>
        </form>
        <p className="mt-4 text-sm text-center text-gray-600">
          No account?{' '}
          <Link href="/signup" className="text-blue-600 hover:underline">
            Sign up
          </Link>
        </p>
      </CardContent>
    </Card>
  )
}
```

- [ ] **Step 3: Create `app/(auth)/signup/page.tsx`**

```typescript
'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import { createUserWithEmailAndPassword, updateProfile } from 'firebase/auth'
import { auth } from '@/lib/firebase'
import { createUser } from '@/actions/auth'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import Link from 'next/link'

export default function SignupPage() {
  const router = useRouter()
  const [name, setName] = useState('')
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [error, setError] = useState<string | null>(null)
  const [loading, setLoading] = useState(false)

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    setError(null)
    setLoading(true)
    try {
      const cred = await createUserWithEmailAndPassword(auth, email, password)
      await updateProfile(cred.user, { displayName: name })
      await createUser(cred.user.uid, email, name)
      router.push('/onboarding')
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : 'Signup failed')
    } finally {
      setLoading(false)
    }
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle>Create your TraxEvent account</CardTitle>
      </CardHeader>
      <CardContent>
        <form onSubmit={handleSubmit} className="space-y-4">
          <div className="space-y-1">
            <Label htmlFor="name">Full name</Label>
            <Input
              id="name"
              value={name}
              onChange={(e) => setName(e.target.value)}
              required
            />
          </div>
          <div className="space-y-1">
            <Label htmlFor="email">Email</Label>
            <Input
              id="email"
              type="email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              required
            />
          </div>
          <div className="space-y-1">
            <Label htmlFor="password">Password</Label>
            <Input
              id="password"
              type="password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              minLength={8}
              required
            />
          </div>
          {error && <p className="text-sm text-red-600">{error}</p>}
          <Button type="submit" className="w-full" disabled={loading}>
            {loading ? 'Creating account…' : 'Create account'}
          </Button>
        </form>
        <p className="mt-4 text-sm text-center text-gray-600">
          Already have an account?{' '}
          <Link href="/login" className="text-blue-600 hover:underline">
            Sign in
          </Link>
        </p>
      </CardContent>
    </Card>
  )
}
```

- [ ] **Step 4: Commit**

```bash
git add "app/(auth)/"
git commit -m "feat: login, signup, and auth layout"
```

---

### Task 8: Subdomain routing middleware

**Files:**
- Create: `middleware.ts`
- Create: `__tests__/middleware.test.ts`

- [ ] **Step 1: Write failing tests**

```typescript
// __tests__/middleware.test.ts
import { describe, it, expect } from 'vitest'
import { extractOrgSlug } from '@/middleware'

describe('extractOrgSlug', () => {
  it('returns slug from subdomain on traxevent.com', () => {
    expect(extractOrgSlug('firsthills.traxevent.com')).toBe('firsthills')
  })

  it('returns null for the apex domain', () => {
    expect(extractOrgSlug('traxevent.com')).toBeNull()
  })

  it('returns null for www subdomain', () => {
    expect(extractOrgSlug('www.traxevent.com')).toBeNull()
  })

  it('returns null for localhost', () => {
    expect(extractOrgSlug('localhost:3000')).toBeNull()
  })

  it('returns null for reserved subdomains', () => {
    expect(extractOrgSlug('app.traxevent.com')).toBeNull()
    expect(extractOrgSlug('api.traxevent.com')).toBeNull()
  })
})
```

- [ ] **Step 2: Run test to verify it fails**

```bash
npm test __tests__/middleware.test.ts
```
Expected: FAIL — `extractOrgSlug is not a function`

- [ ] **Step 3: Create `middleware.ts`**

```typescript
import { NextRequest, NextResponse } from 'next/server'

const ROOT_DOMAIN = 'traxevent.com'
const RESERVED = new Set(['www', 'app', 'api'])

export function extractOrgSlug(hostname: string): string | null {
  // Strip port if present
  const host = hostname.split(':')[0]
  if (host === ROOT_DOMAIN) return null
  if (!host.endsWith(`.${ROOT_DOMAIN}`)) return null
  const sub = host.slice(0, host.length - ROOT_DOMAIN.length - 1)
  if (RESERVED.has(sub)) return null
  return sub
}

export function middleware(request: NextRequest) {
  const hostname = request.headers.get('host') ?? ''
  const orgSlug = extractOrgSlug(hostname)

  if (!orgSlug) return NextResponse.next()

  const url = request.nextUrl.clone()
  // Rewrite: /{path} → /{orgSlug}/{path} so the [orgSlug] route segment is populated
  if (!url.pathname.startsWith(`/${orgSlug}`)) {
    url.pathname = `/${orgSlug}${url.pathname}`
    return NextResponse.rewrite(url)
  }

  return NextResponse.next()
}

export const config = {
  matcher: ['/((?!_next/static|_next/image|favicon.ico).*)'],
}
```

- [ ] **Step 4: Run test to verify it passes**

```bash
npm test __tests__/middleware.test.ts
```
Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add middleware.ts __tests__/middleware.test.ts
git commit -m "feat: subdomain routing middleware"
```

---

### Task 9: Org server actions + onboarding

**Files:**
- Create: `actions/orgs.ts`
- Create: `__tests__/actions/orgs.test.ts`
- Create: `app/(auth)/onboarding/page.tsx`

- [ ] **Step 1: Write failing test**

```typescript
// __tests__/actions/orgs.test.ts
import { describe, it, expect, vi } from 'vitest'

vi.mock('@/lib/firebase-admin', () => ({
  adminAuth: { setCustomUserClaims: vi.fn().mockResolvedValue(undefined) },
  adminDb: {
    collection: vi.fn().mockReturnThis(),
    doc: vi.fn().mockReturnThis(),
    set: vi.fn().mockResolvedValue(undefined),
    where: vi.fn().mockReturnThis(),
    limit: vi.fn().mockReturnThis(),
    get: vi.fn(),
  },
}))

vi.mock('@/actions/auth', () => ({
  setOrgClaims: vi.fn().mockResolvedValue(undefined),
}))

import { slugify } from '@/actions/orgs'

describe('slugify', () => {
  it('lowercases and hyphenates spaces', () => {
    expect(slugify('First Hills Fellowship')).toBe('first-hills-fellowship')
  })

  it('strips special characters', () => {
    expect(slugify("St. Mary's Church")).toBe('st-marys-church')
  })

  it('collapses multiple spaces/hyphens', () => {
    expect(slugify('A  B')).toBe('a-b')
  })
})
```

- [ ] **Step 2: Run test to verify it fails**

```bash
npm test __tests__/actions/orgs.test.ts
```
Expected: FAIL — `slugify is not a function`

- [ ] **Step 3: Implement `actions/orgs.ts`**

```typescript
'use server'

import { adminDb } from '@/lib/firebase-admin'
import { setOrgClaims } from '@/actions/auth'
import type { Org, OrgRole } from '@/lib/types'

export function slugify(name: string): string {
  return name
    .toLowerCase()
    .replace(/[^a-z0-9\s]/g, '')
    .trim()
    .replace(/\s+/g, '-')
    .replace(/-+/g, '-')
}

export async function createOrg(
  uid: string,
  orgName: string,
  displayName: string,
  email: string
): Promise<Org> {
  const slug = slugify(orgName)
  const orgRef = adminDb.collection('orgs').doc()
  const orgId = orgRef.id

  const org: Org = {
    id: orgId,
    name: orgName,
    slug,
    billing_status: 'trialing',
    created_at: new Date().toISOString(),
  }

  await orgRef.set(org)

  // Add creator as owner
  await adminDb
    .collection('orgs').doc(orgId)
    .collection('members').doc(uid)
    .set({ uid, role: 'owner' as OrgRole, display_name: displayName, email, camp_access: {} })

  // Set JWT claims (orgSlug included so login redirect works without extra lookup)
  await setOrgClaims(uid, orgId, slug, 'owner')

  return org
}

export async function getOrg(orgId: string): Promise<Org | null> {
  const snap = await adminDb.collection('orgs').doc(orgId).get()
  return snap.exists ? (snap.data() as Org) : null
}

export async function getOrgBySlug(slug: string): Promise<Org | null> {
  const snap = await adminDb
    .collection('orgs')
    .where('slug', '==', slug)
    .limit(1)
    .get()
  if (snap.empty) return null
  return snap.docs[0].data() as Org
}
```

- [ ] **Step 4: Run test to verify it passes**

```bash
npm test __tests__/actions/orgs.test.ts
```
Expected: PASS

- [ ] **Step 5: Create `app/(auth)/onboarding/page.tsx`**

```typescript
'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import { useAuth } from '@/hooks/useAuth'
import { createOrg } from '@/actions/orgs'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'

export default function OnboardingPage() {
  const router = useRouter()
  const { user } = useAuth()
  const [orgName, setOrgName] = useState('')
  const [error, setError] = useState<string | null>(null)
  const [loading, setLoading] = useState(false)

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    if (!user) return
    setError(null)
    setLoading(true)
    try {
      const org = await createOrg(
        user.uid,
        orgName,
        user.displayName ?? '',
        user.email ?? ''
      )
      // Force token refresh so new claims (orgId, orgSlug, role) are active
      await user.getIdToken(true)
      router.push(`/${org.slug}`)
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : 'Failed to create organization')
    } finally {
      setLoading(false)
    }
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle>Create your organization</CardTitle>
      </CardHeader>
      <CardContent>
        <form onSubmit={handleSubmit} className="space-y-4">
          <div className="space-y-1">
            <Label htmlFor="orgName">Organization name</Label>
            <p className="text-xs text-gray-500">
              E.g. "First Hills Fellowship" or "Riverside Youth Ministry"
            </p>
            <Input
              id="orgName"
              value={orgName}
              onChange={(e) => setOrgName(e.target.value)}
              placeholder="Your church or organization"
              required
            />
          </div>
          {error && <p className="text-sm text-red-600">{error}</p>}
          <Button type="submit" className="w-full" disabled={loading || !user}>
            {loading ? 'Creating…' : 'Create organization'}
          </Button>
        </form>
      </CardContent>
    </Card>
  )
}
```

- [ ] **Step 6: Commit**

```bash
git add actions/orgs.ts __tests__/actions/orgs.test.ts "app/(auth)/onboarding/"
git commit -m "feat: org creation server action and onboarding page"
```

---

### Task 10: Camp server actions + org home + new camp page

**Files:**
- Create: `actions/camps.ts`
- Create: `__tests__/actions/camps.test.ts`
- Create: `app/(admin)/[orgSlug]/page.tsx`
- Create: `app/(admin)/[orgSlug]/new-camp/page.tsx`

- [ ] **Step 1: Write failing test**

```typescript
// __tests__/actions/camps.test.ts
import { describe, it, expect, vi } from 'vitest'

vi.mock('@/lib/firebase-admin', () => ({
  adminDb: {
    collection: vi.fn().mockReturnThis(),
    doc: vi.fn().mockReturnThis(),
    set: vi.fn().mockResolvedValue(undefined),
    id: 'camp-id-123',
    orderBy: vi.fn().mockReturnThis(),
    get: vi.fn(),
  },
}))

import { buildCampSlug } from '@/actions/camps'

describe('buildCampSlug', () => {
  it('appends the year to the name slug', () => {
    expect(buildCampSlug('Family Camp', 2026)).toBe('family-camp-2026')
  })

  it('handles special characters', () => {
    expect(buildCampSlug("Women's Retreat", 2026)).toBe('womens-retreat-2026')
  })
})
```

- [ ] **Step 2: Run test to verify it fails**

```bash
npm test __tests__/actions/camps.test.ts
```
Expected: FAIL — `buildCampSlug is not a function`

- [ ] **Step 3: Implement `actions/camps.ts`**

```typescript
'use server'

import { adminDb } from '@/lib/firebase-admin'
import type { Camp, CampRegistrationType } from '@/lib/types'

export function buildCampSlug(name: string, year: number): string {
  const base = name
    .toLowerCase()
    .replace(/[^a-z0-9\s]/g, '')
    .trim()
    .replace(/\s+/g, '-')
    .replace(/-+/g, '-')
  return `${base}-${year}`
}

export async function createCamp(
  orgId: string,
  input: {
    name: string
    year: number
    registration_type: CampRegistrationType
    camp_start: string
    camp_end: string
  }
): Promise<Camp> {
  const campRef = adminDb
    .collection('orgs').doc(orgId)
    .collection('camps').doc()

  const camp: Camp = {
    id: campRef.id,
    name: input.name,
    slug: buildCampSlug(input.name, input.year),
    year: input.year,
    status: 'draft',
    registration_type: input.registration_type,
    features: {
      accommodations: true,
      teams: true,
      budget: true,
      itinerary: true,
      communicate: true,
    },
    camp_start: input.camp_start,
    camp_end: input.camp_end,
    created_at: new Date().toISOString(),
  }

  await campRef.set(camp)
  return camp
}

export async function listCamps(orgId: string): Promise<Camp[]> {
  const snap = await adminDb
    .collection('orgs').doc(orgId)
    .collection('camps')
    .orderBy('created_at', 'desc')
    .get()
  return snap.docs.map((d) => d.data() as Camp)
}

export async function getCampBySlug(orgId: string, slug: string): Promise<Camp | null> {
  const snap = await adminDb
    .collection('orgs').doc(orgId)
    .collection('camps')
    .where('slug', '==', slug)
    .limit(1)
    .get()
  return snap.empty ? null : (snap.docs[0].data() as Camp)
}
```

- [ ] **Step 4: Run test to verify it passes**

```bash
npm test __tests__/actions/camps.test.ts
```
Expected: PASS

- [ ] **Step 5: Create `app/(admin)/[orgSlug]/page.tsx`**

```typescript
import { getOrgBySlug } from '@/actions/orgs'
import { listCamps } from '@/actions/camps'
import { redirect } from 'next/navigation'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import Link from 'next/link'

export default async function OrgHomePage({
  params,
}: {
  params: { orgSlug: string }
}) {
  const org = await getOrgBySlug(params.orgSlug)
  if (!org) redirect('/login')

  const camps = await listCamps(org.id)

  return (
    <div className="p-6">
      <div className="flex items-center justify-between mb-6">
        <h1 className="text-2xl font-bold">{org.name}</h1>
        <Link href={`/${params.orgSlug}/new-camp`}>
          <Button>New camp</Button>
        </Link>
      </div>

      {camps.length === 0 ? (
        <div className="text-center py-16 text-gray-500">
          <p className="text-lg font-medium">No camps yet</p>
          <p className="mt-1 text-sm">Create your first camp to get started.</p>
          <Link href={`/${params.orgSlug}/new-camp`} className="mt-4 inline-block">
            <Button>Create a camp</Button>
          </Link>
        </div>
      ) : (
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {camps.map((camp) => (
            <Link key={camp.id} href={`/${params.orgSlug}/${camp.slug}/dashboard`}>
              <Card className="hover:shadow-md transition-shadow cursor-pointer h-full">
                <CardHeader>
                  <CardTitle className="text-base">{camp.name}</CardTitle>
                </CardHeader>
                <CardContent>
                  <div className="flex items-center gap-2 flex-wrap">
                    <Badge variant="outline">{camp.year}</Badge>
                    <Badge variant={camp.status === 'active' ? 'default' : 'secondary'}>
                      {camp.status}
                    </Badge>
                    <Badge variant="outline">{camp.registration_type}</Badge>
                  </div>
                  <p className="mt-2 text-xs text-gray-400">
                    {camp.camp_start} → {camp.camp_end}
                  </p>
                </CardContent>
              </Card>
            </Link>
          ))}
        </div>
      )}
    </div>
  )
}
```

- [ ] **Step 6: Create `app/(admin)/[orgSlug]/new-camp/page.tsx`**

```typescript
'use client'

import { useState } from 'react'
import { useRouter, useParams } from 'next/navigation'
import { createCamp } from '@/actions/camps'
import { getOrgBySlug } from '@/actions/orgs'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Card, CardContent } from '@/components/ui/card'
import type { CampRegistrationType } from '@/lib/types'

export default function NewCampPage() {
  const router = useRouter()
  const { orgSlug } = useParams<{ orgSlug: string }>()
  const [name, setName] = useState('')
  const [year, setYear] = useState(new Date().getFullYear())
  const [regType, setRegType] = useState<CampRegistrationType>('family')
  const [campStart, setCampStart] = useState('')
  const [campEnd, setCampEnd] = useState('')
  const [error, setError] = useState<string | null>(null)
  const [loading, setLoading] = useState(false)

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    setError(null)
    setLoading(true)
    try {
      const org = await getOrgBySlug(orgSlug)
      if (!org) throw new Error('Organization not found')
      const camp = await createCamp(org.id, {
        name,
        year,
        registration_type: regType,
        camp_start: campStart,
        camp_end: campEnd,
      })
      router.push(`/${orgSlug}/${camp.slug}/dashboard`)
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : 'Failed to create camp')
    } finally {
      setLoading(false)
    }
  }

  return (
    <div className="p-6 max-w-lg">
      <h1 className="text-2xl font-bold mb-6">New camp</h1>
      <Card>
        <CardContent className="pt-6">
          <form onSubmit={handleSubmit} className="space-y-4">
            <div className="space-y-1">
              <Label htmlFor="name">Camp name</Label>
              <Input
                id="name"
                value={name}
                onChange={(e) => setName(e.target.value)}
                placeholder="Family Camp 2026"
                required
              />
            </div>
            <div className="space-y-1">
              <Label htmlFor="year">Year</Label>
              <Input
                id="year"
                type="number"
                value={year}
                onChange={(e) => setYear(Number(e.target.value))}
                min={2020}
                max={2040}
                required
              />
            </div>
            <div className="space-y-1">
              <Label htmlFor="regType">Registration type</Label>
              <select
                id="regType"
                className="w-full border rounded-md px-3 py-2 text-sm bg-white"
                value={regType}
                onChange={(e) => setRegType(e.target.value as CampRegistrationType)}
              >
                <option value="family">Family — one form per family unit</option>
                <option value="individual">Individual — one form per person</option>
                <option value="child">Child — guardian fills form for a child</option>
              </select>
            </div>
            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-1">
                <Label htmlFor="campStart">Start date</Label>
                <Input
                  id="campStart"
                  type="date"
                  value={campStart}
                  onChange={(e) => setCampStart(e.target.value)}
                  required
                />
              </div>
              <div className="space-y-1">
                <Label htmlFor="campEnd">End date</Label>
                <Input
                  id="campEnd"
                  type="date"
                  value={campEnd}
                  onChange={(e) => setCampEnd(e.target.value)}
                  required
                />
              </div>
            </div>
            {error && <p className="text-sm text-red-600">{error}</p>}
            <Button type="submit" className="w-full" disabled={loading}>
              {loading ? 'Creating…' : 'Create camp'}
            </Button>
          </form>
        </CardContent>
      </Card>
    </div>
  )
}
```

- [ ] **Step 7: Commit**

```bash
git add actions/camps.ts __tests__/actions/camps.test.ts \
  "app/(admin)/[orgSlug]/page.tsx" \
  "app/(admin)/[orgSlug]/new-camp/"
git commit -m "feat: camp creation server action, org home, and new camp page"
```

---

### Task 11: Admin layout + sidebar

**Files:**
- Create: `components/layout/AdminSidebar.tsx`
- Create: `app/(admin)/[orgSlug]/layout.tsx`
- Create: `app/(admin)/[orgSlug]/[campSlug]/layout.tsx`
- Create: `app/(admin)/[orgSlug]/[campSlug]/dashboard/page.tsx`

- [ ] **Step 1: Create `components/layout/AdminSidebar.tsx`**

```typescript
'use client'

import Link from 'next/link'
import { usePathname } from 'next/navigation'

interface AdminSidebarProps {
  orgSlug: string
  campSlug?: string
}

const CAMP_NAV = [
  { key: 'dashboard', label: 'Dashboard' },
  { key: 'families', label: 'Families' },
  { key: 'assignments', label: 'Assignments' },
  { key: 'teams', label: 'Teams' },
  { key: 'budget', label: 'Budget' },
  { key: 'itinerary', label: 'Itinerary' },
  { key: 'communicate', label: 'Communicate' },
  { key: 'reports', label: 'Reports' },
]

export function AdminSidebar({ orgSlug, campSlug }: AdminSidebarProps) {
  const pathname = usePathname()

  function navClass(href: string) {
    const active = pathname === href || pathname.startsWith(href + '/')
    return [
      'block px-3 py-2 rounded-md text-sm font-medium transition-colors',
      active
        ? 'bg-gray-700 text-white'
        : 'text-gray-300 hover:bg-gray-700 hover:text-white',
    ].join(' ')
  }

  return (
    <aside className="w-56 bg-gray-900 text-gray-100 min-h-screen flex flex-col flex-shrink-0">
      <div className="px-4 py-5 border-b border-gray-700">
        <Link href={`/${orgSlug}`} className="font-bold text-white text-lg tracking-tight">
          TraxEvent
        </Link>
      </div>

      {campSlug && (
        <nav className="flex-1 px-2 py-4 space-y-0.5" aria-label="Camp navigation">
          {CAMP_NAV.map(({ key, label }) => {
            const href = `/${orgSlug}/${campSlug}/${key}`
            return (
              <Link key={key} href={href} className={navClass(href)}>
                {label}
              </Link>
            )
          })}
        </nav>
      )}

      <div className="px-2 py-4 border-t border-gray-700 space-y-0.5">
        <Link href={`/${orgSlug}/members`} className={navClass(`/${orgSlug}/members`)}>
          Members
        </Link>
        <Link href={`/${orgSlug}/settings`} className={navClass(`/${orgSlug}/settings`)}>
          Settings
        </Link>
      </div>
    </aside>
  )
}
```

- [ ] **Step 2: Create `app/(admin)/[orgSlug]/layout.tsx`**

```typescript
import { AdminSidebar } from '@/components/layout/AdminSidebar'

export default function OrgLayout({
  children,
  params,
}: {
  children: React.ReactNode
  params: { orgSlug: string }
}) {
  return (
    <div className="flex min-h-screen">
      <AdminSidebar orgSlug={params.orgSlug} />
      <main className="flex-1 bg-gray-50 overflow-auto">{children}</main>
    </div>
  )
}
```

- [ ] **Step 3: Create `app/(admin)/[orgSlug]/[campSlug]/layout.tsx`**

```typescript
import { AdminSidebar } from '@/components/layout/AdminSidebar'

export default function CampLayout({
  children,
  params,
}: {
  children: React.ReactNode
  params: { orgSlug: string; campSlug: string }
}) {
  return (
    <div className="flex min-h-screen">
      <AdminSidebar orgSlug={params.orgSlug} campSlug={params.campSlug} />
      <main className="flex-1 bg-gray-50 overflow-auto">{children}</main>
    </div>
  )
}
```

- [ ] **Step 4: Create `app/(admin)/[orgSlug]/[campSlug]/dashboard/page.tsx`**

```typescript
export default function DashboardPage({
  params,
}: {
  params: { orgSlug: string; campSlug: string }
}) {
  return (
    <div className="p-6">
      <h1 className="text-2xl font-bold mb-2">Dashboard</h1>
      <p className="text-gray-500 text-sm">
        {params.orgSlug} / {params.campSlug}
      </p>
      <div className="mt-8 p-6 bg-white rounded-lg border text-center text-gray-400">
        Camp feature pages (families, assignments, teams, budget, itinerary, communicate)
        are coming in Phase 1b.
      </div>
    </div>
  )
}
```

- [ ] **Step 5: Commit**

```bash
git add components/layout/ \
  "app/(admin)/[orgSlug]/layout.tsx" \
  "app/(admin)/[orgSlug]/[campSlug]/"
git commit -m "feat: admin layout with sidebar and camp dashboard placeholder"
```

---

### Task 12: Members — invite + permission matrix

**Files:**
- Create: `actions/members.ts`
- Create: `__tests__/actions/members.test.ts`
- Create: `components/members/InviteMemberModal.tsx`
- Create: `components/members/PermissionMatrix.tsx`
- Create: `app/(admin)/[orgSlug]/members/page.tsx`
- Create: `app/(auth)/accept-invite/page.tsx`

- [ ] **Step 1: Write failing test**

```typescript
// __tests__/actions/members.test.ts
import { describe, it, expect, vi } from 'vitest'

vi.mock('@/lib/firebase-admin', () => ({
  adminAuth: { setCustomUserClaims: vi.fn() },
  adminDb: {
    collection: vi.fn().mockReturnThis(),
    collectionGroup: vi.fn().mockReturnThis(),
    doc: vi.fn().mockReturnThis(),
    set: vi.fn().mockResolvedValue(undefined),
    update: vi.fn().mockResolvedValue(undefined),
    where: vi.fn().mockReturnThis(),
    limit: vi.fn().mockReturnThis(),
    get: vi.fn(),
  },
}))

vi.mock('@/actions/auth', () => ({
  setOrgClaims: vi.fn().mockResolvedValue(undefined),
}))

import { buildInviteToken, validateCampPages } from '@/actions/members'
import { CAMP_PAGES } from '@/lib/types'

describe('buildInviteToken', () => {
  it('returns a 32-char hex string', () => {
    const token = buildInviteToken()
    expect(token).toMatch(/^[a-f0-9]{32}$/)
  })

  it('returns a unique value each call', () => {
    expect(buildInviteToken()).not.toBe(buildInviteToken())
  })
})

describe('validateCampPages', () => {
  it('filters out invalid page names', () => {
    expect(validateCampPages(['dashboard', 'bogus', 'teams'])).toEqual([
      'dashboard',
      'teams',
    ])
  })

  it('passes all valid pages through unchanged', () => {
    const all = [...CAMP_PAGES]
    expect(validateCampPages(all)).toEqual(all)
  })
})
```

- [ ] **Step 2: Run test to verify it fails**

```bash
npm test __tests__/actions/members.test.ts
```
Expected: FAIL — `buildInviteToken is not a function`

- [ ] **Step 3: Implement `actions/members.ts`**

```typescript
'use server'

import { randomBytes } from 'crypto'
import { adminDb } from '@/lib/firebase-admin'
import { setOrgClaims } from '@/actions/auth'
import {
  CAMP_PAGES,
  type OrgRole,
  type OrgMember,
  type OrgInvitation,
  type CampPage,
} from '@/lib/types'

export function buildInviteToken(): string {
  return randomBytes(16).toString('hex')
}

export function validateCampPages(pages: string[]): CampPage[] {
  return pages.filter((p): p is CampPage =>
    (CAMP_PAGES as readonly string[]).includes(p)
  )
}

export async function createInvitation(
  orgId: string,
  email: string,
  role: OrgRole
): Promise<OrgInvitation> {
  const token = buildInviteToken()
  const now = new Date()
  const expires = new Date(now.getTime() + 7 * 24 * 60 * 60 * 1000)

  const invitation: OrgInvitation = {
    token,
    email,
    role,
    created_at: now.toISOString(),
    expires_at: expires.toISOString(),
  }

  await adminDb
    .collection('orgs').doc(orgId)
    .collection('invitations').doc(token)
    .set(invitation)

  return invitation
}

export async function acceptInvitation(
  token: string,
  uid: string,
  displayName: string,
  email: string,
  orgSlug: string
): Promise<void> {
  const snap = await adminDb
    .collectionGroup('invitations')
    .where('token', '==', token)
    .limit(1)
    .get()

  if (snap.empty) throw new Error('Invitation not found')

  const invRef = snap.docs[0].ref
  const inv = snap.docs[0].data() as OrgInvitation

  if (inv.accepted_at) throw new Error('Invitation already used')
  if (new Date(inv.expires_at) < new Date()) throw new Error('Invitation expired')

  const orgId = invRef.parent.parent!.id

  await adminDb
    .collection('orgs').doc(orgId)
    .collection('members').doc(uid)
    .set({ uid, role: inv.role, display_name: displayName, email, camp_access: {} })

  await invRef.update({ accepted_at: new Date().toISOString() })
  await setOrgClaims(uid, orgId, orgSlug, inv.role)
}

export async function listMembers(orgId: string): Promise<OrgMember[]> {
  const snap = await adminDb
    .collection('orgs').doc(orgId)
    .collection('members')
    .get()
  return snap.docs.map((d) => d.data() as OrgMember)
}

export async function updateStaffCampAccess(
  orgId: string,
  uid: string,
  campId: string,
  pages: string[]
): Promise<void> {
  const validPages = validateCampPages(pages)
  await adminDb
    .collection('orgs').doc(orgId)
    .collection('members').doc(uid)
    .update({ [`camp_access.${campId}.pages`]: validPages })
}
```

- [ ] **Step 4: Run test to verify it passes**

```bash
npm test __tests__/actions/members.test.ts
```
Expected: PASS

- [ ] **Step 5: Create `components/members/PermissionMatrix.tsx`**

```typescript
'use client'

import { useState } from 'react'
import { updateStaffCampAccess } from '@/actions/members'
import { CAMP_PAGES, type OrgMember, type Camp } from '@/lib/types'

interface PermissionMatrixProps {
  orgId: string
  staff: OrgMember[]
  camps: Camp[]
}

export function PermissionMatrix({ orgId, staff, camps }: PermissionMatrixProps) {
  const [saving, setSaving] = useState<string | null>(null)

  async function toggle(
    uid: string,
    campId: string,
    page: string,
    current: string[]
  ) {
    const key = `${uid}-${campId}-${page}`
    setSaving(key)
    const next = current.includes(page)
      ? current.filter((p) => p !== page)
      : [...current, page]
    await updateStaffCampAccess(orgId, uid, campId, next)
    setSaving(null)
  }

  if (staff.length === 0) {
    return (
      <p className="text-sm text-gray-500">
        No staff members yet. Invite a staff member above.
      </p>
    )
  }

  return (
    <div className="space-y-8">
      {camps.map((camp) => (
        <div key={camp.id}>
          <h3 className="font-semibold mb-3 text-gray-700">{camp.name}</h3>
          <div className="overflow-x-auto">
            <table className="text-sm border-collapse w-full">
              <thead>
                <tr>
                  <th
                    scope="col"
                    className="text-left py-2 pr-6 font-medium text-gray-500 whitespace-nowrap"
                  >
                    Staff member
                  </th>
                  {CAMP_PAGES.map((page) => (
                    <th
                      key={page}
                      scope="col"
                      className="py-2 px-3 font-medium text-gray-500 capitalize text-center whitespace-nowrap"
                    >
                      {page}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {staff.map((member) => {
                  const pages = member.camp_access?.[camp.id]?.pages ?? []
                  return (
                    <tr key={member.uid} className="border-t">
                      <td className="py-3 pr-6">
                        <div className="font-medium">{member.display_name}</div>
                        <div className="text-xs text-gray-400">{member.email}</div>
                      </td>
                      {CAMP_PAGES.map((page) => {
                        const key = `${member.uid}-${camp.id}-${page}`
                        const checked = pages.includes(page)
                        return (
                          <td key={page} className="py-3 px-3 text-center">
                            <input
                              type="checkbox"
                              checked={checked}
                              disabled={saving === key}
                              onChange={() => toggle(member.uid, camp.id, page, pages)}
                              className="h-4 w-4 cursor-pointer disabled:opacity-40"
                              aria-label={`${member.display_name} — ${page}`}
                            />
                          </td>
                        )
                      })}
                    </tr>
                  )
                })}
              </tbody>
            </table>
          </div>
        </div>
      ))}
    </div>
  )
}
```

- [ ] **Step 6: Create `components/members/InviteMemberModal.tsx`**

```typescript
'use client'

import { useState } from 'react'
import { createInvitation } from '@/actions/members'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from '@/components/ui/dialog'
import type { OrgRole } from '@/lib/types'

export function InviteMemberModal({ orgId }: { orgId: string }) {
  const [open, setOpen] = useState(false)
  const [email, setEmail] = useState('')
  const [role, setRole] = useState<OrgRole>('staff')
  const [inviteLink, setInviteLink] = useState<string | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [loading, setLoading] = useState(false)

  function reset() {
    setEmail('')
    setRole('staff')
    setInviteLink(null)
    setError(null)
  }

  async function handleInvite(e: React.FormEvent) {
    e.preventDefault()
    setError(null)
    setLoading(true)
    try {
      const inv = await createInvitation(orgId, email, role)
      setInviteLink(
        `${window.location.origin}/accept-invite?token=${inv.token}`
      )
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : 'Failed to create invitation')
    } finally {
      setLoading(false)
    }
  }

  return (
    <Dialog
      open={open}
      onOpenChange={(v) => {
        if (!v) reset()
        setOpen(v)
      }}
    >
      <DialogTrigger asChild>
        <Button variant="outline">Invite member</Button>
      </DialogTrigger>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Invite a team member</DialogTitle>
        </DialogHeader>

        {!inviteLink ? (
          <form onSubmit={handleInvite} className="space-y-4 mt-2">
            <div className="space-y-1">
              <Label htmlFor="invEmail">Email address</Label>
              <Input
                id="invEmail"
                type="email"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                required
              />
            </div>
            <div className="space-y-1">
              <Label htmlFor="invRole">Role</Label>
              <select
                id="invRole"
                className="w-full border rounded-md px-3 py-2 text-sm bg-white"
                value={role}
                onChange={(e) => setRole(e.target.value as OrgRole)}
              >
                <option value="admin">Admin — full org access</option>
                <option value="staff">Staff — per-camp page access</option>
              </select>
            </div>
            {error && <p className="text-sm text-red-600">{error}</p>}
            <Button type="submit" className="w-full" disabled={loading}>
              {loading ? 'Creating…' : 'Create invite link'}
            </Button>
          </form>
        ) : (
          <div className="mt-2 space-y-3">
            <p className="text-sm text-gray-600">
              Share this link with your team member:
            </p>
            <code className="block bg-gray-100 rounded-md p-3 text-xs break-all select-all">
              {inviteLink}
            </code>
            <p className="text-xs text-gray-400">Expires in 7 days.</p>
            <Button className="w-full" onClick={() => { reset(); setOpen(false) }}>
              Done
            </Button>
          </div>
        )}
      </DialogContent>
    </Dialog>
  )
}
```

- [ ] **Step 7: Create `app/(admin)/[orgSlug]/members/page.tsx`**

```typescript
import { getOrgBySlug } from '@/actions/orgs'
import { listMembers } from '@/actions/members'
import { listCamps } from '@/actions/camps'
import { InviteMemberModal } from '@/components/members/InviteMemberModal'
import { PermissionMatrix } from '@/components/members/PermissionMatrix'
import { Badge } from '@/components/ui/badge'
import { redirect } from 'next/navigation'

export default async function MembersPage({
  params,
}: {
  params: { orgSlug: string }
}) {
  const org = await getOrgBySlug(params.orgSlug)
  if (!org) redirect('/login')

  const [members, camps] = await Promise.all([listMembers(org.id), listCamps(org.id)])

  const admins = members.filter((m) => m.role !== 'staff')
  const staff = members.filter((m) => m.role === 'staff')

  return (
    <div className="p-6 max-w-5xl">
      <div className="flex items-center justify-between mb-6">
        <h1 className="text-2xl font-bold">Members</h1>
        <InviteMemberModal orgId={org.id} />
      </div>

      <section className="mb-8">
        <h2 className="text-lg font-semibold mb-3">Admins & Owners</h2>
        {admins.length === 0 ? (
          <p className="text-sm text-gray-500">No admins yet.</p>
        ) : (
          <div className="space-y-2">
            {admins.map((m) => (
              <div
                key={m.uid}
                className="flex items-center justify-between border rounded-lg px-4 py-3 bg-white"
              >
                <div>
                  <span className="font-medium">{m.display_name}</span>
                  <span className="ml-2 text-sm text-gray-400">{m.email}</span>
                </div>
                <Badge>{m.role}</Badge>
              </div>
            ))}
          </div>
        )}
      </section>

      <section>
        <h2 className="text-lg font-semibold mb-3">Staff Permissions</h2>
        <p className="text-sm text-gray-500 mb-4">
          Toggle which pages each staff member can access, per camp.
        </p>
        <PermissionMatrix orgId={org.id} staff={staff} camps={camps} />
      </section>
    </div>
  )
}
```

- [ ] **Step 8: Create `app/(auth)/accept-invite/page.tsx`**

```typescript
'use client'

import { useEffect, useState } from 'react'
import { useRouter, useSearchParams } from 'next/navigation'
import { useAuth } from '@/hooks/useAuth'
import { acceptInvitation } from '@/actions/members'
import { getOrgBySlug } from '@/actions/orgs'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Button } from '@/components/ui/button'

export default function AcceptInvitePage() {
  const router = useRouter()
  const params = useSearchParams()
  const token = params.get('token') ?? ''
  const { user, loading: authLoading } = useAuth()
  const [error, setError] = useState<string | null>(null)
  const [accepting, setAccepting] = useState(false)

  // If not logged in, redirect to login preserving token
  useEffect(() => {
    if (!authLoading && !user) {
      router.push(`/login?next=/accept-invite?token=${token}`)
    }
  }, [authLoading, user, router, token])

  async function handleAccept() {
    if (!user) return
    setError(null)
    setAccepting(true)
    try {
      // orgSlug is unknown at this point — acceptInvitation will look it up.
      // Pass empty string; the server action reads the org from the invitation path.
      // The claims update will use the actual orgSlug from Firestore.
      // NOTE: acceptInvitation needs to look up orgSlug from the org doc — update the
      // server action to do that lookup internally instead of requiring it as a param.
      await acceptInvitation(token, user.uid, user.displayName ?? '', user.email ?? '', '')
      await user.getIdToken(true) // refresh claims
      const result = await user.getIdTokenResult()
      const orgSlug = result.claims.orgSlug as string | undefined
      router.push(orgSlug ? `/${orgSlug}` : '/')
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : 'Failed to accept invitation')
    } finally {
      setAccepting(false)
    }
  }

  if (authLoading) return null

  return (
    <Card>
      <CardHeader>
        <CardTitle>You&apos;ve been invited to TraxEvent</CardTitle>
      </CardHeader>
      <CardContent>
        <p className="text-sm text-gray-600 mb-4">
          Click below to join the organization and access your camps.
        </p>
        {error && <p className="text-sm text-red-600 mb-3">{error}</p>}
        <Button className="w-full" onClick={handleAccept} disabled={accepting}>
          {accepting ? 'Joining…' : 'Accept invitation'}
        </Button>
      </CardContent>
    </Card>
  )
}
```

**Note:** `acceptInvitation` in `actions/members.ts` needs to look up `orgSlug` internally instead of requiring it as a parameter. Update the function signature to remove `orgSlug` and add an org lookup:

```typescript
// In actions/members.ts, update acceptInvitation:
export async function acceptInvitation(
  token: string,
  uid: string,
  displayName: string,
  email: string
): Promise<void> {
  const snap = await adminDb
    .collectionGroup('invitations')
    .where('token', '==', token)
    .limit(1)
    .get()

  if (snap.empty) throw new Error('Invitation not found')

  const invRef = snap.docs[0].ref
  const inv = snap.docs[0].data() as OrgInvitation

  if (inv.accepted_at) throw new Error('Invitation already used')
  if (new Date(inv.expires_at) < new Date()) throw new Error('Invitation expired')

  const orgId = invRef.parent.parent!.id

  // Look up org slug for claims
  const orgSnap = await adminDb.collection('orgs').doc(orgId).get()
  const orgSlug = (orgSnap.data() as { slug: string }).slug

  await adminDb
    .collection('orgs').doc(orgId)
    .collection('members').doc(uid)
    .set({ uid, role: inv.role, display_name: displayName, email, camp_access: {} })

  await invRef.update({ accepted_at: new Date().toISOString() })
  await setOrgClaims(uid, orgId, orgSlug, inv.role)
}
```

Also update `accept-invite/page.tsx` to call `acceptInvitation` without the `orgSlug` param (remove the `''` argument).

- [ ] **Step 9: Run all tests**

```bash
npm test
```
Expected: all pass.

- [ ] **Step 10: Commit**

```bash
git add actions/members.ts __tests__/actions/members.test.ts \
  components/members/ \
  "app/(admin)/[orgSlug]/members/" \
  "app/(auth)/accept-invite/"
git commit -m "feat: member invitations, accept-invite flow, staff permission matrix"
```

---

### Task 13: Placeholder pages + marketing stub

**Files:**
- Create: `app/(marketing)/page.tsx`
- Create: `app/(public)/[orgSlug]/[campSlug]/register/page.tsx`

- [ ] **Step 1: Create `app/(marketing)/page.tsx`**

```typescript
import Link from 'next/link'
import { Button } from '@/components/ui/button'

export default function MarketingPage() {
  return (
    <main className="min-h-screen flex flex-col items-center justify-center bg-white px-4">
      <h1 className="text-5xl font-bold text-gray-900 mb-4">TraxEvent</h1>
      <p className="text-xl text-gray-500 mb-8 text-center max-w-md">
        Camp registration and management for churches and ministries.
      </p>
      <div className="flex gap-3">
        <Link href="/signup">
          <Button size="lg">Get started</Button>
        </Link>
        <Link href="/login">
          <Button size="lg" variant="outline">Sign in</Button>
        </Link>
      </div>
    </main>
  )
}
```

- [ ] **Step 2: Create `app/(public)/[orgSlug]/[campSlug]/register/page.tsx`**

```typescript
export default function RegisterPage({
  params,
}: {
  params: { orgSlug: string; campSlug: string }
}) {
  return (
    <main className="min-h-screen flex items-center justify-center bg-gray-50">
      <div className="text-center text-gray-400">
        <h1 className="text-2xl font-bold text-gray-700 mb-2">Registration</h1>
        <p className="text-sm">
          {params.orgSlug} / {params.campSlug}
        </p>
        <p className="mt-4">Public registration form — Phase 1b.</p>
      </div>
    </main>
  )
}
```

- [ ] **Step 3: Commit**

```bash
git add "app/(marketing)/" "app/(public)/"
git commit -m "feat: marketing landing page and public register placeholder"
```

---

### Task 14: Push to GitHub + Vercel setup

- [ ] **Step 1: Create GitHub repo**

```bash
gh repo create traxevent --public --source=. --push
```

Or via GitHub web UI then:
```bash
git remote add origin https://github.com/<your-username>/traxevent.git
git push -u origin main
```

- [ ] **Step 2: Link to Vercel**

```bash
vercel link
# Team: verra-works
# Project name: traxevent
```

- [ ] **Step 3: Add environment variables to Vercel**

```bash
vercel env add NEXT_PUBLIC_FIREBASE_API_KEY production preview development
vercel env add NEXT_PUBLIC_FIREBASE_AUTH_DOMAIN production preview development
vercel env add NEXT_PUBLIC_FIREBASE_PROJECT_ID production preview development
vercel env add NEXT_PUBLIC_FIREBASE_STORAGE_BUCKET production preview development
vercel env add NEXT_PUBLIC_FIREBASE_MESSAGING_SENDER_ID production preview development
vercel env add NEXT_PUBLIC_FIREBASE_APP_ID production preview development
vercel env add FIREBASE_PROJECT_ID production preview development
vercel env add FIREBASE_CLIENT_EMAIL production preview development
vercel env add FIREBASE_PRIVATE_KEY production preview development
```

- [ ] **Step 4: Deploy preview**

```bash
vercel
```

- [ ] **Step 5: Configure wildcard domain in Vercel**

In Vercel project → Settings → Domains → add `traxevent.com` and `*.traxevent.com`.
In your DNS registrar, add:
- `A` record: `traxevent.com` → `76.76.21.21` (Vercel IP)
- `CNAME` record: `*.traxevent.com` → `cname.vercel-dns.com`

- [ ] **Step 6: Smoke test end-to-end**
  - Visit preview URL → sign up → create org → camp list appears
  - Create a camp → land on dashboard
  - Visit Members → invite staff → copy link → open in incognito → accept invite → log in → land on org home
  - In Members page → toggle a page permission → reload → confirm checkbox persists
  - Visit `firsthills.traxevent.com` (once DNS propagates) → confirm subdomain rewrite works

---

## Self-Review

**Spec vs plan coverage:**

| Phase 1 spec requirement | Plan coverage |
|--------------------------|---------------|
| Firestore multi-tenant data model | Tasks 3, 4, 9, 10 |
| Firebase Auth custom claims | Tasks 5, 6 |
| Org + Camp management UI | Tasks 9, 10, 11 |
| Staff invitation + permission matrix | Task 12 |
| Next.js middleware for subdomain routing | Task 8 |
| Port existing server.js API logic | **Phase 1b — separate plan** |
| Port app.html React components | **Phase 1b — separate plan** |

**Gaps noted and resolved:**
- `orgSlug` is stored in JWT claims (alongside `orgId`) so the login redirect can go directly to `/{orgSlug}` without an extra Firestore lookup. Reflected in `setOrgClaims` signature throughout.
- `acceptInvitation` looks up `orgSlug` internally from Firestore rather than requiring it as a caller parameter — updated in Task 12 Step 8 note.
- `accept-invite` page handles the case where the user isn't logged in (redirects to `/login?next=...`).
- Firestore rules allow public read of invitations so the accept-invite page can validate the token before the user is authenticated.
- Both org and camp layouts render `AdminSidebar` — the camp layout passes `campSlug` so camp nav appears; the org layout does not, so only the org-level links appear.
