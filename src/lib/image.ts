/**
 * Image helpers — pure browser, no external libs.
 * Keeps the face-detection crop ladder that orchestrator.ts depends on.
 */

export interface Dimensions { w: number; h: number }

export async function resizeBlob(blob: Blob, maxLong: number, fmt: 'image/jpeg' | 'image/png' = 'image/jpeg'): Promise<Blob> {
  const img = await blobToImage(blob)
  const scale = Math.min(1, maxLong / Math.max(img.width, img.height))
  const canvas = document.createElement('canvas')
  canvas.width = Math.round(img.width * scale)
  canvas.height = Math.round(img.height * scale)
  const ctx = canvas.getContext('2d')!
  ctx.drawImage(img, 0, 0, canvas.width, canvas.height)
  return await new Promise((res) => (canvas as any).convertToBlob({ type: fmt, quality: 0.92 }).then(res))
}

export async function blobToImage(blob: Blob): Promise<HTMLImageElement> {
  const url = URL.createObjectURL(blob)
  const img = new Image()
  img.src = url
  await new Promise<void>((res, rej) => { img.onload = () => res(); img.onerror = () => rej(new Error('decode')) })
  URL.revokeObjectURL(url)
  return img
}

export async function dataURLtoBlob(dataurl: string): Promise<Blob> {
  const parts = dataurl.split(',')
  const mime = parts[0].match(/:(.*?);/)?.[1] || 'image/jpeg'
  const bstr = atob(parts[1])
  let n = bstr.length
  const u8 = new Uint8ClampedArray(n)
  while (n--) u8[n] = bstr.charCodeAt(n)
  return new Blob([u8], { type: mime })
}

export function fileToBlob(file: File): Blob {
  return file
}

export function dimensions(blob: Blob): Promise<Dimensions> {
  return blobToImage(blob).then((img) => ({ w: img.width, h: img.height }))
}

/**
 * YouCam needs a face that fills enough of the frame.
 * Each level enlarges the central crop by a multiplier so the face
 * is progressively "closer" — the YouCam side then succeeds.
 */
export const CROP_LADDER = [
  { scale: 1.0, minFace: 100 },   // original
  { scale: 1.6, minFace: 160 },   // modest zoom
  { scale: 2.2, minFace: 250 },   // medium
  { scale: 3.0, minFace: 380 },   // tight crop
]

/**
 * Produce a tighter central crop of the source. `level` indexes into
 * CROP_LADDER. No face detection here — geometric assumption keeps it
 * dependency-free and seek-safe.
 */
export async function cropForFaceAnalysis(blob: Blob, level: number): Promise<Blob> {
  const img = await blobToImage(blob)
  const cfg = CROP_LADDER[level] || CROP_LADDER[CROP_LADDER.length - 1]
  const srcW = img.width
  const srcH = img.height
  const area = srcW * srcH
  const targetArea = area / (cfg.scale * cfg.scale)
  const ratio = Math.sqrt(targetArea / area)
  const cw = Math.round(srcW * ratio)
  const ch = Math.round(srcH * ratio)
  const sx = Math.round((srcW - cw) / 2)
  const sy = Math.round((srcH - ch) / 2)
  const canvas = document.createElement('canvas')
  canvas.width = cw
  canvas.height = ch
  const ctx = canvas.getContext('2d')!
  ctx.drawImage(img, sx, sy, cw, ch, 0, 0, cw, ch)
  return await new Promise((res) => (canvas as any).convertToBlob({ type: 'image/jpeg', quality: 0.94 }).then(res))
}

export async function urlToBlob(url: string): Promise<Blob> {
  const res = await fetch(url)
  return await res.blob()
}

export function isImageBlob(blob: Blob): boolean {
  return blob.type.startsWith('image/')
}

export async function blobToDataURL(blob: Blob): Promise<string> {
  return new Promise((res) => {
    const r = new FileReader()
    r.onload = () => res(r.result as string)
    r.readAsDataURL(blob)
  })
}
