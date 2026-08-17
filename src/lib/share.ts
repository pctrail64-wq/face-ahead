// ---------------------------------------------------------------------------
// FACE AHEAD — share-card assembly (honest, no medical claims).
// ---------------------------------------------------------------------------
import type { AgeFrame } from './aging';
import type { ComparisonReport, Habit } from './compare';

export interface ShareCardData {
  title: string;
  frameUrl: string | null;
  age: number;
  headline: string;
  lines: string[];
  footer: string;
}

export function buildShareCard(
  frame: AgeFrame,
  comparison: ComparisonReport,
  habits: Habit[],
  provider: 'youcam' | 'demo',
): ShareCardData {
  const drop = comparison.biggestDrop;
  const habit = habits[0];
  const lines: string[] = [];
  if (drop) {
    lines.push(`${drop.label}: ${drop.today?.toFixed(0) ?? '—'} → ${drop.future?.toFixed(0) ?? '—'}`);
  }
  if (habit) {
    lines.push(`My #1 move: ${habit.title}`);
  }
  lines.push(`${comparison.worseCount}/14 concern scores trend worse by ${frame.age}.`);
  return {
    title: 'FACE AHEAD — my face at ' + frame.age,
    frameUrl: provider === 'youcam' ? frame.url : null,
    age: frame.age,
    headline: drop
      ? `Biggest change by ${frame.age}: ${drop.label.toLowerCase()}`
      : `This is a projection of your face at ${frame.age}.`,
    lines,
    footer: provider === 'youcam'
      ? 'AI projection by YouCam · not a medical prediction · error bars shown in app'
      : 'GENERATED demo · add a YouCam key for a real projection',
  };
}

export async function shareCard(data: ShareCardData): Promise<'shared' | 'copied' | 'failed'> {
  const text = `${data.title}\n\n${data.headline}\n${data.lines.join('\n')}\n\n${data.footer}`;
  try {
    if (navigator.share) {
      await navigator.share({ title: data.title, text, url: data.frameUrl ?? undefined });
      return 'shared';
    }
    await navigator.clipboard.writeText(text);
    return 'copied';
  } catch {
    try {
      await navigator.clipboard.writeText(text);
      return 'copied';
    } catch { return 'failed'; }
  }
}
