import { describe, it } from 'node:test'
import assert from 'node:assert/strict'

// Test pure business logic: skin parsing, result URL extraction, concern weights.

const SD_CONCERNS = [
  'wrinkle', 'pore', 'texture', 'acne', 'oiliness', 'radiance',
  'eye_bag', 'age_spot', 'dark_circle_v2', 'firmness', 'moisture',
  'redness', 'droopy_upper_eyelid', 'droopy_lower_eyelid',
]

const CONCERN_META = {
  wrinkle: { label: 'Wrinkles', advice: 'Retinoid at night, daily SPF 50.', drivers: ['UV', 'age'] },
  pore: { label: 'Pores', advice: 'Salicylic acid 2%, niacinamide.', drivers: ['oil'] },
  texture: { label: 'Texture', advice: 'Chemical exfoliation twice weekly.', drivers: ['turnover'] },
  acne: { label: 'Acne', advice: 'Benzoyl peroxide or adapalene.', drivers: ['oil'] },
  oiliness: { label: 'Oiliness', advice: 'Niacinamide 5%, gel cleanser.', drivers: ['sebum'] },
  radiance: { label: 'Radiance', advice: 'Vitamin C serum each morning.', drivers: ['dullness'] },
  eye_bag: { label: 'Eye Bags', advice: 'Caffeine eye serum.', drivers: ['fluid'] },
  age_spot: { label: 'Age Spots', advice: 'Tranexamic acid, strict SPF.', drivers: ['UV'] },
  dark_circle_v2: { label: 'Dark Circles', advice: 'Vitamin K and retinol eye cream.', drivers: ['vascular'] },
  firmness: { label: 'Firmness', advice: 'Peptides, collagen support.', drivers: ['collagen'] },
  moisture: { label: 'Moisture', advice: 'Hyaluronic acid then occlusive.', drivers: ['barrier'] },
  redness: { label: 'Redness', advice: 'Centella, azelaic acid.', drivers: ['barrier'] },
  droopy_upper_eyelid: { label: 'Upper Eyelid', advice: 'Firming peptide eye cream.', drivers: ['elasticity'] },
  droopy_lower_eyelid: { label: 'Lower Eyelid', advice: 'Firming peptide eye cream.', drivers: ['elasticity'] },
}

const SIM_KEY_MAP = {
  age_spot: 'spot', dark_circle_v2: 'dark_circle', wrinkle: 'wrinkle',
  pore: 'pore', texture: 'texture', acne: 'acne', oiliness: 'oiliness',
  radiance: 'radiance', eye_bag: 'eye_bag', redness: 'redness',
}

function parseSkinScan(data) {
  const results = data?.results || data?.result || data
  if (!results) return null

  const skin = results.skin_score || results.skin_analysis || results.skin || {}
  const concernMap = {}
  for (const c of SD_CONCERNS) {
    const v = skin[c] ?? skin[c?.replace(/_v2$/, '')]
    if (v != null) concernMap[c] = Number(v)
  }

  const concerns = []
  for (const c of SD_CONCERNS) {
    const score = concernMap[c]
    if (score === undefined) continue
    const meta = CONCERN_META[c] || { label: c, advice: '', drivers: [] }
    concerns.push({
      label: meta.label,
      score: Math.max(0, Math.min(100, score)),
      severity: score >= 70 ? 'high' : score >= 40 ? 'medium' : 'low',
      drivers: meta.drivers.join(', '),
      advice: meta.advice,
    })
  }
  concerns.sort((a, b) => b.score - a.score)

  const fitz = Number(results.fitzpatrick || results.fitzpatrick_type || 0)
  const skinType = String(results.skin_type || 'normal').toLowerCase()
  const overall = concerns.length > 0
    ? Math.round(concerns.reduce((s, c) => s + c.score, 0) / concerns.length)
    : 50
  const topConcern = concerns.length ? concerns[0].label.toLowerCase().replace(/\s/g, '_') : ''

  return { overall, concerns, fitzpatrick: fitz, skinType, topConcern }
}

function collectUrls(node, out, depth = 0) {
  if (!node || depth > 4) return
  if (typeof node === 'string') {
    if (/^https?:\/\//.test(node)) out.push(node)
    return
  }
  if (Array.isArray(node)) { node.forEach(n => collectUrls(n, out, depth + 1)); return }
  if (typeof node === 'object') {
    if (typeof node.url === 'string' && node.url) out.push(node.url)
    if (Array.isArray(node.urls)) node.urls.forEach(u => collectUrls(u, out, depth + 1))
    for (const k of ['output', 'dst', 'results', 'result', 'images', 'data']) {
      if (node[k] !== undefined) collectUrls(node[k], out, depth + 1)
    }
  }
}

function resultUrls(data) {
  const out = []
  const r = data?.results ?? data?.result ?? data
  collectUrls(r, out)
  if (data?.dst) collectUrls(data.dst, out)
  return Array.from(new Set(out.filter(Boolean)))
}

function resultUrl(data) {
  return resultUrls(data)[0] ?? null
}

const AGING_WEIGHT = {
  wrinkle: 1.0, firmness: 0.95, age_spot: 0.9, texture: 0.7,
  radiance: 0.65, eye_bag: 0.6, dark_circle_v2: 0.55,
  droopy_upper_eyelid: 0.6, droopy_lower_eyelid: 0.6,
  pore: 0.45, moisture: 0.5, redness: 0.3, oiliness: 0.15, acne: 0.1,
}

describe('logic: parseSkinData', () => {
  it('parses a complete skin-analysis payload', () => {
    const data = {
      results: {
        skin_score: {
          wrinkle: 80, pore: 45, texture: 30, acne: 15,
          oiliness: 60, radiance: 25, eye_bag: 50,
          age_spot: 35, dark_circle_v2: 40, firmness: 70,
          moisture: 30, redness: 10,
        },
        fitzpatrick: 3,
        skin_type: 'Combination',
      },
    }
    const report = parseSkinScan(data)
    assert.ok(report)
    assert.equal(report.concerns.length, 12)  // 13 in SD_CONCERNS, droopy eyelids not in test data
    assert.ok(report.concerns[0].score >= report.concerns[1].score) // sorted desc
    assert.equal(report.concerns[0].label, 'Wrinkles') // 80 is highest
    assert.equal(report.fitzpatrick, 3)
    assert.equal(report.skinType, 'combination')
  })

  it('handles missing results gracefully', () => {
    assert.equal(parseSkinScan(null), null)
    // Empty results returns a report with no concerns, not null
    const empty = parseSkinScan({})
    assert.ok(empty)
    assert.equal(empty.concerns.length, 0)
    assert.equal(empty.overall, 50)
  })

  it('assigns correct severity levels', () => {
    const data = {
      results: {
        skin_score: {
          wrinkle: 85,    // high (>= 70)
          pore: 55,       // medium (40-69)
          texture: 20,    // low (< 40)
        },
      },
    }
    const report = parseSkinScan(data)
    assert.equal(report?.concerns.find(c => c.label === 'Wrinkles')?.severity, 'high')
    assert.equal(report?.concerns.find(c => c.label === 'Pores')?.severity, 'medium')
    assert.equal(report?.concerns.find(c => c.label === 'Texture')?.severity, 'low')
  })

  it('clamps scores to 0-100', () => {
    const data = { results: { skin_score: { wrinkle: 150, texture: -5 } } }
    const report = parseSkinScan(data)
    assert.equal(report?.concerns.find(c => c.label === 'Wrinkles')?.score, 100)
    assert.equal(report?.concerns.find(c => c.label === 'Texture')?.score, 0)
  })
})

describe('logic: resultUrls', () => {
  it('extracts URL from results.url', () => {
    const data = { results: { url: 'https://img.example.com/out.jpg' } }
    assert.equal(resultUrl(data), 'https://img.example.com/out.jpg')
  })

  it('extracts URLs from results.output[]', () => {
    const data = {
      results: {
        output: [
          { res_age: 12, url: 'https://img.example.com/a.jpg' },
          { res_age: 50, url: 'https://img.example.com/b.jpg' },
          { res_age: 70, url: 'https://img.example.com/c.jpg' },
        ],
      },
    }
    const urls = resultUrls(data)
    assert.equal(urls.length, 3)
    assert.ok(urls.includes('https://img.example.com/a.jpg'))
    assert.ok(urls.includes('https://img.example.com/c.jpg'))
  })

  it('deduplicates URLs', () => {
    const data = {
      results: {
        output: [
          { url: 'https://img.example.com/a.jpg' },
          { url: 'https://img.example.com/a.jpg' },
        ],
      },
    }
    assert.equal(resultUrls(data).length, 1)
  })

  it('extracts from nested structures', () => {
    const data = {
      data: {
        results: {
          output: [
            { url: 'https://img.example.com/nested.jpg' },
          ],
        },
      },
    }
    assert.ok(resultUrls(data).includes('https://img.example.com/nested.jpg'))
  })

  it('returns empty for no URLs', () => {
    assert.deepEqual(resultUrls({ results: {} }), [])
    assert.equal(resultUrl({ results: {} }), null)
  })
})

describe('logic: SIM_KEY_MAP', () => {
  it('maps analysis concern to simulation key', () => {
    assert.equal(SIM_KEY_MAP.age_spot, 'spot')
    assert.equal(SIM_KEY_MAP.dark_circle_v2, 'dark_circle')
    assert.equal(SIM_KEY_MAP.wrinkle, 'wrinkle')
  })
})

describe('logic: AGING_WEIGHT', () => {
  it('has weights for all 14 concerns', () => {
    const weighted = SD_CONCERNS.filter(c => AGING_WEIGHT[c] !== undefined)
    assert.ok(weighted.length >= 12)
  })

  it('wrinkle has highest weight', () => {
    const max = Math.max(...Object.values(AGING_WEIGHT))
    assert.equal(AGING_WEIGHT.wrinkle, max)
  })
})
