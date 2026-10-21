import type { Rng } from '../techniques/types';
import { makeRng } from '../techniques/util';

/**
 * The 120-second test, on the classic arithmetic-game ranges:
 * addition (2–100) + (2–100), subtraction as addition in reverse,
 * multiplication (2–12) × (2–100), and division as multiplication in reverse.
 * Every answer is a whole number.
 */
export const BLITZ_MS = 120_000;

export interface BlitzProblem {
  text: string;
  answer: number;
}

export function blitzProblem(rng: Rng): BlitzProblem {
  const op = rng.int(0, 3);
  if (op === 0 || op === 1) {
    const a = rng.int(2, 100), b = rng.int(2, 100);
    return op === 0 ? { text: `${a} + ${b}`, answer: a + b } : { text: `${a + b} − ${a}`, answer: b };
  }
  const a = rng.int(2, 12), b = rng.int(2, 100);
  return op === 2 ? { text: `${a} × ${b}`, answer: a * b } : { text: `${a * b} ÷ ${a}`, answer: b };
}

/**
 * The problems for one test, from a seed. Two players with the same seed get the same
 * problems in the same order, which is what makes a head-to-head match fair.
 */
export function blitzSet(seed: number): () => BlitzProblem {
  const rng = makeRng(seed);
  return () => blitzProblem(rng);
}

/** A fresh random seed (a 32-bit unsigned integer). */
export const newSeed = () => (Math.random() * 2 ** 32) >>> 0;
