// ---------------------------------------------------------------------------
// FACE AHEAD — demo mode. Clearly-labeled GENERATED data so the product demo
// never breaks without a key. Every demo value is tagged provider:'demo'.
// ---------------------------------------------------------------------------
import type { ScanResult } from './youcam';
import type { AgeFrame } from './aging';

export function demoScan(seed = 0): ScanResult {
  const base: Record<string, number> = {
    wrinkle: 70, droopy_upper_eyelid: 72, droopy_lower_eyelid: 74, firmness: 78,
    acne: 95, moisture: 80, eye_bag: 66, dark_circle_v2: 60, age_spot: 90,
    radiance: 81, redness: 88, oiliness: 55, pore: 62, texture: 84,
  };
  const scores: Record<string, number> = {};
  for (const [k, v] of Object.entries(base)) {
    scores[k] = Math.max(5, Math.min(100, v + (seed % 5) * 2 - 4));
  }
  return {
    overall: 76, skinAge: 38, scores,
    masks: {},
    tone: '#997152',
    colors: { SKIN: '#997152', EYE: '#241711', LIP: '#CC7F71', BROW: '#805D47', HAIR: '#B56637' },
    fitzpatrick: 'V', tookMs: 2900, provider: 'demo',
  };
}

/** Demo future scan: aged face scores worse on the age-linked metrics. */
export function demoFutureScan(): ScanResult {
  const scores: Record<string, number> = {
    wrinkle: 48, droopy_upper_eyelid: 55, droopy_lower_eyelid: 58, firmness: 56,
    acne: 92, moisture: 71, eye_bag: 54, dark_circle_v2: 52, age_spot: 68,
    radiance: 69, redness: 80, oiliness: 50, pore: 55, texture: 66,
  };
  return {
    overall: 61, skinAge: 55, scores, masks: {},
    tone: '#997152', colors: {}, fitzpatrick: null, tookMs: 2900, provider: 'demo',
  };
}

export function demoFrames(): AgeFrame[] {
  const ages = [12, 16, 20, 24, 27, 31, 35, 39, 43, 47, 51, 55, 58, 62, 66, 70];
  return ages.map((age) => ({ age, url: '' }));
}
