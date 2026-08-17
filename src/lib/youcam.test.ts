import { describe, expect, it } from 'vitest';
import { CROP_CANDIDATES, CROP_OUT, FRAME_CROP_CANDIDATES, cropRect, friendlyTaskError, parseSkinOutput } from './youcam';

describe('cropRect', () => {
  it('defaults to a 0.7× square centered at (w/2, 0.4h)', () => {
    const r = cropRect(3000, 4000, 0.7);
    expect(r.size).toBe(2100);
    expect(r.sx).toBe(450);
    expect(r.sy).toBe(550);
  });
  it('clamps within the image', () => {
    const r = cropRect(500, 300, 0.9);
    expect(r.sx).toBeGreaterThanOrEqual(0);
    expect(r.sy).toBeGreaterThanOrEqual(0);
    expect(r.sx + r.size).toBeLessThanOrEqual(500);
    expect(r.sy + r.size).toBeLessThanOrEqual(300);
  });
  it('never overflows for any candidate on any size', () => {
    for (const w of [100, 640, 1080, 4000]) {
      for (const h of [100, 800, 2400, 4000]) {
        for (const c of CROP_CANDIDATES) {
          const r = cropRect(w, h, c.frac, c.cx, c.cy);
          expect(r.size).toBeGreaterThan(0);
          expect(r.sx + r.size).toBeLessThanOrEqual(w);
          expect(r.sy + r.size).toBeLessThanOrEqual(h);
        }
      }
    }
  });
});

describe('CROP_CANDIDATES + output size', () => {
  it('starts with the face zone and output ≥800px', () => {
    expect(CROP_CANDIDATES[0]).toEqual({ frac: 0.7, cx: 0.5, cy: 0.4 });
    expect(CROP_OUT).toBeGreaterThanOrEqual(800);
  });
});

describe('FRAME_CROP_CANDIDATES (aged frames are already face-focused)', () => {
  it('uses wide near-identity windows (empirically needed across ages/photos)', () => {
    expect(FRAME_CROP_CANDIDATES[0]).toEqual({ frac: 0.95, cx: 0.5, cy: 0.5 });
    expect(FRAME_CROP_CANDIDATES.length).toBeGreaterThanOrEqual(4);
    for (const c of FRAME_CROP_CANDIDATES) {
      expect(c.frac).toBeGreaterThanOrEqual(0.7);
      expect(c.cy).toBeGreaterThanOrEqual(0.4);
      expect(c.cx).toBe(0.5);
    }
  });
  it('never overflows the frame', () => {
    for (const c of FRAME_CROP_CANDIDATES) {
      const r = cropRect(1020, 1020, c.frac, c.cx, c.cy);
      expect(r.sx).toBeGreaterThanOrEqual(0);
      expect(r.sy).toBeGreaterThanOrEqual(0);
      expect(r.sx + r.size).toBeLessThanOrEqual(1020);
      expect(r.sy + r.size).toBeLessThanOrEqual(1020);
    }
  });
});

describe('friendlyTaskError', () => {
  const cases: [string, RegExp][] = [
    ['{"error":"error_no_face"}', /face/i],
    ['{"error":"error_face_angle_leftward"}', /angled/i],
    ['{"error":"error_src_face_too_small"}', /too small/i],
    ['{"error":"error_src_face_out_of_bound"}', /cut off/i],
    ['{"error":"error_below_min_image_size"}', /resolution|larger/i],
    ['{"error":"[DLQ] Max retries exhausted"}', /hiccup/i],
    ['{"error":"unknown"}', /try again/i],
  ];
  for (const [raw, re] of cases) {
    it(`maps ${raw.slice(0, 40)}`, () => {
      expect(friendlyTaskError(raw)).toMatch(re);
      expect(friendlyTaskError(raw)).not.toMatch(/error_/);
    });
  }
});

describe('parseSkinOutput', () => {
  it('extracts scores, masks, overall, skin age; skips resize_image', () => {
    const out = parseSkinOutput([
      { type: 'wrinkle', ui_score: 80 },
      { type: 'resize_image', ui_score: 99 },
      { type: 'all', score: 76 },
      { type: 'skin_age', score: 38 },
      { type: 'pore', ui_score: 60, mask_urls: ['https://x/1.jpg'] },
      { type: 'acne', ui_score: 92 },
      { type: 'moisture', ui_score: 81 },
      { type: 'radiance', ui_score: 77 },
      { type: 'texture', ui_score: 70 },
    ]);
    expect(out.scores.wrinkle).toBe(80);
    expect(out.scores.pore).toBe(60);
    expect(out.masks.pore).toEqual(['https://x/1.jpg']);
    expect(out.overall).toBe(76);
    expect(out.skinAge).toBe(38);
  });
  it('fail-closed: throws when too few metrics', () => {
    expect(() => parseSkinOutput([{ type: 'wrinkle', ui_score: 80 }])).toThrow(/incomplete/);
  });
});
