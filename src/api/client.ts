/**
 * YouCam API client — zero-backend, multi-key, with diagnostics.
 *
 * YouCam serves `access-control-allow-origin: *` on both the API and the S3
 * pre-signed upload host, so the browser calls them directly. No proxy, no
 * Lambda, no server to pay for — your API key never travels anywhere except
 * to yce-api-01.makeupar.com.
 *
 * Per PRD §4: every request/response is published to the Diagnostics Bus
 * BEFORE error classification, so raw data is never lost to a "friendly error".
 * Per PRD §5/#11: key rotation on exhausted/invalid/ratelimit; same key
 * for polling (a running task is tied to the key that created it).
 */
import { KeyPool, classifyFailure, type PoolKey } from './keypool'
import { diagnosticsBus, truncateBody } from '../lib/diagnostics'

export const API_HOST = 'https://yce-api-01.makeupar.com'

/**
 * Lightweight, no-cost key check: registers a dummy file metadata record.
 * The File API returns a presigned URL without charging units or requiring
 * the actual S3 PUT, so this is a safe way to confirm a key is valid.
 */
export async function verifyKey(key: string): Promise<{
  ok: boolean
  state: 'ready' | 'invalid' | 'exhausted'
  reason?: string
}> {
  let res: Response
  try {
    res = await fetch(`${API_HOST}/s2s/v2.0/file`, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${key}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        files: [{ content_type: 'image/jpeg', file_name: 'verify.jpg', file_size: 1000 }],
      }),
    })
  } catch (e: any) {
    return { ok: false, state: 'invalid', reason: e?.message || 'Network error' }
  }
  const text = await res.text()
  let json: any = {}
  try { json = JSON.parse(text) } catch { /* non-JSON */ }
  if (res.ok) return { ok: true, state: 'ready' }

  const code = json?.error_code || json?.code
  if (res.status === 401 || code === 'InvalidApiKey' || code === 'InvalidAccessToken') {
    return { ok: false, state: 'invalid', reason: json?.error || 'Invalid API key' }
  }
  if (code === 'CreditInsufficiency') {
    return { ok: false, state: 'exhausted', reason: json?.error || 'Out of units' }
  }
  return { ok: false, state: 'invalid', reason: json?.error || `HTTP ${res.status}` }
}

export function apiBase(): string {
  return API_HOST
}

export class YCError extends Error {
  code: string
  status: number
  constructor(message: string, code = 'unknown', status = 0) {
    super(message)
    this.name = 'YCError'
    this.code = code
    this.status = status
  }
}

export const ERROR_COPY: Record<string, string> = {
  InvalidParameters: 'The request was rejected. Try a different photo.',
  CreditInsufficiency: 'That key is out of units. Add another key in Settings.',
  BadRequest: 'Unexpected request parameter.',
  InvalidStyleGroup: 'That style group is unavailable.',
  InvalidStyle: 'That style is unavailable.',
  InvalidApiKey: 'This API key is not recognised.',
  InvalidAccessToken: 'Invalid API key.',
  InvalidTaskId: 'The task expired before it finished. Please retry.',
  error_below_min_image_size: 'Photo is too small. Use at least 480px on the short side.',
  error_face_position_invalid: 'Face must be fully visible, forward-facing and centred.',
  error_face_position_too_small: 'Move closer — your face is too small in frame.',
  error_face_position_out_of_boundary: 'Your face is cut off. Fit your whole head in the photo.',
  error_face_not_forward_facing: 'Look straight at the camera.',
  error_face_angle_upward: 'Chin down slightly — you are angled too far up.',
  error_face_angle_downward: 'Chin up slightly — you are angled too far down.',
  error_face_angle_leftward: 'Rotate your head slightly right.',
  error_face_angle_rightward: 'Rotate your head slightly left.',
  error_face_angle_left_tilt: 'Tilt your head slightly right.',
  error_face_angle_right_tilt: 'Tilt your head slightly left.',
  exceed_max_filesize: 'Image too large. Long side must be under 4096px.',
  error_pose: 'Could not detect a body pose. Use a straight-on standing photo.',
  error_invalid_ref: 'The reference image is unusable. Try a clean product shot.',
  error_apply_region_mismatch: 'The garment does not match the selected body region.',
  error_invalid_src: 'Your photo needs to show your upper body.',
  invalid_parameter: 'Invalid parameter for this image.',
  error_download_image: 'The server could not download the image.',
  error_decode_image: 'That image could not be decoded. Try a JPG.',
  error_nsfw_content_detected: 'This image was flagged by the content filter.',
  error_src_face_too_small: 'Your face is too small in the photo. Crop in so the face fills most of the frame.',
  error_src_face_out_of_bound: 'Part of your face is outside the frame. Fit your whole head in the photo.',
  error_exceed_max_image_size: 'Image is too large for this tool. Try a smaller photo.',
  error_no_face_detected: 'No face detected. Use a clear, front-facing photo.',
  error_multiple_faces: 'More than one face detected. Use a solo photo.',
}

export function friendlyError(code?: string, fallback?: string): string {
  if (code && ERROR_COPY[code]) return ERROR_COPY[code]
  return fallback || 'Something went wrong. Please try again.'
}

/* ---------------- rate limiting: ~5 QPS advised (250 req / 300s) ---------- */
class RateLimiter {
  private queue: Array<() => void> = []
  private times: number[] = []
  private readonly maxPerWindow = 220
  private readonly windowMs = 300_000
  private readonly minGapMs = 260
  private last = 0
  private pumping = false

  async acquire(): Promise<void> {
    return new Promise((resolve) => {
      this.queue.push(resolve)
      this.pump()
    })
  }

  private pump() {
    if (this.pumping) return
    this.pumping = true
    const step = () => {
      if (!this.queue.length) {
        this.pumping = false
        return
      }
      const now = Date.now()
      this.times = this.times.filter((t) => now - t < this.windowMs)
      const gap = now - this.last
      if (this.times.length >= this.maxPerWindow) {
        setTimeout(step, this.windowMs - (now - this.times[0]) + 50)
        return
      }
      if (gap < this.minGapMs) {
        setTimeout(step, this.minGapMs - gap)
        return
      }
      this.last = now
      this.times.push(now)
      this.queue.shift()?.()
      setTimeout(step, 0)
    }
    step()
  }
}
export const limiter = new RateLimiter()

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms))

type HttpMethod = 'GET' | 'POST' | 'PUT' | 'OPTIONS'

/* ------------------------------------------------------------------ */
/* Request with key rotation + diagnostics                              */
/* ------------------------------------------------------------------ */

export interface Ctx {
  pool: KeyPool
  /** called when pool state changes so the UI can persist/re-render */
  onPoolChange?: () => void
}

/**
 * Performs a request, publishing every raw attempt to the Diagnostics Bus
 * BEFORE classification. Rotates through the key pool on:
 *   - 401 (invalid) / InvalidApiKey / InvalidAccessToken
 *   - CreditInsufficiency (exhausted)
 *   - 429 (cooldown)
 * Retries the SAME key on 5xx with backoff.
 */
export async function request<T = any>(
  path: string,
  init: RequestInit,
  ctx: Ctx,
  opts: { retries?: number; pinKey?: PoolKey } = {},
): Promise<{ data: T; key: PoolKey }> {
  const retries = opts.retries ?? 3
  let attempt = 0
  let lastErr: YCError | null = null
  const triedKeys = new Set<string>()

  while (attempt <= retries) {
    const key = opts.pinKey ?? ctx.pool.next()
    if (!key) {
      throw (
        lastErr ||
        new YCError(
          ctx.pool.keys.length
            ? 'All API keys are exhausted or invalid. Add another in Settings.'
            : 'No API key added yet. Add one in Settings.',
          'no_key',
          0,
        )
      )
    }
    triedKeys.add(key.id)

    await limiter.acquire()

    const url = `${apiBase()}${path}`
    const bodyStr = init.body ? (typeof init.body === 'string' ? init.body : JSON.stringify(init.body)) : null
    const keyDisplay = key.value.length <= 10
      ? key.value.slice(0, 2) + '••••'
      : `${key.value.slice(0, 4)}••••${key.value.slice(-4)}`

    const t0 = Date.now()
    let res: Response
    let text = ''
    let networkError: string | null = null

    try {
      res = await fetch(url, {
        ...init,
        headers: {
          Authorization: `Bearer ${key.value}`,
          'Content-Type': 'application/json',
          ...(init.headers || {}),
        },
      })
      text = await res.text()
    } catch (e: any) {
      networkError = e?.message || 'Network error'
      // publish the raw network error to diagnostics BEFORE classification
      diagnosticsBus.publish({
        keyDisplay,
        method: (init.method || 'GET') as HttpMethod,
        url,
        requestBody: truncateBody(bodyStr ?? null),
        status: 0,
        headers: {},
        responseBody: '',
        durationMs: Date.now() - t0,
        error: networkError,
      })
      lastErr = new YCError(networkError, 'network', 0)
      await sleep(Math.min(2 ** attempt * 800, 6000))
      attempt++
      continue
    }

    // parse JSON body
    let json: any = {}
    try {
      json = text ? JSON.parse(text) : {}
    } catch {
      json = { raw: text }
    }

    // Publish RAW event to diagnostics bus — before ANY classification.
    // This is the core of PRD §1: "Never again show 'it failed' with no reason."
    diagnosticsBus.publish({
      keyDisplay,
      method: (init.method || 'GET') as HttpMethod,
      url,
      requestBody: truncateBody(bodyStr ?? null),
      status: res.status,
      headers: Object.fromEntries(res.headers.entries()),
      responseBody: truncateBody(text),
      durationMs: Date.now() - t0,
      error: null,
    })

    if (res.ok) {
      ctx.pool.markVerified(key.id)
      ctx.onPoolChange?.()
      return { data: json as T, key }
    }

    const code = json?.error_code || json?.code
    const kind = classifyFailure(res.status, code)

    if (kind === 'exhausted') {
      ctx.pool.markExhausted(key.id, truncateBody(text, 300))
      ctx.onPoolChange?.()
      lastErr = new YCError(friendlyError(code, json?.error), code || 'exhausted', res.status)
      attempt++
      continue // try the next key immediately
    }
    if (kind === 'invalid') {
      const reason = res.status === 401 && json?.error
        ? `401 task endpoint (auth-only) — ${truncateBody(text, 200)}`
        : `Invalid key — ${truncateBody(text, 200)}`
      ctx.pool.markInvalid(key.id, reason, res.status)
      ctx.onPoolChange?.()
      lastErr = new YCError(friendlyError(code, json?.error), code || 'invalid', res.status)
      attempt++
      continue
    }
    if (kind === 'ratelimit') {
      ctx.pool.markRateLimited(key.id)
      ctx.onPoolChange?.()
      lastErr = new YCError('Rate limited.', 'rate_limit', 429)
      if (ctx.pool.keys.filter((k) => k.state === 'ready' || k.state === 'unverified').length === 0) {
        await sleep(Math.min(2 ** attempt * 1500, 15_000))
      }
      attempt++
      continue
    }
    if (res.status >= 500) {
      await sleep(Math.min(2 ** attempt * 900, 8000))
      attempt++
      continue
    }

    // Genuine request-level failure (bad photo, invalid params) — do not rotate.
    throw new YCError(friendlyError(code, json?.error), code || 'http_error', res.status)
  }

  throw lastErr || new YCError('Request failed after retries.', 'exhausted_retries', 0)
}

/* ------------------------------------------------------------------ */
/* File API: register metadata, then PUT bytes (step 2 is MANDATORY)   */
/* ------------------------------------------------------------------ */

export interface UploadedFile {
  fileId: string
  contentType: string
  fileName: string
}

export async function uploadFile(blob: Blob, ctx: Ctx, nameHint = 'photo'): Promise<UploadedFile> {
  const contentType = blob.type && blob.type.startsWith('image/') ? blob.type : 'image/jpeg'
  const ext = contentType.includes('png') ? 'png' : 'jpg'
  const fileName = `${nameHint}_${Date.now()}.${ext}`

  const { data: meta } = await request<any>(
    '/s2s/v2.0/file',
    {
      method: 'POST',
      body: JSON.stringify({
        files: [{ content_type: contentType, file_name: fileName, file_size: blob.size }],
      }),
    },
    ctx,
  )

  const entry = meta?.data?.files?.[0]
  if (!entry) throw new YCError('File API returned no upload target.', 'file_api', 0)

  const fileId: string = entry.file_id
  const req = entry.requests?.[0]
  if (!req?.url) throw new YCError('File API returned no pre-signed URL.', 'file_api', 0)

  // MANDATORY: without this PUT the task call returns 500/404.
  // S3 PUT does not use the key pool or diagnostics (different host).
  const putRes = await fetch(req.url, {
    method: 'PUT',
    headers: { 'Content-Type': contentType },
    body: blob,
  })
  if (!putRes.ok) {
    throw new YCError(`Upload to storage failed (${putRes.status}).`, 'upload_failed', putRes.status)
  }

  return { fileId, contentType, fileName }
}

/* ------------------------------------------------------------------ */
/* Tasks                                                               */
/* ------------------------------------------------------------------ */

export interface PollOptions {
  intervalMs?: number
  timeoutMs?: number
  onTick?: (elapsedMs: number) => void
  signal?: AbortSignal
}

export async function runTask(
  taskPath: string,
  body: Record<string, any>,
  ctx: Ctx,
): Promise<{ taskId: string; key: PoolKey }> {
  const { data, key } = await request<any>(
    `/s2s/v2.0/task/${taskPath}`,
    { method: 'POST', body: JSON.stringify(body) },
    ctx,
  )
  const id = data?.data?.task_id
  if (!id) throw new YCError('Task did not return a task_id.', 'no_task_id', 0)
  return { taskId: id, key }
}

export async function pollTask<T = any>(
  taskPath: string,
  taskId: string,
  ctx: Ctx,
  key: PoolKey,
  opts: PollOptions = {},
): Promise<T> {
  const interval = opts.intervalMs ?? 2000
  const timeout = opts.timeoutMs ?? 240_000
  const started = Date.now()

  // Docs: never abandon a running task or it can expire as InvalidTaskId
  // while units are still charged. Poll the SAME key that created it.
  while (true) {
    if (opts.signal?.aborted) throw new YCError('Cancelled.', 'aborted', 0)
    const elapsed = Date.now() - started
    if (elapsed > timeout) throw new YCError('Task timed out.', 'timeout', 0)
    opts.onTick?.(elapsed)

    const { data: res } = await request<any>(
      `/s2s/v2.0/task/${taskPath}/${encodeURIComponent(taskId)}`,
      { method: 'GET' },
      ctx,
      { pinKey: key },
    )
    const d = res?.data || {}
    const status = d.task_status || d.status

    if (status === 'success') return d as T
    if (status === 'error') {
      // Engine errors arrive as data.error (a bare code string like
      // "error_src_face_too_small"), NOT as data.error_code.
      const raw = d.error_code || d.error?.error_code || d.error
      const code = typeof raw === 'string' ? raw : undefined
      const detail = d.error_message || (typeof d.error === 'string' ? d.error : undefined)
      throw new YCError(friendlyError(code, detail || 'The AI task failed.'), code || 'task_error', 0)
    }
    await sleep(interval)
  }
}

export async function execute<T = any>(
  taskPath: string,
  body: Record<string, any>,
  ctx: Ctx,
  opts: PollOptions = {},
): Promise<{ data: T; key: PoolKey }> {
  const { taskId, key } = await runTask(taskPath, body, ctx)
  const data = await pollTask<T>(taskPath, taskId, ctx, key, opts)
  return { data, key }
}

/* ------------------------------------------------------------------ */
/* Templates: GET /s2s/v2.0/task/template/{feature}                    */
/* ------------------------------------------------------------------ */

export interface Template {
  id: string
  name?: string
  thumbnail?: string
  raw?: any
}

export async function listTemplates(
  featurePath: string,
  ctx: Ctx,
  pageSize = 20,
  startingToken?: string,
): Promise<{ items: Template[]; nextToken?: string }> {
  const qs = new URLSearchParams({ page_size: String(Math.min(20, pageSize)) })
  if (startingToken) qs.set('starting_token', startingToken)

  const { data } = await request<any>(
    `/s2s/v2.0/task/template/${featurePath}?${qs}`,
    { method: 'GET' },
    ctx,
  )

  const d = data?.data ?? data
  const rawList = d?.results ?? d?.templates ?? d?.items ?? []
  const items: Template[] = (Array.isArray(rawList) ? rawList : []).map((t: any) => ({
    id: t.template_id ?? t.id ?? t.style_id ?? String(t),
    name: t.name ?? t.title ?? t.label,
    thumbnail: t.thumbnail ?? t.thumbnail_url ?? t.preview ?? t.image_url,
    raw: t,
  }))
  return { items, nextToken: d?.next_token }
}

/* ---------------- result helpers ---------------- */

/**
 * Result shapes differ per endpoint. Verified live on 2026-08-17:
 *
 *   aging      -> data.results.output[] = [{ res_age, url }, ...]
 *   hair-color -> data.results = { url }
 *   enhance    -> data.results = { url }
 *   skin-anal. -> data.results.output[] = [{ type, ui_score, mask_urls }]
 *
 * The `.output` array was the shape that silently broke every image feature:
 * the old parser only looked at results.url / results[] / results.dst.
 */
function collectUrls(node: any, out: string[], depth = 0) {
  if (!node || depth > 4) return
  if (typeof node === 'string') {
    if (/^https?:\/\//.test(node)) out.push(node)
    return
  }
  if (Array.isArray(node)) {
    node.forEach((n) => collectUrls(n, out, depth + 1))
    return
  }
  if (typeof node === 'object') {
    if (typeof node.url === 'string' && node.url) out.push(node.url)
    if (Array.isArray(node.urls)) node.urls.forEach((u: any) => collectUrls(u, out, depth + 1))
    for (const k of ['output', 'dst', 'results', 'result', 'images', 'data']) {
      if (node[k] !== undefined) collectUrls(node[k], out, depth + 1)
    }
  }
}

export function resultUrls(data: any): string[] {
  const out: string[] = []
  const r = data?.results ?? data?.result ?? data
  collectUrls(r, out)
  if (data?.dst) collectUrls(data.dst, out)
  return Array.from(new Set(out.filter(Boolean)))
}

export function resultUrl(data: any): string | null {
  return resultUrls(data)[0] ?? null
}

/** Aging returns a labelled age per frame; keep them for captions. */
export function resultAges(data: any): number[] {
  const out = data?.results?.output
  if (!Array.isArray(out)) return []
  return out
    .map((o: any) => (typeof o?.res_age === 'number' ? o.res_age : NaN))
    .filter((n: number) => !isNaN(n))
}

export function chainId(data: any): string | null {
  const r = data?.results ?? data?.result
  return r?.dst_id || data?.dst_id || (Array.isArray(r) ? r[0]?.dst_id : null) || null
}
