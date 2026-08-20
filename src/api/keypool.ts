/**
 * API key pool with per-key health state.
 *
 * You have 5-6 keys × 1,000 units. This module treats them as one logical
 * quota: it picks the healthiest key for each request and transparently
 * fails over when a key is exhausted, invalid, or rate-limited.
 *
 * Everything is device-local. Keys are never transmitted anywhere except
 * to yce-api-01.makeupar.com in the Authorization header.
 *
 * Per PRD §5 — each key carries a status, not just a string.
 */

export type KeyState = 'ready' | 'cooling' | 'exhausted' | 'invalid' | 'unverified'

export interface PoolKey {
  id: string
  /** the secret (masked for display) */
  value: string
  /** user-facing name, e.g. "Key 1" */
  label: string
  state: KeyState
  /** estimated units consumed through this key */
  used: number
  /** unix ms until which this key is rate-limited */
  cooldownUntil?: number
  /** last error seen (raw API response text) */
  lastError?: string
  /** last HTTP status that changed state */
  lastStatus?: number
  /** verified against the API at least once */
  verified?: boolean
}

export const UNITS_PER_KEY = 1000

export function makeKey(value: string, index: number): PoolKey {
  return {
    id: `k${Date.now()}_${index}`,
    value: value.trim(),
    label: `Key ${index + 1}`,
    state: 'unverified',
    used: 0,
  }
}

/** Mask a key for display: never show the whole thing. */
export function maskKey(v: string): string {
  if (!v) return ''
  if (v.length <= 10) return v.slice(0, 2) + '••••'
  return `${v.slice(0, 4)}••••${v.slice(-4)}`
}

export class KeyPool {
  keys: PoolKey[] = []

  constructor(keys: PoolKey[] = []) {
    this.keys = keys
  }

  /** Keys usable right now. */
  available(): PoolKey[] {
    const now = Date.now()
    return this.keys.filter(
      (k) =>
        k.state === 'ready' ||
        (k.state === 'cooling' && (k.cooldownUntil ?? 0) <= now),
    )
  }

  /**
   * Next key to use. Least-used among ready keys so usage spreads evenly
   * instead of draining key 1 before touching key 2 — this also keeps each
   * key under the per-token rate limit (~4 QPS per key).
   */
  next(): PoolKey | null {
    const now = Date.now()
    // promote cooled-down keys back to ready
    for (const k of this.keys) {
      if (k.state === 'cooling' && (k.cooldownUntil ?? 0) <= now) {
        k.state = 'ready'
        k.cooldownUntil = undefined
      }
    }
    const pool = this.keys.filter((k) => k.state === 'ready')
    if (!pool.length) return null
    let best = pool[0]
    for (const k of pool) if (k.used < best.used) best = k
    return best
  }

  /** Total remaining units across the pool (estimate). */
  remaining(): number {
    return this.keys.reduce((n, k) => {
      if (k.state === 'invalid') return n
      return n + Math.max(0, UNITS_PER_KEY - k.used)
    }, 0)
  }

  total(): number {
    return this.keys.filter((k) => k.state !== 'invalid').length * UNITS_PER_KEY
  }

  charge(keyId: string, units: number) {
    const k = this.keys.find((x) => x.id === keyId)
    if (!k) return
    k.used += units
    if (k.used >= UNITS_PER_KEY) k.state = 'exhausted'
  }

  markExhausted(keyId: string, reason?: string) {
    const k = this.keys.find((x) => x.id === keyId)
    if (!k) return
    k.state = 'exhausted'
    k.used = UNITS_PER_KEY
    k.lastError = reason ?? 'Out of units'
  }

  markInvalid(keyId: string, msg = 'Invalid key', status?: number) {
    const k = this.keys.find((x) => x.id === keyId)
    if (!k) return
    k.state = 'invalid'
    k.lastError = msg
    if (status) k.lastStatus = status
  }

  markRateLimited(keyId: string, ms = 45_000) {
    const k = this.keys.find((x) => x.id === keyId)
    if (!k) return
    k.state = 'cooling'
    k.cooldownUntil = Date.now() + ms
    k.lastError = 'Rate limited, cooling down'
  }

  /** Mark a key as verified after a successful real-task check. */
  markVerified(keyId: string) {
    const k = this.keys.find((x) => x.id === keyId)
    if (!k) return
    k.verified = true
    k.state = 'ready'
    k.lastError = undefined
    k.lastStatus = undefined
  }

  add(value: string): PoolKey | null {
    const v = value.trim()
    if (!v) return null
    if (this.keys.some((k) => k.value === v)) return null // no duplicates
    const k = makeKey(v, this.keys.length)
    this.keys.push(k)
    return k
  }

  remove(id: string) {
    this.keys = this.keys.filter((k) => k.id !== id)
    this.keys.forEach((k, i) => (k.label = `Key ${i + 1}`))
  }

  reset(id: string) {
    const k = this.keys.find((x) => x.id === id)
    if (!k) return
    k.state = 'unverified'
    k.used = 0
    k.cooldownUntil = undefined
    k.lastError = undefined
    k.lastStatus = undefined
    k.verified = false
  }

  serialize(): PoolKey[] {
    return this.keys
  }
}

/**
 * Classify an API failure so the pool knows how to react.
 * Maps raw HTTP status + error_code → pool action.
 *
 * Per PRD §11 Error Taxonomy.
 */
export function classifyFailure(
  status: number,
  code?: string,
): 'exhausted' | 'invalid' | 'ratelimit' | 'other' {
  if (code === 'CreditInsufficiency') return 'exhausted'
  if (status === 401 || code === 'InvalidApiKey' || code === 'InvalidAccessToken') return 'invalid'
  if (status === 429) return 'ratelimit'
  return 'other'
}

/**
 * Map a failure to the PRD §5 key status and the PRD §11 action.
 * Returns the new state and a human-readable reason.
 */
export function classifyKeyStatus(
  status: number,
  code?: string,
  body?: string,
): { state: KeyState; reason: string } {
  const classification = classifyFailure(status, code)
  const raw = body || ''

  if (classification === 'exhausted') {
    return { state: 'exhausted', reason: `CreditInsufficiency — ${raw.slice(0, 200)}` }
  }
  if (classification === 'invalid') {
    if (status === 401 && raw) {
      return { state: 'invalid', reason: `401 on task endpoint — ${raw.slice(0, 200)}` }
    }
    // 401 on File API would be caught by the caller, but 401/403 on task
    // endpoint with a valid File API = auth-only (task scope missing)
    return { state: 'invalid', reason: `Invalid key/scope — ${raw.slice(0, 200)}` }
  }
  if (classification === 'ratelimit') {
    return { state: 'cooling', reason: `429 rate limited — ${raw.slice(0, 200)}` }
  }

  // Genuine request error (bad photo, invalid params) — keep key as-is
  if (status >= 400 && status < 500) {
    return { state: 'ready', reason: `Request error — ${raw.slice(0, 200)}` }
  }

  return { state: 'ready', reason: `Server error ${status} — ${raw.slice(0, 200)}` }
}
