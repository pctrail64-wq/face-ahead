/**
 * Skin concern scoring & recommendation helpers.
 * Consumes the YouCam skin-analysis payload and turns it into a
 * recommendation set the UI can render.
 */
import { CONCERN_META, SIM_KEY_MAP, SD_CONCERNS } from '../api/features'

export type Score = {
  label: string
  score: number
  severity: 'low' | 'medium' | 'high'
  drivers: string
  advice: string
}

export interface SkinReport {
  overall: number
  concerns: Score[]
  fitzpatrick: number
  skinType: string
  topConcern: string
}

export function parseSkinScan(data: any): SkinReport | null {
  const results = data?.results || data?.result || data
  if (!results) return null

  const skin = results.skin_score || results.skin_analysis || results.skin || {}
  const concernMap: Record<string, number> = {}
  for (const c of SD_CONCERNS) {
    const v = skin[c] ?? skin[c?.replace(/_v2$/, '')]
    if (v != null) concernMap[c] = Number(v)
  }

  const concerns: Score[] = []
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

export function buildSimParams(report: SkinReport): Record<string, number> {
  const out: Record<string, number> = {}
  for (const c of report.concerns) {
    if (c.score < 35) {
      out[c.label.toLowerCase().replace(/\s/g, '_')] = Math.round(c.score / 100 * 100) / 100
    }
  }
  return out
}

export function severityColor(score: number): string {
  if (score >= 70) return 'text-red-500'
  if (score >= 40) return 'text-amber-500'
  return 'text-green-500'
}

export function severityBg(score: number): string {
  if (score >= 70) return 'bg-red-500/10'
  if (score >= 40) return 'bg-amber-500/10'
  return 'bg-green-500/10'
}
