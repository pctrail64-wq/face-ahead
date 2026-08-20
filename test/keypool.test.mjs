import { describe, it, beforeEach } from 'node:test'
import assert from 'node:assert/strict'

// --- Core logic being tested (replicated from src/api/keypool.ts) ---

function classifyFailure(status, code) {
  if (code === 'CreditInsufficiency') return 'exhausted'
  if (status === 401 || code === 'InvalidApiKey' || code === 'InvalidAccessToken') return 'invalid'
  if (status === 429) return 'ratelimit'
  return 'other'
}

const UNITS_PER_KEY = 1000

function makeKey(value, index) {
  return { id: 'k_' + index, value: value.trim(), label: 'Key ' + (index + 1), state: 'unverified', used: 0 }
}

class KeyPool {
  constructor(keys = []) { this.keys = keys }
  available() {
    const now = Date.now()
    return this.keys.filter(k =>
      k.state === 'ready' || (k.state === 'cooling' && (k.cooldownUntil ?? 0) <= now))
  }
  next() {
    for (const k of this.keys) {
      if (k.state === 'cooling' && (k.cooldownUntil ?? 0) <= Date.now()) {
        k.state = 'ready'; k.cooldownUntil = undefined
      }
    }
    const pool = this.keys.filter(k => k.state === 'ready')
    if (!pool.length) return null
    let best = pool[0]
    for (const k of pool) if (k.used < best.used) best = k
    return best
  }
  remaining() {
    return this.keys.reduce((n, k) => {
      if (k.state === 'invalid') return n
      return n + Math.max(0, UNITS_PER_KEY - k.used)
    }, 0)
  }
  total() {
    return this.keys.filter(k => k.state !== 'invalid').length * UNITS_PER_KEY
  }
  charge(keyId, units) {
    const k = this.keys.find(x => x.id === keyId)
    if (!k) return
    k.used += units
    if (k.used >= UNITS_PER_KEY) k.state = 'exhausted'
  }
  markExhausted(keyId, reason) {
    const k = this.keys.find(x => x.id === keyId)
    if (!k) return
    k.state = 'exhausted'; k.used = UNITS_PER_KEY; k.lastError = reason || 'Out of units'
  }
  markInvalid(keyId, msg, status) {
    const k = this.keys.find(x => x.id === keyId)
    if (!k) return
    k.state = 'invalid'; k.lastError = msg
    if (status) k.lastStatus = status
  }
  markRateLimited(keyId, ms = 45000) {
    const k = this.keys.find(x => x.id === keyId)
    if (!k) return
    k.state = 'cooling'; k.cooldownUntil = Date.now() + ms; k.lastError = 'Rate limited, cooling down'
  }
  markVerified(keyId) {
    const k = this.keys.find(x => x.id === keyId)
    if (!k) return
    k.verified = true; k.state = 'ready'; k.lastError = undefined; k.lastStatus = undefined
  }
  add(value) {
    const v = value.trim()
    if (!v) return null
    if (this.keys.some(k => k.value === v)) return null
    const k = makeKey(v, this.keys.length)
    this.keys.push(k); return k
  }
  remove(id) { this.keys = this.keys.filter(k => k.id !== id) }
  reset(id) {
    const k = this.keys.find(x => x.id === id)
    if (!k) return
    k.state = 'unverified'; k.used = 0; k.cooldownUntil = undefined; k.lastError = undefined; k.lastStatus = undefined; k.verified = false
  }
}

// ---- Tests ----

describe('keypool', () => {
  let pool

  beforeEach(() => {
    pool = new KeyPool([
      { ...makeKey('key_a', 0), state: 'ready', used: 10 },
      { ...makeKey('key_b', 1), state: 'ready', used: 50 },
      { ...makeKey('key_c', 2), state: 'ready', used: 0 },
    ])
  })

  describe('classifyFailure', () => {
    it('classifies CreditInsufficiency as exhausted', () => {
      assert.equal(classifyFailure(400, 'CreditInsufficiency'), 'exhausted')
    })
    it('classifies 401 as invalid', () => {
      assert.equal(classifyFailure(401), 'invalid')
      assert.equal(classifyFailure(401, 'InvalidApiKey'), 'invalid')
      assert.equal(classifyFailure(401, 'InvalidAccessToken'), 'invalid')
    })
    it('classifies 429 as ratelimit', () => {
      assert.equal(classifyFailure(429), 'ratelimit')
    })
    it('classifies 500/400 as other', () => {
      assert.equal(classifyFailure(500), 'other')
      assert.equal(classifyFailure(400), 'other')
    })
  })

  describe('KeyPool', () => {
    it('next() picks least used ready key', () => {
      const k = pool.next()
      assert.equal(k.used, 0) // key_c has used=0, the lowest
    })

    it('returns null when no keys are ready', () => {
      pool.keys.forEach(k => k.state = 'exhausted')
      assert.equal(pool.next(), null)
    })

    it('promotes cooling keys back to ready after cooldown', () => {
      pool.keys[0].state = 'cooling'
      pool.keys[0].cooldownUntil = Date.now() - 1000
      const k = pool.next()
      assert.equal(k.state, 'ready')
    })

    it('keeps cooling keys in cooldown if not expired', () => {
      pool.keys[0].state = 'cooling'
      pool.keys[0].cooldownUntil = Date.now() + 60000
      pool.keys[1].state = 'ready'
      pool.keys[2].state = 'ready'
      const k = pool.next()
      assert.notEqual(k?.id, pool.keys[0].id)
    })

    it('charges units and marks exhausted', () => {
      pool.charge(pool.keys[0].id, 990)
      assert.equal(pool.keys[0].state, 'exhausted')
      assert.equal(pool.keys[0].used, 1000)
    })

    it('marks key exhausted explicitly', () => {
      pool.markExhausted(pool.keys[0].id, 'out of units')
      assert.equal(pool.keys[0].state, 'exhausted')
      assert.equal(pool.keys[0].used, UNITS_PER_KEY)
    })

    it('marks key invalid on 401', () => {
      pool.markInvalid(pool.keys[0].id, 'bad key', 401)
      assert.equal(pool.keys[0].state, 'invalid')
      assert.equal(pool.keys[0].lastStatus, 401)
    })

    it('marks key cooling on rate limit', () => {
      pool.markRateLimited(pool.keys[0].id, 30000)
      assert.equal(pool.keys[0].state, 'cooling')
      assert.ok(pool.keys[0].cooldownUntil && pool.keys[0].cooldownUntil > Date.now())
    })

    it('remaining counts only non-invalid keys', () => {
      pool.markInvalid(pool.keys[0].id, 'bad')
      // key_b: used=50, key_c: used=0 => 950 + 1000 = 1950
      assert.equal(pool.remaining(), 1950)
    })

    it('add rejects duplicates', () => {
      const r = pool.add('key_a')
      assert.equal(r, null)
    })

    it('add accepts new keys', () => {
      const r = pool.add('key_new')
      assert.ok(r)
      assert.equal(pool.keys.length, 4)
    })

    it('remove drops a key', () => {
      pool.remove(pool.keys[0].id)
      assert.equal(pool.keys.length, 2)
    })

    it('reset puts key back to unverified', () => {
      pool.markExhausted(pool.keys[0].id)
      pool.reset(pool.keys[0].id)
      assert.equal(pool.keys[0].state, 'unverified')
      assert.equal(pool.keys[0].used, 0)
    })

    it('next() skips invalid keys', () => {
      pool.markInvalid(pool.keys[0].id, 'bad')
      pool.markInvalid(pool.keys[1].id, 'bad')
      const k = pool.next()
      assert.equal(k?.id, pool.keys[2].id)
    })

    it('rotates keys after exhaustion (failover)', () => {
      // key_c has used=0, so it's picked first
      const k1 = pool.next()
      assert.ok(k1)
      pool.markExhausted(k1.id)

      // After k1 (key_c) is exhausted, next least-used ready is key_a (used=10)
      const k2 = pool.next()
      assert.ok(k2)
      assert.notEqual(k2.id, k1.id)
      // key_a (used=10) is less than key_b (used=50)
      assert.equal(k2.used, 10)
    })

    it('total() excludes invalid keys', () => {
      pool.markInvalid(pool.keys[0].id, 'bad')
      assert.equal(pool.total(), 2000) // 2 valid keys
    })
  })
})
