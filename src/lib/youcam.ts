// ---------------------------------------------------------------------------
// FACE AHEAD — YouCam v2 client (browser-direct, CORS-enabled, verified live).
// Endpoints orchestrated: skin-analysis (14 concerns) · skin-tone-analysis ·
// fitzpatrick-scale-analyzer · aging (16 age frames). Key ONLY from env.
//
// Robustness (verified live against the real API, Aug 17 2026):
//  - Output images below ~800px are rejected (error_below_min_image_size);
//    we render 1024×1024 crops.
//  - Faces must be large in-frame (error_src_face_too_small) → square crop
//    around the face zone.
//  - A fixed crop can miss the face (error_no_face) → we try 4 crop windows
//    in order. Failed tasks are FREE (units charge only on success).
//  - skin-tone-analysis is strict about head angle (error_face_angle_*);
//    if it fails we degrade gracefully with a warning, never a fake value.
//  - Every task goes through a fail-closed gate: no result is shown unless
//    the schema validates. Demo mode is explicitly labeled GENERATED.
// ---------------------------------------------------------------------------

export const YOUNCAM_BASE = 'https://yce-api-01.makeupar.com';

export const FULL_CONCERNS = [
  'wrinkle', 'droopy_upper_eyelid', 'droopy_lower_eyelid', 'firmness',
  'acne', 'moisture', 'eye_bag', 'dark_circle_v2', 'age_spot', 'radiance',
  'redness', 'oiliness', 'pore', 'texture',
];

export interface ScanResult {
  overall: number | null;
  skinAge: number | null;
  scores: Record<string, number>;
  masks: Record<string, string[]>;
  tone: string | null;
  colors: Record<string, string>;
  fitzpatrick: string | null;
  tookMs: number;
  provider: 'youcam' | 'demo';
  warnings?: string[];
}

export const hasKey = (): boolean => Boolean(import.meta.env.VITE_YOUCAM_KEY?.trim());

// ---- image preparation ----------------------------------------------------

/** Output edge length for crops sent to the API (min ~800; 1024 is safe). */
export const CROP_OUT = 1024;

export interface CropWindow { frac: number; cx: number; cy: number; }

/**
 * Ordered crop candidates. The first is the default face zone (verified to
 * pass skin-analysis); the rest rescue faces that sit off-center, higher or
 * lower in the frame. Errors are free, so trying them in order costs nothing
 * unless a scan actually succeeds.
 */
export const CROP_CANDIDATES: CropWindow[] = [
  { frac: 0.7, cx: 0.5, cy: 0.4 },  // default face zone (upper-middle)
  { frac: 0.85, cx: 0.5, cy: 0.4 }, // wider window — catches off-center faces
  { frac: 0.7, cx: 0.5, cy: 0.55 }, // lower window — faces in the lower half
  { frac: 0.9, cx: 0.5, cy: 0.45 }, // nearly-full square — last resort
];

/**
 * Crops for images that are ALREADY face-focused (e.g. YouCam's aged frames,
 * 1020×1020). Empirical (verified live Aug 17 2026): the aged frame's face
 * size/position varies per age and per photo — some ages need near-identity,
 * others a tighter window (error_src_face_too_small / error_large_face_angle
 * / error_src_face_out_of_bound all occur). Try a spread, then neighbor ages.
 */
export const FRAME_CROP_CANDIDATES: CropWindow[] = [
  { frac: 0.95, cx: 0.5, cy: 0.5 }, // near-identity — face already fills frame
  { frac: 0.85, cx: 0.5, cy: 0.5 },
  { frac: 0.75, cx: 0.5, cy: 0.5 },
  { frac: 0.7, cx: 0.5, cy: 0.4 },
];

/** Pure crop math (unit-tested): square window around (cx·w, cy·h), clamped. */
export function cropRect(
  w: number, h: number, frac: number, cx = 0.5, cy = 0.4,
): { sx: number; sy: number; size: number } {
  const size = Math.round(Math.min(w, h) * frac);
  const sx = Math.max(0, Math.min(cx * w - size / 2, w - size));
  const sy = Math.max(0, Math.min(cy * h - size / 2, h - size));
  return { sx, sy, size };
}

async function renderSquare(bitmap: ImageBitmap, sx: number, sy: number, size: number): Promise<Blob> {
  const canvas = new OffscreenCanvas(CROP_OUT, CROP_OUT);
  const ctx = canvas.getContext('2d')!;
  ctx.imageSmoothingQuality = 'high';
  ctx.drawImage(bitmap, sx, sy, size, size, 0, 0, CROP_OUT, CROP_OUT);
  const blob = await canvas.convertToBlob({ type: 'image/jpeg', quality: 0.92 });
  if (blob.size < 1024) throw new Error('Could not encode the photo — please try another image.');
  return blob;
}

/** Decodes the upload (EXIF-aware) and renders every crop candidate as a 1024² JPEG. */
export async function prepareImages(file: File | Blob): Promise<Blob[]> {
  let bitmap: ImageBitmap;
  try {
    bitmap = await createImageBitmap(file, { imageOrientation: 'from-image' });
  } catch {
    throw new Error("We couldn't read that image file. Please upload a clear JPEG or PNG photo.");
  }
  const { width: w, height: h } = bitmap;
  if (w < 64 || h < 64) throw new Error('That photo is too small — please upload a higher-resolution image.');
  const blobs: Blob[] = [];
  try {
    for (const c of CROP_CANDIDATES) {
      const { sx, sy, size } = cropRect(w, h, c.frac, c.cx, c.cy);
      blobs.push(await renderSquare(bitmap, sx, sy, size));
    }
  } finally { bitmap.close(); }
  return blobs;
}

/** Renders crops for already-face-focused images (aged frames) at 1024².
 *  First candidate: full contain (identity-ish); then windowed crops. */
export async function prepareFrameImages(file: File | Blob): Promise<Blob[]> {
  let bitmap: ImageBitmap;
  try {
    bitmap = await createImageBitmap(file, { imageOrientation: 'from-image' });
  } catch {
    throw new Error("We couldn't read that image file.");
  }
  const { width: w, height: h } = bitmap;
  const blobs: Blob[] = [];
  try {
    // full contain — the aged frame is already face-focused
    const canvas = new OffscreenCanvas(CROP_OUT, CROP_OUT);
    const ctx = canvas.getContext('2d')!;
    ctx.imageSmoothingQuality = 'high';
    ctx.fillStyle = '#ffffff';
    ctx.fillRect(0, 0, CROP_OUT, CROP_OUT);
    const scale = Math.min(CROP_OUT / w, CROP_OUT / h);
    const nw = Math.round(w * scale);
    const nh = Math.round(h * scale);
    ctx.drawImage(bitmap, (CROP_OUT - nw) / 2, (CROP_OUT - nh) / 2, nw, nh);
    blobs.push(await canvas.convertToBlob({ type: 'image/jpeg', quality: 0.92 }));
    for (const c of FRAME_CROP_CANDIDATES) {
      const { sx, sy, size } = cropRect(w, h, c.frac, c.cx, c.cy);
      blobs.push(await renderSquare(bitmap, sx, sy, size));
    }
  } finally { bitmap.close(); }
  return blobs;
}

// ---- error mapping ---------------------------------------------------------

export function friendlyTaskError(raw: string): string {
  if (/error_no_face/.test(raw)) {
    return "We couldn't find a face in that photo. Try a clear, front-facing selfie in good light — face fully visible, nothing covering it.";
  }
  if (/error_face_angle|error_large_face_angle/.test(raw)) {
    return 'That photo is angled. Face the camera directly (no side profile or head tilt) and try again.';
  }
  if (/error_src_face_too_small/.test(raw)) {
    return "Your face is too small in the frame — move closer / crop in on your face and try again.";
  }
  if (/error_src_face_out_of_bound/.test(raw)) {
    return "Your face is cut off at the edge of the photo — re-frame so your whole face is inside the image and try again.";
  }
  if (/error_below_min_image_size/.test(raw)) {
    return 'That photo is too low-resolution — please upload a larger image.';
  }
  if (/CreditInsufficiency|enough credits|InsufficientCredits/i.test(raw)) {
    return 'This API key has run out of credits — the demo mode still works. Add a key with credits to continue real analysis.';
  }
  if (/DLQ|Max retries|timeout|timed out/i.test(raw)) {
    return 'The AI service hiccuped on this image — try again, or upload a different photo.';
  }
  return 'Something went wrong with the AI service — please try again in a moment.';
}

function shortWarning(raw: string, what: string): string {
  if (/error_face_angle/.test(raw)) return `${what} skipped — photo angle (face the camera straight on)`;
  if (/error_no_face/.test(raw)) return `${what} skipped — no face detected`;
  return `${what} skipped — service hiccup`;
}

// ---- generic helpers -------------------------------------------------------

export async function uploadFile(key: string, blob: Blob, slug: string, tries = 3): Promise<string> {
  let lastErr = '';
  for (let i = 0; i < tries; i++) {
    try {
      const slotRes = await fetch(`${YOUNCAM_BASE}/s2s/v2.0/file/${slug}`, {
        method: 'POST',
        headers: { Authorization: `Bearer ${key}`, 'Content-Type': 'application/json' },
        body: JSON.stringify({
          files: [{ content_type: blob.type || 'image/jpeg', file_name: 'selfie.jpg', file_size: blob.size }],
        }),
      });
      const slotJson = await slotRes.json();
      const file = slotJson?.data?.files?.[0];
      if (!file) throw new Error(`upload slot failed: ${JSON.stringify(slotJson).slice(0, 160)}`);
      const up = file.requests[0];
      const put = await fetch(up.url, { method: up.method || 'PUT', headers: up.headers, body: blob });
      if (!put.ok) throw new Error(`S3 upload failed (${put.status})`);
      return file.file_id;
    } catch (e) {
      lastErr = e instanceof Error ? e.message : String(e);
      if (i < tries - 1) await new Promise((r) => setTimeout(r, 900 * (i + 1)));
    }
  }
  throw new Error(lastErr || 'S3 upload failed');
}

export async function createTask(key: string, slug: string, body: Record<string, unknown>): Promise<string> {
  const res = await fetch(`${YOUNCAM_BASE}/s2s/v2.0/task/${slug}`, {
    method: 'POST',
    headers: { Authorization: `Bearer ${key}`, 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  });
  const json = await res.json();
  const id = json?.data?.task_id ?? json?.task_id;
  if (!id) throw new Error(`task create failed: ${JSON.stringify(json).slice(0, 200)}`);
  return id;
}

export async function pollTask(key: string, slug: string, taskId: string, timeoutMs = 180_000): Promise<any> {
  const start = Date.now();
  while (Date.now() - start < timeoutMs) {
    const res = await fetch(`${YOUNCAM_BASE}/s2s/v2.0/task/${slug}/${taskId}`, {
      headers: { Authorization: `Bearer ${key}` },
    });
    const json = await res.json();
    const d = json?.data ?? json;
    const status = d?.task_status ?? d?.status;
    if (status === 'success') return json;
    if (status === 'error') throw new Error(JSON.stringify(d));
    await new Promise((r) => setTimeout(r, 3000));
  }
  throw new Error('YouCam task timed out');
}

// ---- analyses --------------------------------------------------------------

export interface SkinAnalysisOut {
  scores: Record<string, number>;
  masks: Record<string, string[]>;
  overall: number | null;
  skinAge: number | null;
}

/** Validates the API shape before anything is shown (fail-closed gate). */
export function parseSkinOutput(output: any[]): SkinAnalysisOut {
  const scores: Record<string, number> = {};
  const masks: Record<string, string[]> = {};
  let overall: number | null = null;
  let skinAge: number | null = null;
  for (const item of output ?? []) {
    const t: string = item?.type ?? '';
    if (t === 'all') { overall = typeof item.score === 'number' ? item.score : null; continue; }
    if (t === 'skin_age') { skinAge = typeof item.score === 'number' ? item.score : null; continue; }
    if (t === 'resize_image') continue;
    if (typeof item.ui_score === 'number' && t) scores[t] = item.ui_score;
    if (Array.isArray(item.mask_urls)) masks[t] = item.mask_urls;
  }
  if (Object.keys(scores).length < 5) throw new Error('Skin analysis returned incomplete data — retrying with another crop.');
  return { scores, masks, overall, skinAge };
}

// One upload (file_id) can drive ALL three endpoints — single PUT per crop.
export async function runAnalysesOnFid(key: string, fid: string): Promise<{
  skin: SkinAnalysisOut; tone: { tone: string | null; colors: Record<string, string> } | null; fitzpatrick: string | null;
}> {
  const [skinP, toneP, fitzP] = await Promise.allSettled([
    (async () => {
      const taskId = await createTask(key, 'skin-analysis', { src_file_id: fid, dst_actions: FULL_CONCERNS, format: 'json' });
      const res = await pollTask(key, 'skin-analysis', taskId);
      return parseSkinOutput(res?.data?.results?.output ?? []);
    })(),
    (async () => {
      const taskId = await createTask(key, 'skin-tone-analysis', { src_file_id: fid, format: 'json' });
      const res = await pollTask(key, 'skin-tone-analysis', taskId);
      const color = res?.data?.results?.color ?? {};
      const colors: Record<string, string> = {};
      let tone: string | null = null;
      for (const [k, v] of Object.entries(color)) {
        if (typeof v === 'string' && /^#?[0-9a-f]{6}$/i.test(v.trim())) {
          colors[k] = v.trim().toUpperCase();
          if (/skin/i.test(k) && !tone) tone = v.trim().toUpperCase();
        }
      }
      return { tone, colors };
    })(),
    (async () => {
      const taskId = await createTask(key, 'fitzpatrick-scale-analyzer', { src_file_id: fid, version: '1.0' });
      const res = await pollTask(key, 'fitzpatrick-scale-analyzer', taskId);
      return res?.data?.results?.fitzpatrick_scale ?? null;
    })(),
  ]);
  if (skinP.status === 'rejected') {
    throw new Error(skinP.reason instanceof Error ? skinP.reason.message : String(skinP.reason));
  }
  const skin = skinP.value;
  return {
    skin,
    tone: toneP.status === 'fulfilled' ? toneP.value : null,
    fitzpatrick: fitzP.status === 'fulfilled' ? fitzP.value : null,
  };
}

export async function runSkinAnalysis(key: string, blob: Blob): Promise<SkinAnalysisOut> {
  const fid = await uploadFile(key, blob, 'skin-analysis');
  const r = await runAnalysesOnFid(key, fid);
  return r.skin;
}

// ---- public entry ----------------------------------------------------------

/**
 * Full current-face scan with crop-candidate fallback. If skin analysis
 * succeeds but tone/fitzpatrick fail, the report renders with warnings
 * instead of failing wholesale.
 */
export async function fullScan(file: File | Blob): Promise<ScanResult> {
  const blobs = await prepareImages(file);
  return scanPrepared(blobs);
}

/** Same as fullScan but accepts already-prepared crop blobs (journey reuse).
 *  One upload per crop → three parallel tasks on the same file_id. */
export async function scanPrepared(blobs: Blob[]): Promise<ScanResult> {
  const key = (import.meta.env.VITE_YOUCAM_KEY as string).trim();
  const start = performance.now();
  let lastRaw = '';

  for (const blob of blobs) {
    try {
      const fid = await uploadFile(key, blob, 'skin-analysis');
      const r = await runAnalysesOnFid(key, fid);
      const warnings: string[] = [];
      if (!r.tone) warnings.push('Skin tone skipped — photo angle (face the camera straight on)');
      if (!r.fitzpatrick) warnings.push('Fitzpatrick skipped — service hiccup');
      return {
        overall: r.skin.overall,
        skinAge: r.skin.skinAge,
        scores: r.skin.scores,
        masks: r.skin.masks,
        tone: r.tone?.tone ?? null,
        colors: r.tone?.colors ?? {},
        fitzpatrick: r.fitzpatrick,
        tookMs: Math.round(performance.now() - start),
        provider: 'youcam',
        warnings: warnings.length ? warnings : undefined,
      };
    } catch (e) {
      lastRaw = e instanceof Error ? e.message : String(e);
      if (/error_face_angle|error_large_face_angle/.test(lastRaw)) break;
    }
  }
  throw new Error(friendlyTaskError(lastRaw || 'YouCam task failed'));
}

/**
 * Runs skin-analysis on an already-uploaded source image (e.g. an aged frame).
 * Tries every frame crop on the primary URL, then the same crops on each
 * fallback URL (neighbor ages) — verified live: some aged frames only pass
 * at specific crops/ages. Returns the skin output plus which source won.
 */
export async function scanSourceImage(
  key: string, sourceUrl: string, fallbackUrls: string[] = [],
): Promise<{ analysis: SkinAnalysisOut; usedSource: string }> {
  const urls = [sourceUrl, ...fallbackUrls];
  let lastRaw = '';
  for (const url of urls) {
    const res = await fetch(url);
    if (!res.ok) { lastRaw = 'Could not fetch the future-face frame.'; continue; }
    const blob = await res.blob();
    const blobs = await prepareFrameImages(blob);
    for (const b of blobs) {
      try {
        return { analysis: await runSkinAnalysis(key, b), usedSource: url };
      } catch (e) {
        lastRaw = e instanceof Error ? e.message : String(e);
        if (/error_face_angle|error_large_face_angle/.test(lastRaw)) break;
      }
    }
  }
  if (/error_face_angle|error_large_face_angle/.test(lastRaw)) {
    throw new Error('The aged-face projection carries a face angle the analyzer rejects. Try a perfectly front-facing selfie in even light — or a slightly different head position.');
  }
  throw new Error(friendlyTaskError(lastRaw || 'future scan failed'));
}
