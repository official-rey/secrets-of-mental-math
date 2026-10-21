import type { Problem, Rng, Step } from '../techniques/types';

export type Mode = 'training' | 'sprint' | 'twenty' | 'endless';

export const MODES: { id: Mode; label: string; short: string }[] = [
  { id: 'training', label: 'Training', short: 'Train' },
  { id: 'sprint', label: 'Sprint', short: 'Sprint' },
  { id: 'twenty', label: '20 problems', short: '20 ×' },
  { id: 'endless', label: 'Endless', short: 'Endless' },
];

export type DrillKind = 'technique' | 'mixed' | 'chain';

export interface DrillSpec {
  kind: DrillKind;
  /** Technique ids (one for kind "technique", several for "mixed", none for "chain"). */
  ids: string[];
  /** Highest level the run may climb to: I–VI for techniques, I–X for chains. */
  level: number;
  mode: Mode;
  /** Chains and Challenge: the highest level reached before; the run climbs faster up to it. */
  known?: number;
  /** Challenge: levels run I–X on a ladder that blends the techniques' six levels. */
  ladder?: boolean;
  /** Chains: a level picked by the player; the run stays there instead of climbing from I. */
  from?: number;
}

/** Anything that can produce problems and explain them. */
export interface ProblemSource {
  id: string;
  name: string;
  generate(rng: Rng, level: number): Problem;
  steps(p: Problem): Step[];
}

export interface RunEntry {
  /** Technique id, or 'chain'. */
  technique: string;
  text: string;
  answer: string;
  input: string;
  ok: boolean;
  /** True when the player skipped or asked to see the solution. */
  skipped?: boolean;
  /** Wrong tries before the right answer; `input` then holds the first wrong one. */
  misses?: number;
  /** Level the problem was set at (on the run's own scale: I–VI, or I–X on a ladder). */
  level?: number;
  ms: number;
}

export interface RunRecord {
  id: string;
  /** Leaderboard bucket: drill identity + level. */
  drillKey: string;
  drillName: string;
  mode: Mode;
  level: number;
  /** Problems solved (skipped ones are not). */
  correct: number;
  attempted: number;
  /** Share of problems right the first time. */
  accuracy: number;
  /** Longest run of first-try answers. */
  bestStreak?: number;
  /** Timed runs: rating after this run, and how much it moved. */
  rating?: number;
  ratingDelta?: number;
  totalMs: number;
  avgMs: number;
  date: number;
  log: RunEntry[];
  /** What was drilled, so the run can be replayed from history. */
  spec?: DrillSpec;
  /** Nickname of whoever played this run on this device. */
  player?: string;
}
