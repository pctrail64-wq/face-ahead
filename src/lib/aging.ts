// ---------------------------------------------------------------------------
// FACE AHEAD — YouCam aging provider (verified live, 2 units per call).
// POST /s2s/v2.0/file/aging → presigned PUT → task → poll.
// Returns up to 16 frames: res_age 12→70, each a 1020×1020 JPEG of the
// uploaded face aged by the model. Errors are free; only success charges 2u.
// ---------------------------------------------------------------------------
import { YOUNCAM_BASE, uploadFile, createTask, pollTask } from './youcam';

export interface AgeFrame {
  age: number;
  url: string;
}

export const AGING_SLUG = 'aging';

/** Validates the aging output shape (fail-closed gate). */
export function parseAgingFrames(output: any[]): AgeFrame[] {
  const frames: AgeFrame[] = [];
  for (const item of output ?? []) {
    const age = typeof item?.res_age === 'number' ? item.res_age : null;
    const url = typeof item?.url === 'string' ? item.url : null;
    if (age === null || !url) continue;
    frames.push({ age, url });
  }
  if (frames.length < 3) throw new Error('Aging returned too few frames — retrying with another crop.');
  return frames.sort((a, b) => a.age - b.age);
}

/** Runs the aging task on a prepared 1024² crop blob. */
export async function runAging(key: string, blob: Blob): Promise<AgeFrame[]> {
  const fid = await uploadFile(key, blob, AGING_SLUG);
  const taskId = await createTask(key, AGING_SLUG, { src_file_id: fid, format: 'json' });
  const res = await pollTask(key, AGING_SLUG, taskId, 120_000);
  return parseAgingFrames(res?.data?.results?.output ?? []);
}

/** Finds the frame nearest to a target age. */
export function frameAt(frames: AgeFrame[], target: number): AgeFrame {
  if (!frames.length) throw new Error('No aging frames available.');
  return frames.reduce((best, f) =>
    Math.abs(f.age - target) < Math.abs(best.age - target) ? f : best, frames[0]);
}

/** Demo frames — explicitly GENERATED (never passed off as real). */
export function demoFrames(): AgeFrame[] {
  const ages = [12, 16, 20, 24, 27, 31, 35, 39, 43, 47, 51, 55, 58, 62, 66, 70];
  return ages.map((age) => ({ age, url: '' })); // url empty = demo placeholder
}
