import { describe, expect, it } from 'vitest';
import { deltaLabel, problemRating, rateRun, ratingLabel, START_RATING } from '../src/drill/rating';
import type { RunEntry, RunRecord } from '../src/drill/types';

const run = (log: Partial<RunEntry>[], over: Partial<RunRecord> = {}): RunRecord => ({
  id: 'r', drillKey: 'chain-pemdas:L10', drillName: 'Chains', mode: 'sprint', level: 5, correct: 0, attempted: log.length,
  accuracy: 1, totalMs: 60000, avgMs: 2000, date: 1,
  log: log.map((e) => ({ technique: 'chain', text: '1 + 1', answer: '2', input: '2', ok: true, ms: 1000, level: 5, ...e })),
  ...over,
});

describe('agility rating', () => {
  it('goes up for wins, down for losses, and more for beating stronger problems', () => {
    const wins = rateRun(START_RATING, run(Array.from({ length: 10 }, () => ({}))));
    const losses = rateRun(START_RATING, run(Array.from({ length: 10 }, () => ({ ok: false, skipped: true }))));
    expect(wins.delta).toBeGreaterThan(0);
    expect(losses.delta).toBeLessThan(0);
    const hard = rateRun(START_RATING, run(Array.from({ length: 10 }, () => ({ level: 10 }))));
    expect(hard.delta).toBeGreaterThan(wins.delta);
    // A retried solve is worth less than a clean one.
    const retried = rateRun(START_RATING, run(Array.from({ length: 10 }, () => ({ misses: 1 }))));
    expect(retried.delta).toBeLessThan(wins.delta);
  });

  it('untimed runs do not count', () => {
    expect(rateRun(1234, run([{}], { mode: 'training' }))).toEqual({ rating: 1234, delta: 0 });
  });

  it('labels: a plain number and a signed change', () => {
    expect(problemRating(1)).toBeLessThan(problemRating(10));
    expect(ratingLabel(2010)).toBe('2010');
    expect([deltaLabel(12), deltaLabel(-5), deltaLabel(0)]).toEqual(['+12', '−5', '±0']);
  });
});
