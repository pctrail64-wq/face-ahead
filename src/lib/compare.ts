// ---------------------------------------------------------------------------
// FACE AHEAD — comparison engine (pure logic, unit-tested).
// Today vs Future: per-metric deltas, impact ranking, and the evidence-backed
// habit library. ui_score semantics: HIGHER = better skin (fewer signs).
// ---------------------------------------------------------------------------
import type { ScanResult } from './youcam';

export type Trend = 'better' | 'worse' | 'same';

export interface MetricDelta {
  key: string;
  label: string;
  today: number | null;
  future: number | null;
  delta: number | null;
  trend: Trend;
}

export interface ComparisonReport {
  metrics: MetricDelta[];
  /** Count of metrics that measurably worsened with age. */
  worseCount: number;
  /** Biggest single drop (label + points). */
  biggestDrop: MetricDelta | null;
  /** Deltas sorted by drop magnitude (most impactful first). */
  ranked: MetricDelta[];
}

export const CONCERN_LABELS: Record<string, string> = {
  wrinkle: 'Wrinkles', droopy_upper_eyelid: 'Upper eyelids', droopy_lower_eyelid: 'Lower eyelids',
  firmness: 'Firmness', acne: 'Spots', moisture: 'Moisture', eye_bag: 'Eye bags',
  dark_circle_v2: 'Dark circles', age_spot: 'Age spots', radiance: 'Radiance',
  redness: 'Redness', oiliness: 'Oiliness', pore: 'Pores', texture: 'Texture',
};

export function trendOf(delta: number | null): Trend {
  if (delta === null) return 'same';
  if (delta > 1.5) return 'better';
  if (delta < -1.5) return 'worse';
  return 'same';
}

export function buildComparison(today: ScanResult, future: ScanResult): ComparisonReport {
  const keys = Array.from(new Set([...Object.keys(today.scores), ...Object.keys(future.scores)]));
  const metrics: MetricDelta[] = keys.map((key) => {
    const t = today.scores[key] ?? null;
    const f = future.scores[key] ?? null;
    const delta = t !== null && f !== null ? Math.round((f - t) * 10) / 10 : null;
    return { key, label: CONCERN_LABELS[key] ?? key, today: t, future: f, delta, trend: trendOf(delta) };
  });
  const ranked = [...metrics].sort((a, b) => (a.delta ?? 0) - (b.delta ?? 0));
  const worseCount = metrics.filter((m) => m.trend === 'worse').length;
  const biggestDrop = ranked.find((m) => m.trend === 'worse') ?? null;
  return { metrics, worseCount, biggestDrop, ranked };
}

// ---- habit library (evidence-backed, honest citations) ---------------------

export interface Habit {
  id: string;
  emoji: string;
  title: string;
  action: string;
  why: string;
  citation: string;
  /** Which metrics this habit most plausibly protects. */
  targets: string[];
  /** Confidence: strong / moderate / emerging — honest labeling. */
  confidence: 'strong' | 'moderate' | 'emerging';
}

export const HABITS: Habit[] = [
  {
    id: 'spf',
    emoji: '🧴',
    title: 'Daily broad-spectrum SPF 30+',
    action: 'Apply every morning, reapply every 2h outdoors. 1–2 finger-lengths for the face.',
    why: 'Chronic UV exposure is the single largest environmental driver of visible facial aging — wrinkles, pigment, and loss of firmness.',
    citation: 'Flament et al., "Solar exposure(s) and facial clinical signs of aging in Chinese women", Journal of the European Academy of Dermatology (2013).',
    targets: ['wrinkle', 'age_spot', 'firmness', 'radiance', 'texture'],
    confidence: 'strong',
  },
  {
    id: 'sleep',
    emoji: '😴',
    title: '7–9 hours of sleep',
    action: 'Consistent sleep schedule; same bedtime & wake time even on weekends.',
    why: 'Sleep quality correlates with skin barrier function, hydration, and perceived facial aging; poor sleepers show more visible signs.',
    citation: 'Oyetakin-White et al., "Does poor sleep quality affect skin ageing?", Clinical and Experimental Dermatology (2015).',
    targets: ['eye_bag', 'dark_circle_v2', 'moisture', 'radiance', 'firmness'],
    confidence: 'moderate',
  },
  {
    id: 'smoke',
    emoji: '🚭',
    title: 'Avoid smoking (and secondhand smoke)',
    action: 'Smoking accelerates visible facial aging — "smoker\'s face": deeper wrinkles, sallow tone.',
    why: 'Tobacco reduces dermal blood flow and collagen production; the association with facial aging is one of the most replicated in dermatology.',
    citation: 'Yin et al., "Smoking and facial wrinkles", Journal of the American Academy of Dermatology (2006, meta-analysis).',
    targets: ['wrinkle', 'firmness', 'moisture', 'redness', 'texture'],
    confidence: 'strong',
  },
  {
    id: 'retinol',
    emoji: '🔬',
    title: 'A simple retinoid routine (start low, at night)',
    action: 'Over-the-counter retinol 2–3 nights/week, building up; SPF every morning (retinoids increase photosensitivity).',
    why: 'Topical retinoids are the most clinically validated ingredient class for photoaging — smoother texture and fewer fine lines in trials.',
    citation: 'Kang et al., "The role of topical retinoids in photoaging", Dermatologic Therapy (2018, review).',
    targets: ['wrinkle', 'texture', 'age_spot', 'pore', 'firmness'],
    confidence: 'strong',
  },
  {
    id: 'hydration',
    emoji: '💧',
    title: 'Water + antioxidant-rich foods',
    action: 'Adequate water intake and a diet high in fruit & vegetables (vitamin C, polyphenols).',
    why: 'Skin surface hydration responds to intake; antioxidant diets are associated with better skin appearance, though evidence is less direct.',
    citation: 'Palma et al., "Dietary water affects human skin hydration", Clinical, Cosmetic and Investigational Dermatology (2015); Cosgrove et al., "Dietary nutrient intakes and skin-aging appearance", American Journal of Clinical Nutrition (2007).',
    targets: ['moisture', 'radiance', 'texture'],
    confidence: 'moderate',
  },
  {
    id: 'stress',
    emoji: '🧘',
    title: 'Manage stress + gentle cleansing',
    action: 'Daily movement, no harsh scrubbing; double-cleanse at night to remove sunscreen & pollution.',
    why: 'Stress and barrier disruption are linked to inflammatory skin signs; gentle cleansing protects the acid mantle.',
    citation: 'Chen & Lyga, "Brain-skin connection: stress, inflammation and skin aging", Inflammation & Allergy Drug Targets (2014).',
    targets: ['redness', 'acne', 'oiliness', 'firmness'],
    confidence: 'moderate',
  },
];

/** Ranks the habits by how many of YOUR biggest future drops they target. */
export function rankHabits(comparison: ComparisonReport, limit = 3): Habit[] {
  const worstKeys = new Set(comparison.ranked.filter((m) => m.trend === 'worse').slice(0, 5).map((m) => m.key));
  return [...HABITS]
    .map((h) => ({ h, score: h.targets.filter((t) => worstKeys.has(t)).length }))
    .sort((a, b) => b.score - a.score)
    .slice(0, limit)
    .map((x) => x.h);
}

/** Predicted-impact sentence for the share card (honest framing). */
export function impactLine(habit: Habit, delta: MetricDelta): string {
  return `Protecting "${delta.label.toLowerCase()}" (${delta.today?.toFixed(0) ?? '—'} → ${delta.future?.toFixed(0) ?? '—'} today→future) starts with: ${habit.title}.`;
}
