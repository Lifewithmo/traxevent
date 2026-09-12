'use client'

// Serialized per-key optimistic-write machinery, extracted verbatim from
// LoadoutClient (spec 2026-08-23 S2.5: shared by LoadoutClient and
// ShoppingRunClient — forking it is a named trap). The no-silent-revert hard
// gate lives here:
// - Writes are SERIALIZED per key: at most one request is ever on the wire,
//   and a newer tap while one is in flight only records the newest intent —
//   the settle handler then chains one more request carrying it. The server
//   therefore receives states in tap order, so the LAST intended state always
//   wins (or fails visibly): a rapid double-tap can never commit out of order
//   and leave the server opposite the display with nothing shown.
// - `supersede` settles a set of keys when a bulk write takes them over.
// - `prune` drops flags for keys a recompute removed (their settle handlers
//   stand down via the unsettled check) so failure counts never point at
//   rows that no longer render.
// - `isUnsettled` is the synchronous mirror of pending ∪ failed — recompute
//   merges read it (the state sets would be closure-stale in an async
//   continuation) to preserve the checked state the operator can SEE.

import { useRef, useState } from 'react'

export interface SerializedCheckWrites {
  /** Keys with an unconfirmed write — render a saving indicator. */
  pending: ReadonlySet<string>
  /** Keys whose last write failed — render a visible retry, never revert. */
  failed: ReadonlySet<string>
  /** Record the newest intended state for a key and make sure exactly one
   *  request is (or will be) carrying it. Every tap and every retry funnels
   *  through here. `send` performs the actual write for this key. */
  enqueue: (key: string, intent: boolean, send: (intent: boolean) => Promise<void>) => void
  /** A bulk write supersedes these keys' per-key writes: settle their flags
   *  and stand any still-in-flight settle handlers down. */
  supersede: (keys: Iterable<string>) => void
  /** Keep flags only for keys that still exist (recompute/merge path). */
  prune: (keep: ReadonlySet<string>) => void
  /** Does this key's DISPLAYED checked state have an unconfirmed or failed
   *  write? Synchronous — safe inside async continuations. */
  isUnsettled: (key: string) => boolean
}

interface WriteEntry {
  seq: number
  intent: boolean
  send: (intent: boolean) => Promise<void>
  inflight: boolean
}

export function useSerializedCheckWrites(): SerializedCheckWrites {
  const [pending, setPending] = useState<ReadonlySet<string>>(new Set())
  const [failed, setFailed] = useState<ReadonlySet<string>>(new Set())
  const writesRef = useRef(new Map<string, WriteEntry>())
  // Keys whose DISPLAYED checked state has an unconfirmed or failed write —
  // the synchronous mirror of pending ∪ failed. dispatch treats removal from
  // it as "superseded: someone else settled my flags" (a bulk check-all, or a
  // recompute that dropped the row).
  const unsettledRef = useRef(new Set<string>())

  async function dispatch(key: string, seq: number): Promise<void> {
    const started = writesRef.current.get(key)
    if (!started) return
    started.inflight = true
    let ok = true
    try {
      await started.send(started.intent)
    } catch {
      ok = false
    }
    const cur = writesRef.current.get(key)
    if (cur) cur.inflight = false
    // Superseded: a bulk write took the key over, or a recompute removed it —
    // whoever superseded already settled the flags for this key.
    if (!cur || !unsettledRef.current.has(key)) return
    if (cur.seq !== seq) {
      // Newer tap(s) landed while this was on the wire. Send the latest
      // intent as its own request; this write's own outcome is moot because
      // the chained one lands after it on the server (last intent wins).
      void dispatch(key, cur.seq)
      return
    }
    setPending((s) => { const n = new Set(s); n.delete(key); return n })
    if (ok) {
      unsettledRef.current.delete(key)
    } else {
      setFailed((s) => new Set(s).add(key)) // stays unsettled until a retry lands
    }
  }

  function enqueue(key: string, intent: boolean, send: (intent: boolean) => Promise<void>): void {
    const prev = writesRef.current.get(key)
    const seq = (prev?.seq ?? 0) + 1
    writesRef.current.set(key, { seq, intent, send, inflight: prev?.inflight ?? false })
    unsettledRef.current.add(key)
    setPending((s) => new Set(s).add(key))
    setFailed((s) => { const n = new Set(s); n.delete(key); return n })
    // A request is already on the wire: its settle handler will see the seq
    // moved on and chain a request with the newest intent — never two at once.
    if (writesRef.current.get(key)!.inflight) return
    void dispatch(key, seq)
  }

  function supersede(keys: Iterable<string>): void {
    const drop = new Set<string>()
    for (const k of keys) {
      drop.add(k)
      unsettledRef.current.delete(k)
      const w = writesRef.current.get(k)
      // In-flight entries stay: their settle handler needs the entry to clear
      // its inflight bit — it stands down via the unsettled check above.
      if (w && !w.inflight) writesRef.current.delete(k)
    }
    setPending((s) => new Set([...s].filter((k) => !drop.has(k))))
    setFailed((s) => new Set([...s].filter((k) => !drop.has(k))))
  }

  function prune(keep: ReadonlySet<string>): void {
    for (const k of [...unsettledRef.current]) if (!keep.has(k)) unsettledRef.current.delete(k)
    setPending((s) => new Set([...s].filter((k) => keep.has(k))))
    setFailed((s) => new Set([...s].filter((k) => keep.has(k))))
  }

  return {
    pending,
    failed,
    enqueue,
    supersede,
    prune,
    isUnsettled: (key: string) => unsettledRef.current.has(key),
  }
}
