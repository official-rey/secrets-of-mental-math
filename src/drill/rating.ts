import type { RunRecord } from './types';

/**
 * Rating: an Elo rating for mental arithmetic.
 * Each problem in a timed run is a game against an opponent whose strength grows with the
 * problem's level. A first-try solve is a win, a solve after a retry half a win (a little
 * less), a skip or timeout a loss.
 */
export const START_RATING = 1000;
/** Elo K-factor per problem; small, since a run has many problems. */
const K = 6;

/** Strength of a problem on the 10-rung scale: Level I ≈ 740, Level X ≈ 2000. */
export const problemRating = (rung: number) => 600 + 140 * rung;

/** A problem's level on the 10-rung scale (Train-style runs use the six technique levels). */
function rung(run: RunRecord, level: number): number {
  const tenRungs = run.drillKey.startsWith('chain') || !!run.spec?.ladder;
  return tenRungs ? level : 1 + ((level - 1) * 9) / 5;
}

/** Rating after a run, and the change. Untimed runs do not count. */
export function rateRun(rating: number, run: RunRecord): { rating: number; delta: number } {
  if (run.mode === 'training') return { rating, delta: 0 };
  let r = rating;
  for (const e of run.log) {
    const opp = problemRating(rung(run, e.level ?? run.level));
    const expected = 1 / (1 + 10 ** ((opp - r) / 400));
    const score = e.skipped || !e.ok ? 0 : e.misses ? 0.4 : 1;
    r += K * (score - expected);
  }
  const next = Math.round(r);
  return { rating: next, delta: next - rating };
}

/** The rating as shown: a plain number. */
export const ratingLabel = (rating: number) => String(rating);

/** "+18", "−6" or "±0" */
export const deltaLabel = (d: number) => (d > 0 ? `+${d}` : d < 0 ? `−${-d}` : '±0');
