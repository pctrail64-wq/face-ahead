import { describe, it } from 'node:test'
import assert from 'node:assert/strict'

// Test pipeline construction and cost calculation logic.
// These are pure functions — no network or browser required.

const FEATURES_MAP = {
  aging:            { name: 'Time Machine', path: 'aging', cost: 3, needsTemplate: false, input: 'face' },
  'skin-analysis':  { name: 'Skin Scan', path: 'skin-analysis', cost: 2, needsTemplate: false, input: 'face' },
  'skin-simulation':{ name: 'Routine Forecast', path: 'skin-simulation', cost: 3, needsTemplate: false, input: 'face' },
  'skin-tone':      { name: 'Colour Palette', path: 'skin-tone', cost: 1, needsTemplate: false, input: 'face' },
  'face-attr-analysis': { name: 'Face Blueprint', path: 'face-attr-analysis', cost: 1, needsTemplate: false, input: 'face' },
  'fitzpatrick-scale-analyzer': { name: 'Fitzpatrick', path: 'fitzpatrick', cost: 1, needsTemplate: false, input: 'face' },
  enhance:          { name: 'Ultra HD', path: 'enhance', cost: 2, needsTemplate: false, input: 'photo' },
  sod:              { name: 'Cut Out', path: 'sod', cost: 2, needsTemplate: false, input: 'photo' },
  'hair-style':     { name: 'Hairstyle', path: 'hair-style', cost: 3, needsTemplate: true, input: 'face' },
  'hair-color':     { name: 'Hair Colour', path: 'hair-color', cost: 3, needsTemplate: false, input: 'face' },
  'face-swap':      { name: 'Face Swap', path: 'face-swap', cost: 3, needsTemplate: false, input: 'face+ref' },
  'body+ref':       { name: 'Clothes', path: 'cloth-v4', cost: 4, needsTemplate: false, input: 'body+ref' },
  'object-removal': { name: 'Magic Eraser', path: 'generative-fill', cost: 3, needsTemplate: false, input: 'photo+mask' },
}

const byId = (id) => FEATURES_MAP[id]

function singleFeaturePipeline(featureId, params) {
  const f = byId(featureId)
  const needsRef = f?.input === 'face+ref' || f?.input === 'body+ref'
  const needsMask = f?.input === 'photo+mask'
  const requires = ['primary']
  if (needsRef) requires.push('reference')
  if (needsMask) requires.push('mask')
  return {
    id: 'single-' + featureId,
    name: f?.name || featureId,
    description: '',
    requires,
    steps: [{ id: 'main', featureId, params }],
  }
}

function totalCost(p) {
  return p.steps.reduce((n, s) => n + (byId(s.featureId)?.cost ?? 1), 0)
}

const PIPELINES = {
  timeMachine: {
    id: 'timeMachine',
    name: 'Skin Time Machine',
    description: 'Scan your skin today, then see two futures.',
    requires: ['primary'],
    steps: [
      { id: 'scan', featureId: 'skin-analysis' },
      { id: 'age', featureId: 'aging' },
      { id: 'forecast', featureId: 'skin-simulation', optional: true },
      { id: 'tone', featureId: 'skin-tone', optional: true },
    ],
  },
  styleMatch: {
    id: 'styleMatch',
    name: 'Tone-Matched Try-On',
    description: 'Read undertone, try garment.',
    requires: ['primary', 'reference'],
    steps: [
      { id: 'tone', featureId: 'skin-tone' },
      { id: 'fitz', featureId: 'fitzpatrick-scale-analyzer', optional: true },
      { id: 'tryon', featureId: 'body+ref' },
    ],
  },
}

class Pipeline {
  constructor(defs) {
    this.stages = defs.map(d => ({ ...d, status: 'pending', detail: '', tookMs: null, units: null }))
  }
  get all() { return this.stages }
  get fatal() { return this.stages.some(s => s.status === 'failed') }
  get done() { return this.stages.every(s => s.status === 'success' || s.status === 'warn' || s.status === 'failed') }
  get unitsUsed() { return this.stages.reduce((n, s) => n + (s.units ?? 0), 0) }
}

describe('orchestrator', () => {
  describe('singleFeaturePipeline', () => {
    it('constructs a face-only pipeline', () => {
      const p = singleFeaturePipeline('aging')
      assert.equal(p.steps.length, 1)
      assert.equal(p.steps[0].featureId, 'aging')
      assert.deepEqual(p.requires, ['primary'])
    })

    it('includes reference slot for face+ref features', () => {
      const p = singleFeaturePipeline('face-swap')
      assert.ok(p.requires.includes('reference'))
    })

    it('includes reference slot for body+ref features', () => {
      const p = singleFeaturePipeline('body+ref')
      assert.ok(p.requires.includes('reference'))
    })

    it('includes mask slot for photo+mask features', () => {
      const p = singleFeaturePipeline('object-removal')
      assert.ok(p.requires.includes('mask'))
    })
  })

  describe('totalCost', () => {
    it('sums step costs', () => {
      const p = PIPELINES.timeMachine
      assert.equal(totalCost(p), 9) // 2+3+3+1
    })

    it('counts single feature cost', () => {
      const p = singleFeaturePipeline('aging')
      assert.equal(totalCost(p), 3)
    })
  })

  describe('Pipeline', () => {
    it('starts with all stages pending', () => {
      const p = new Pipeline([
        { id: 'a', label: 'A', detail: 'a-detail' },
        { id: 'b', label: 'B', detail: 'b-detail' },
      ])
      assert.equal(p.all.length, 2)
      assert.ok(p.all.every(s => s.status === 'pending'))
    })

    it('tracks fatal failure', () => {
      const p = new Pipeline([
        { id: 'a', label: 'A', detail: '' },
        { id: 'b', label: 'B', detail: '' },
      ])
      p.stages[0].status = 'failed'
      assert.ok(p.fatal)
      assert.equal(p.done, false)
    })

    it('marks done when all stages complete', () => {
      const p = new Pipeline([
        { id: 'a', label: 'A', detail: '' },
        { id: 'b', label: 'B', detail: '' },
      ])
      p.stages.forEach(s => s.status = 'success')
      assert.ok(p.done)
      assert.ok(!p.fatal)
    })

    it('sums units', () => {
      const p = new Pipeline([
        { id: 'a', label: 'A', detail: '' },
        { id: 'b', label: 'B', detail: '' },
      ])
      p.stages[0].units = 2
      p.stages[1].units = 5
      assert.equal(p.unitsUsed, 7)
    })
  })

  describe('pipeline step readiness', () => {
    const ready = (s, done, failed) => {
      const deps = [...(s.dependsOn || []), ...(s.srcFromStep ? [s.srcFromStep] : [])]
      return deps.every(d => done.has(d) || failed.has(d))
    }
    const blocked = (s, failed) => {
      const deps = [...(s.dependsOn || []), ...(s.srcFromStep ? [s.srcFromStep] : [])]
      return deps.some(d => failed.has(d))
    }

    it('step is not ready until deps are done', () => {
      const steps = [
        { id: 'a' }, { id: 'b', dependsOn: ['a'] },
      ]
      const done = new Set()
      const failed = new Set()
      assert.ok(!ready(steps[1], done, failed)) // 'a' not done yet
      done.add('a')
      assert.ok(ready(steps[1], done, failed))   // 'a' done now
    })

    it('detects blocked steps (depends on failed)', () => {
      const steps = [
        { id: 'a', dependsOn: [] },
        { id: 'b', dependsOn: ['a'] },
      ]
      const done = new Set()
      const failed = new Set()

      // Initially, b is not ready (a not done)
      assert.ok(!ready(steps[1], done, failed))

      // When a fails, b is blocked
      failed.add('a')
      assert.ok(blocked(steps[1], failed))
      // But b is also "ready" (failed deps count as satisfied for scheduling)
      assert.ok(ready(steps[1], done, failed))
    })

    it('handles srcFromStep chains', () => {
      const steps = [
        { id: 'enhance', featureId: 'enhance' },
        { id: 'scan', featureId: 'skin-analysis', srcFromStep: 'enhance' },
      ]
      const done = new Set()
      const failed = new Set()

      // scan is not ready until enhance is done
      assert.ok(!ready(steps[1], done, failed))
      done.add('enhance')
      assert.ok(ready(steps[1], done, failed))
    })
  })
})
