import { NextResponse } from 'next/server'
import { cookies } from 'next/headers'
import { createSessionCookieValue, SESSION_COOKIE, SESSION_MAX_AGE_SECONDS } from '@/lib/auth/session'

export async function POST(request: Request) {
  const { idToken } = await request.json().catch(() => ({ idToken: undefined }))
  if (!idToken || typeof idToken !== 'string') {
    return NextResponse.json({ error: 'Missing idToken' }, { status: 400 })
  }
  try {
    const value = await createSessionCookieValue(idToken)
    const store = await cookies()
    store.set(SESSION_COOKIE, value, {
      httpOnly: true,
      secure: process.env.NODE_ENV === 'production',
      sameSite: 'lax',
      path: '/',
      maxAge: SESSION_MAX_AGE_SECONDS,
    })
    return NextResponse.json({ ok: true })
  } catch {
    return NextResponse.json({ error: 'Invalid token' }, { status: 401 })
  }
}

export async function DELETE() {
  const store = await cookies()
  store.delete(SESSION_COOKIE)
  return NextResponse.json({ ok: true })
}
