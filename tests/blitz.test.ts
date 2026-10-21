import { describe, expect, it } from 'vitest';
import { blitzSet } from '../src/blitz/problems';

describe('120-second problems', () => {
  it('gives the same problems for the same seed', () => {
    const a = blitzSet(42), b = blitzSet(42);
    for (let i = 0; i < 50; i++) expect(a()).toEqual(b());
  });

  it('stays in range, with whole answers that match the text', () => {
    const next = blitzSet(7);
    for (let i = 0; i < 2000; i++) {
      const p = next();
      const [x, op, y] = p.text.split(' ');
      const a = Number(x), b = Number(y);
      const value = op === '+' ? a + b : op === '−' ? a - b : op === '×' ? a * b : a / b;
      expect(value).toBe(p.answer);
      expect(Number.isInteger(p.answer) && p.answer >= 2).toBe(true);
      if (op === '×') expect(a <= 12 && b <= 100).toBe(true);
    }
  });
});
