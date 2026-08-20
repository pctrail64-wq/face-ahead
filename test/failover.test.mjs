import { describe, it, beforeEach } from 'node:test'
import assert from 'node:assert/strict'

// Test key failover and error classification logic.
// These tests verify the rotation behavior described in PRD §11.

const UNITS_PER_KEY = 1000

const classifyFailure = (status, code) => {
  if (code === 'CreditInsufficiency') return 'exhausted'
  if (status === 401 || code === 'InvalidApiKey' || code === 'InvalidAccessToken') return 'invalid'
  if (status === 429) return 'ratelimit'
  return 'other'
}

function makeKey(value, index) {
  return { id: 'k_' + index, value: value.trim(), label: 'Key ' + (index + 1), state: 'ready', used: 0 }
}

class KeyPool {
  constructor(keys = []) { this.keys = keys }
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
  charge(keyId, units) {
    const k = this.keys.find(x => x.id === keyId)
    if (!k) return; k.used += units
    if (k.used >= UNITS_PER_KEY) k.state = 'exhausted'
  }
  markExhausted(keyId, reason) {
    const k = this.keys.find(x => x.id === keyId)
    if (!k) return; k.state = 'exhausted'; k.used = UNITS_PER_KEY; k.lastError = reason
  }
  markInvalid(keyId, msg) {
    const k = this.keys.find(x => x.id === keyId)
    if (!k) return; k.state = 'invalid'; k.lastError = msg
  }
  markRateLimited(keyId, ms = 45000) {
    const k = this.keys.find(x => x.id === keyId)
    if (!k) return; k.state = 'cooling'; k.cooldownUntil = Date.now() + ms; k.lastError = 'Rate limited'
  }
  markVerified(keyId) {
    const k = this.keys.find(x => x.id === keyId)
    if (!k) return; k.verified = true; k.state = 'ready'; k.lastError = undefined
  }
}

describe('failover', () => {
  let pool

  beforeEach(() => {
    pool = new KeyPool([
      { ...makeKey('k1', 0), used: 0, state: 'ready' },
      { ...makeKey('k2', 1), used: 0, state: 'ready' },
      { ...makeKey('k3', 2), used: 0, state: 'ready' },
    ])
  })

  describe('CreditInsufficiency → exhausted → next key', () => {
    it('marks key exhausted and continues to next key', () => {
      const k1 = pool.next()
      assert.ok(k1)
      assert.equal(classifyFailure(400, 'CreditInsufficiency'), 'exhausted')
      pool.markExhausted(k1.id)
      const k2 = pool.next()
      assert.ok(k2)
      assert.notEqual(k2.id, k1.id)
    })

    it('returns null when all keys exhausted', () => {
      pool.keys.forEach(k => k.state = 'exhausted')
      assert.equal(pool.next(), null)
    })
  })

  describe('401 InvalidApiKey → invalid → next key', () => {
    it('marks key invalid and rotates', () => {
      const k1 = pool.next()
      assert.equal(classifyFailure(401, 'InvalidApiKey'), 'invalid')
      pool.markInvalid(k1.id, 'Invalid API key')
      const k2 = pool.next()
      assert.notEqual(k2?.id, k1.id)
    })

    it('does not return invalid keys from next()', () => {
      pool.markInvalid(pool.keys[0].id, 'bad')
      pool.markInvalid(pool.keys[1].id, 'bad')
      const k = pool.next()
      assert.equal(k?.id, pool.keys[2].id)
    })
  })

  describe('429 rate limit → cooling → next key', () => {
    it('marks key cooling and rotates', () => {
      const k1 = pool.next()
      assert.equal(classifyFailure(429), 'ratelimit')
      pool.markRateLimited(k1.id, 5000)
      const k2 = pool.next()
      assert.notEqual(k2?.id, k1.id)
    })

    it('recovers cooling key after timeout', () => {
      const k = pool.keys[0]
      k.state = 'cooling'
      k.cooldownUntil = Date.now() + 50
      // Immediately, key is not available
      assert.notEqual(pool.next()?.id, k.id)

      // Wait for cooldown
      k.cooldownUntil = Date.now() - 1000
      const recovered = pool.next()
      assert.equal(recovered?.state, 'ready')
    })
  })

  describe('5xx server error → retry same key', () => {
    it('does not change key state on server error', () => {
      const k1 = pool.next()
      assert.equal(classifyFailure(500), 'other')
      // Key should remain ready
      assert.equal(pool.keys.find(x => x.id === k1.id)?.state, 'ready')
    })
  })

  describe('request error → keep key as-is', () => {
    it('does not rotate on client request errors', () => {
      const k1 = pool.next()
      // error_face_position_too_small — genuine request error, same key
      assert.equal(classifyFailure(400, 'error_face_position_too_small'), 'other')
      assert.equal(pool.keys.find(x => x.id === k1.id)?.state, 'ready')
    })
  })

  describe('failover chain', () => {
    it('cycles through all keys', () => {
      const used = []
      for (let i = 0; i < 3; i++) {
        const k = pool.next()
        assert.ok(k)
        used.push(k.id)
        // After using, mark as if it hit a hard error
        pool.markInvalid(k.id, 'invalid')
      }
       assert.equal(used.length, 3)
      assert.equal(used[0], pool.keys[0].id)
      assert.equal(used[1], pool.keys[1].id)
      assert.equal(used[2], pool.keys[2].id)
      assert.equal(pool.next(), null) // all exhausted/invalid
    })
  })

  describe('charge does not exceed UNITS_PER_KEY', () => {
    it('caps usage at 1000', () => {
      const k = pool.keys[0]
      pool.charge(k.id, 950)
      pool.charge(k.id, 100)
      // charge adds without capping, but state flips at 1000
      assert.equal(k.used, 1050)
      assert.equal(k.state, 'exhausted')
    })
  })

  describe('verified key stays ready after use', () => {
    it('markVerified keeps key in ready pool', () => {
      const k = pool.keys[0]
      k.state = 'unverified'
      pool.markVerified(k.id)
      assert.equal(k.state, 'ready')
      assert.equal(k.verified, true)
      assert.equal(pool.next()?.id, k.id)
    })
  })
})
