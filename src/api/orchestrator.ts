/**
 * Workflow orchestration (DAG runner).
 *
 * A Pipeline is a DAG of Steps. The runner:
 *   - uploads each distinct source image ONCE (dedup by slot)
 *   - runs independent steps CONCURRENTLY (bounded)
 *   - chains dependent steps via dst_id (no re-upload, no re-charge)
 *   - streams per-step status to the UI
 *   - never lets one failed step kill the whole run
 *
 * Per PRD §6: on task failure, classify the raw error:
 *   - Transient (429/5xx) → retry with backoff, same key
 *   - Auth/scope error → mark key invalid, retry on next verified key
 *   - Genuine request error → surface immediately, don't rotate keys
 * Per PRD §4: all events publish to the Diagnostics Bus via client.ts.
 */
import {
  execute, uploadFile, resultUrl, resultUrls, chainId,
  YCError, friendlyError, type UploadedFile, type Ctx,
} from './client'
import { byId, SIM_KEY_MAP, type Feature } from './features'
import { cropForFaceAnalysis, CROP_LADDER } from '../lib/image'

export type StepState = 'idle' | 'uploading' | 'queued' | 'running' | 'success' | 'error' | 'skipped'

export interface StepResult {
  id: string
  featureId: string
  label: string
  state: StepState
  /** primary output image */
  url?: string
  /** all outputs (aging series) */
  urls?: string[]
  /** score payload for analysis features */
  scores?: any
  /** chainable id for downstream steps */
  dstId?: string
  error?: string
  errorCode?: string
  startedAt?: number
  finishedAt?: number
  elapsedMs?: number
  cost?: number
  /** the runner had to auto-crop the source to get a face detection */
  autoCropped?: boolean
}

export interface Step {
  id: string
  featureId: string
  label?: string
  /** override params sent to the task */
  params?: Record<string, any>
  /** step ids that must succeed first */
  dependsOn?: string[]
  /** take src from a previous step's dst_id instead of the original upload */
  srcFromStep?: string
  /** which uploaded image feeds this step */
  srcSlot?: 'primary' | 'reference'
  /** send the reference image too */
  refSlot?: 'reference'
  /** send a painted grayscale mask (generative-fill) */
  maskSlot?: 'mask'
  /** if this step fails, keep going */
  optional?: boolean
}

export interface Pipeline {
  id: string
  name: string
  description: string
  steps: Step[]
  /** slots the user must supply */
  requires: Array<'primary' | 'reference' | 'mask'>
}

export interface RunContext {
  /** key pool context (replaces the old single apiKey) */
  ctx: Ctx
  images: { primary?: Blob; reference?: Blob; mask?: Blob }
  onUpdate: (results: Record<string, StepResult>) => void
  signal?: AbortSignal
  /** max concurrent in-flight tasks - keep well under the 5 QPS guidance */
  concurrency?: number
  /** template_id per step id, chosen in the UI */
  templates?: Record<string, string>
  /** simulation intensities derived from a prior skin scan */
  simIntensities?: Record<string, number>
  /** called with (keyId, units) whenever a step succeeds */
  onCharge?: (keyId: string, units: number) => void
}

/* ------------------------------------------------------------------ */

const CONCURRENCY_DEFAULT = 3

export async function runPipeline(pipeline: Pipeline, ctx: RunContext): Promise<Record<string, StepResult>> {
  const { ctx: apiCtx, images, onUpdate, signal } = ctx
  const concurrency = ctx.concurrency ?? CONCURRENCY_DEFAULT

  const results: Record<string, StepResult> = {}
  for (const s of pipeline.steps) {
    const f = byId(s.featureId)
    results[s.id] = {
      id: s.id,
      featureId: s.featureId,
      label: s.label || f?.name || s.featureId,
      state: 'idle',
      cost: f?.cost ?? 1,
    }
  }
  const emit = () => onUpdate({ ...results })
  emit()

  /* ---- upload each slot once, reuse the file_id everywhere ---- */
  type Slot = 'primary' | 'reference' | 'mask'
  const uploads: Partial<Record<Slot, UploadedFile>> = {}
  const neededSlots = new Set<Slot>()
  for (const s of pipeline.steps) {
    if (!s.srcFromStep) neededSlots.add(s.srcSlot || 'primary')
    if (s.refSlot) neededSlots.add(s.refSlot)
    if (s.maskSlot) neededSlots.add(s.maskSlot)
  }

  for (const slot of neededSlots) {
    const blob = images[slot]
    if (!blob) continue
    for (const s of pipeline.steps) {
      if ((s.srcSlot || 'primary') === slot && !s.srcFromStep) {
        results[s.id].state = 'uploading'
      }
    }
    emit()
    try {
      uploads[slot] = await uploadFile(blob, apiCtx, slot)
    } catch (e: any) {
      for (const s of pipeline.steps) {
        if ((s.srcSlot || 'primary') === slot || s.refSlot === slot || s.maskSlot === slot) {
          results[s.id].state = 'error'
          results[s.id].error = e?.message || 'Upload failed.'
          results[s.id].errorCode = e?.code
        }
      }
      emit()
      if (slot === 'primary') return results
    }
  }

  for (const s of pipeline.steps) {
    if (results[s.id].state === 'uploading') results[s.id].state = 'queued'
  }
  emit()

  /* ---- topological execution with bounded concurrency ---- */
  const done = new Set<string>()
  const failed = new Set<string>()
  const pending = new Map(pipeline.steps.map((s) => [s.id, s]))
  const inflight = new Set<Promise<void>>()

  const ready = (s: Step) => {
    const deps = [...(s.dependsOn || []), ...(s.srcFromStep ? [s.srcFromStep] : [])]
    return deps.every((d) => done.has(d) || failed.has(d))
  }
  const blocked = (s: Step) => {
    const deps = [...(s.dependsOn || []), ...(s.srcFromStep ? [s.srcFromStep] : [])]
    return deps.some((d) => failed.has(d))
  }

  const runStep = async (s: Step) => {
    const r = results[s.id]
    const feature = byId(s.featureId)
    if (!feature) {
      r.state = 'error'
      r.error = `Unknown feature "${s.featureId}".`
      failed.add(s.id)
      emit()
      return
    }

    if (blocked(s)) {
      r.state = 'skipped'
      r.error = 'Skipped — a previous step failed.'
      failed.add(s.id)
      emit()
      return
    }

    r.state = 'running'
    r.startedAt = Date.now()
    emit()

    try {
      const body: Record<string, any> = { ...(feature.fixed || {}), ...(s.params || {}) }

      // source: chained dst_id, else the uploaded file_id
      if (s.srcFromStep) {
        const upstream = results[s.srcFromStep]
        if (upstream?.dstId) body.src_file_id = upstream.dstId
        else if (upstream?.url) body.src_file_url = upstream.url
        else throw new YCError('Upstream step produced nothing to chain.', 'chain_failed')
      } else {
        const slot = s.srcSlot || 'primary'
        const up = uploads[slot]
        if (!up) throw new YCError(`Missing ${slot} image.`, 'no_image')
        body.src_file_id = up.fileId
      }

      // reference image (try-on garment, makeup source)
      if (s.refSlot) {
        const ref = uploads[s.refSlot]
        if (!ref) throw new YCError('Missing reference image.', 'no_ref')
        if (feature.id === 'face-swap') {
          // face-swap contract: ref_file_ids (plural) + face_mapping.
          // A singular ref_file_id is rejected with InvalidParameters.
          body.ref_file_ids = [ref.fileId]
          body.face_mapping = [{ src_face_index: 0, ref_file_id: ref.fileId, ref_face_index: 0 }]
        } else {
          body.ref_file_id = ref.fileId
        }
      }

      // grayscale mask (generative-fill). Docs: white = remove, black = keep,
      // and it MUST match the source pixel dimensions exactly.
      if (s.maskSlot) {
        const msk = uploads[s.maskSlot]
        if (!msk) throw new YCError('Paint over something to erase first.', 'no_mask')
        body.msk_file_id = msk.fileId
      }

      // template_id chosen in the UI
      if (feature.needsTemplate) {
        const tpl = ctx.templates?.[s.id] || ctx.templates?.[s.featureId]
        if (!tpl) throw new YCError('Pick a style first.', 'no_template')
        body.template_id = tpl
      }

      // skin-simulation takes per-concern intensities 0.0-1.0
      if (feature.id === 'skin-simulation' && ctx.simIntensities) {
        for (const [k, v] of Object.entries(ctx.simIntensities)) {
          const simKey = SIM_KEY_MAP[k] || k
          body[simKey] = v
        }
        const hasAny = Object.keys(ctx.simIntensities).length > 0
        if (!hasAny) body.wrinkle = 0.6
      }

      // default params from the registry
      for (const p of feature.params || []) {
        const key = p.bodyKey || p.key
        if (body[key] === undefined && p.default !== undefined && p.default !== '') {
          body[key] = p.default
        }
      }

      let data: any
      let key: any
      try {
        const res = await execute<any>(feature.path, body, apiCtx, {
          signal, intervalMs: 2000, timeoutMs: 240_000,
        })
        data = res.data; key = res.key
      } catch (err: any) {
        // The single most common real-world failure: the face is a small part
        // of a normal phone photo. Auto-crop tighter and retry once.
        const FRAMING = [
          'error_src_face_too_small', 'error_face_position_too_small',
          'error_src_face_out_of_bound', 'error_face_position_out_of_boundary',
          'error_face_angle_upward', 'error_face_angle_downward',
          'error_face_position_invalid', 'error_face_not_forward_facing',
        ]
        const slot = (s.srcSlot || 'primary') as Slot
        const originalBlob = images[slot]

        if (FRAMING.includes(err?.code) && originalBlob && !s.srcFromStep) {
          let landed = false
          for (let level = 0; level < CROP_LADDER.length; level++) {
            if (signal?.aborted) throw err
            r.state = 'running'
            r.error = `Reframing photo (${level + 1}/${CROP_LADDER.length})…`
            emit()
            try {
              const cropped = await cropForFaceAnalysis(originalBlob, level)
              const reUp = await uploadFile(cropped, apiCtx, `${slot}_c${level}`)
              const res = await execute<any>(
                feature.path, { ...body, src_file_id: reUp.fileId }, apiCtx,
                { signal, intervalMs: 2000, timeoutMs: 240_000 },
              )
              data = res.data; key = res.key
              r.error = undefined
              r.autoCropped = true
              landed = true
              break
            } catch (e2: any) {
              if (!FRAMING.includes(e2?.code)) throw e2
            }
          }
          if (!landed) throw err
        } else {
          throw err
        }
      }
      ctx.onCharge?.(key.id, feature.cost ?? 1)

      const urls = resultUrls(data)
      r.urls = urls
      r.url = resultUrl(data) || urls[0]
      r.dstId = chainId(data) || undefined
      if (feature.returnsScores) r.scores = data?.results ?? data?.result ?? data
      r.state = 'success'
      r.finishedAt = Date.now()
      r.elapsedMs = r.finishedAt - (r.startedAt || r.finishedAt)
      done.add(s.id)
    } catch (e: any) {
      r.state = 'error'
      r.error = e?.message || friendlyError(e?.code)
      r.errorCode = e?.code
      r.finishedAt = Date.now()
      r.elapsedMs = r.finishedAt - (r.startedAt || r.finishedAt)
      failed.add(s.id)
    }
    emit()
  }

  while (pending.size || inflight.size) {
    if (signal?.aborted) break

    let launched = false
    for (const [id, s] of [...pending]) {
      if (inflight.size >= concurrency) break
      if (!ready(s)) continue
      pending.delete(id)
      const p = runStep(s).finally(() => inflight.delete(p))
      inflight.add(p)
      launched = true
    }

    if (inflight.size) {
      await Promise.race(inflight)
    } else if (!launched && pending.size) {
      for (const [id, s] of pending) {
        results[id].state = 'skipped'
        results[id].error = 'Skipped — dependency never completed.'
        failed.add(id)
      }
      pending.clear()
      emit()
    }
  }

  emit()
  return results
}

/* ------------------------------------------------------------------ */
/* Pre-built pipelines                                                 */
/* ------------------------------------------------------------------ */

export const PIPELINES: Record<string, Pipeline> = {
  /** THE HERO FLOW. Chains 4 APIs — this is the hackathon submission. */
  timeMachine: {
    id: 'timeMachine',
    name: 'Skin Time Machine',
    description:
      'Scan your skin today, then see two futures: ageing with no routine, and ageing with one.',
    requires: ['primary'],
    steps: [
      { id: 'scan', featureId: 'skin-analysis', label: 'Skin diagnostic' },
      { id: 'age', featureId: 'aging', label: 'Ageing projection' },
      { id: 'forecast', featureId: 'skin-simulation', label: 'Routine forecast', optional: true },
      { id: 'tone', featureId: 'skin-tone', label: 'Colour palette', optional: true },
    ],
  },

  /** Skin AI + Apparel VTO combined — the third hackathon topic. */
  styleMatch: {
    id: 'styleMatch',
    name: 'Tone-Matched Try-On',
    description:
      'Read your undertone, then try the garment and judge it against your palette.',
    requires: ['primary', 'reference'],
    steps: [
      { id: 'tone', featureId: 'skin-tone', label: 'Undertone read' },
      { id: 'fitz', featureId: 'fitzpatrick', label: 'Fitzpatrick type', optional: true },
      { id: 'tryon', featureId: 'clothes', label: 'Virtual try-on', refSlot: 'reference' },
    ],
  },

  /** Chained demo: enhance -> then analyse the enhanced image. */
  deepScan: {
    id: 'deepScan',
    name: 'Deep Scan',
    description: 'Upscale first, then run the full diagnostic on the clean image.',
    requires: ['primary'],
    steps: [
      { id: 'enhance', featureId: 'enhance', label: 'Ultra HD pass' },
      { id: 'scan', featureId: 'skin-analysis', label: 'Skin diagnostic', srcFromStep: 'enhance' },
      { id: 'face', featureId: 'face-analyzer', label: 'Face blueprint', optional: true },
    ],
  },

  glowUp: {
    id: 'glowUp',
    name: 'Glow Up',
    description: 'Full restyle: hair, teeth and a clean studio portrait.',
    requires: ['primary'],
    steps: [
      { id: 'hair', featureId: 'hairstyle', label: 'New hairstyle', optional: true },
      { id: 'teeth', featureId: 'teeth', label: 'Teeth whitening', optional: true },
      { id: 'portrait', featureId: 'studio', label: 'Studio portrait', optional: true },
    ],
  },
}

/** Wrap a single feature into a one-step pipeline. */
export function singleFeaturePipeline(featureId: string, params?: Record<string, any>): Pipeline {
  const f = byId(featureId)
  const needsRef = f?.input === 'face+ref' || f?.input === 'body+ref'
  const needsMask = f?.input === 'photo+mask'
  const requires: Array<'primary' | 'reference' | 'mask'> = ['primary']
  if (needsRef) requires.push('reference')
  if (needsMask) requires.push('mask')
  return {
    id: `single-${featureId}`,
    name: f?.name || featureId,
    description: f?.blurb || '',
    requires,
    steps: [
      {
        id: 'main',
        featureId,
        params,
        ...(needsRef ? { refSlot: 'reference' as const } : {}),
        ...(needsMask ? { maskSlot: 'mask' as const } : {}),
      },
    ],
  }
}

export function totalCost(p: Pipeline): number {
  return p.steps.reduce((n, s) => n + (byId(s.featureId)?.cost ?? 1), 0)
}
