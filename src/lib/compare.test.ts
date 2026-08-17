import { describe, expect, it } from 'vitest';
import { buildComparison, trendOf, rankHabits, CONCERN_LABELS } from './compare';
import type { ScanResult } from './youcam';

function scan(scores: Record<string, number>, over = 76): ScanResult {
  return { overall: over, skinAge: 35, tone: '#997152', colors: {}, fitzpatrick: 'IV', scores, masks: {}, tookMs: 1000, provider: 'youcam' };
}

describe('trendOf', () => {
  it('worse below -1.5', () => expect(trendOf(-3)).toBe('worse'));
  it('better above +1.5', () => expect(trendOf(4)).toBe('better'));
  it('same in between and for null', () => {
    expect(trendOf(1)).toBe('same');
    expect(trendOf(null)).toBe('same');
  });
});

describe('buildComparison', () => {
  it('computes deltas and trends', () => {
    const c = buildComparison(
      scan({ wrinkle: 70, pore: 50, moisture: 80 }),
      scan({ wrinkle: 50, pore: 51, moisture: 80 }),
    );
    expect(c.metrics.find((m) => m.key === 'wrinkle')?.delta).toBe(-20);
    expect(c.metrics.find((m) => m.key === 'wrinkle')?.trend).toBe('worse');
    expect(c.metrics.find((m) => m.key === 'pore')?.trend).toBe('same');
    expect(c.metrics.find((m) => m.key === 'moisture')?.trend).toBe('same');
    expect(c.worseCount).toBe(1);
    expect(c.biggestDrop?.key).toBe('wrinkle');
  });
  it('merges keys from both scans', () => {
    const c = buildComparison(scan({ wrinkle: 70 }), scan({ wrinkle: 60, acne: 90 }));
    expect(c.metrics).toHaveLength(2);
  });
  it('labels every concern', () => {
    const c = buildComparison(scan({ wrinkle: 70 }), scan({ wrinkle: 60 }));
    expect(c.metrics[0].label).toBe(CONCERN_LABELS.wrinkle);
  });
});

describe('rankHabits', () => {
  it('ranks habits by coverage of the worst metrics', () => {
    const c = buildComparison(
      scan({ wrinkle: 70, age_spot: 80, firmness: 75, eye_bag: 60, moisture: 80 }),
      scan({ wrinkle: 40, age_spot: 55, firmness: 50, eye_bag: 45, moisture: 70 }),
    );
    const top = rankHabits(c, 3);
    expect(top.length).toBe(3);
    // SPF targets wrinkle/age_spot/firmness → should be #1
    expect(top[0].id).toBe('spf');
  });
  it('limits the count', () => {
    const c = buildComparison(scan({ wrinkle: 70 }), scan({ wrinkle: 40 }));
    expect(rankHabits(c, 2)).toHaveLength(2);
  });
  it('returns habits even without drops (general advice)', () => {
    const c = buildComparison(scan({ wrinkle: 70 }), scan({ wrinkle: 70 }));
    expect(rankHabits(c, 3).length).toBe(3);
  });
});
