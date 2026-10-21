import type { DrillSpec, Mode, RunRecord } from '../drill/types';
import type { CategoryId, Level } from '../techniques/types';

export type KeypadPref = 'auto' | 'on' | 'off';

export interface Prefs {
  level: Level;
  mode: Mode;
  muted: boolean;
  /** On-screen number pad: auto shows it on touch screens. */
  keypad: KeypadPref;
  /** Margin art on wide screens and the Train page plate. */
  art: boolean;
  /** Short vibration on key presses and misses, where the device supports it. */
  haptics: boolean;
  /** Technique ids picked for the Mixed drill. */
  mixed: string[];
  /** Tab last opened on the Learn screen: Featured or a group. */
  learnCategory: CategoryId | 'featured';
  /** Name shown on the leaderboard for runs on this device. */
  nickname?: string;
  /** Last drill started, used by the Train screen's one-tap start. */
  last?: DrillSpec;
  /** Times the Train screen has been opened; the landing layout changes after a while. */
  visits: number;
  /** Ids of trophies earned on this device. */
  trophies: string[];
  /** Problems solved on this device, all time. */
  solved: number;
  /** Highest Chains level reached (I–X). */
  chainBest: number;
  /** Chains: a level to play at, or 0 for Auto (climb from I). */
  chainPick: number;
  /** Highest Challenge level reached (I–X). */
  challengeBest: number;
  /** Rating (Elo-style) and its highest point. */
  rating: number;
  ratingPeak: number;
}

export interface SaveResult {
  /** 1-based position on the board, or null if it did not make the top 10. */
  rank: number | null;
  /** True when this run beats every earlier run on the board. */
  isBest: boolean;
}

/**
 * Persistence boundary. Everything is async so a backend can replace the local
 * implementation without touching callers.
 */
export interface Store {
  getPrefs(): Promise<Prefs>;
  setPrefs(patch: Partial<Prefs>): Promise<Prefs>;
  /** Record a finished run: always in history, and on its leaderboard when timed. */
  saveRun(run: RunRecord): Promise<SaveResult>;
  topRuns(drillKey: string, mode: Mode, limit?: number): Promise<RunRecord[]>;
  best(drillKey: string, mode: Mode): Promise<RunRecord | null>;
  /** Best run of every leaderboard, most recent first. */
  bests(): Promise<RunRecord[]>;
  /** Recent runs of any mode, newest first. */
  history(limit?: number): Promise<RunRecord[]>;
  getRun(id: string): Promise<RunRecord | null>;
  /** Put `name` on every saved run that has no player yet. */
  nameRuns(name: string): Promise<void>;
  /** Erase runs, bests and history (settings are kept). */
  clearRuns(): Promise<void>;
}

export const BOARD_SIZE = 10;
export const HISTORY_SIZE = 60;

export const DEFAULT_PREFS: Prefs = {
  level: 1,
  mode: 'training',
  muted: false,
  keypad: 'auto',
  art: true,
  haptics: true,
  mixed: [],
  learnCategory: 'featured',
  visits: 0,
  trophies: [],
  solved: 0,
  chainBest: 1,
  chainPick: 0,
  challengeBest: 1,
  rating: 1000,
  ratingPeak: 1000,
};

/** Better runs sort first. Sprint: most correct, then accuracy. Twenty: most correct, then fastest. */
export function compareRuns(a: RunRecord, b: RunRecord): number {
  if (a.mode === 'twenty') return b.correct - a.correct || a.totalMs - b.totalMs || a.date - b.date;
  return b.correct - a.correct || b.accuracy - a.accuracy || a.avgMs - b.avgMs || a.date - b.date;
}

/** Synchronous key-value backend; localStorage in the browser, a Map in tests. */
export interface KV {
  getItem(key: string): string | null;
  setItem(key: string, value: string): void;
  removeItem(key: string): void;
}

export class LocalStore implements Store {
  private prefix = 'mm:v1:';
  constructor(private kv: KV = safeLocalStorage()) {}

  private read<T>(key: string, fallback: T): T {
    try {
      const raw = this.kv.getItem(this.prefix + key);
      return raw ? (JSON.parse(raw) as T) : fallback;
    } catch {
      return fallback;
    }
  }

  private write(key: string, value: unknown) {
    try {
      this.kv.setItem(this.prefix + key, JSON.stringify(value));
    } catch {
      /* storage full or blocked: keep going without persistence */
    }
  }

  async getPrefs(): Promise<Prefs> {
    return { ...DEFAULT_PREFS, ...this.read<Partial<Prefs>>('prefs', {}) };
  }

  async setPrefs(patch: Partial<Prefs>): Promise<Prefs> {
    const next = { ...(await this.getPrefs()), ...patch };
    this.write('prefs', next);
    return next;
  }

  private boardKey(drillKey: string, mode: Mode) {
    return `board:${mode}:${drillKey}`;
  }

  async saveRun(run: RunRecord): Promise<SaveResult> {
    const history = this.read<RunRecord[]>('history', []);
    this.write('history', [run, ...history.filter((r) => r.id !== run.id)].slice(0, HISTORY_SIZE));
    if (run.mode === 'training') return { rank: null, isBest: false };

    const key = this.boardKey(run.drillKey, run.mode);
    const board = this.read<RunRecord[]>(key, []);
    const isBest = board.length === 0 || compareRuns(run, board[0]) < 0;
    const next = [...board, run].sort(compareRuns).slice(0, BOARD_SIZE);
    this.write(key, next);
    const index = this.read<string[]>('boards', []);
    if (!index.includes(key)) this.write('boards', [...index, key]);
    const idx = next.findIndex((r) => r.id === run.id);
    return { rank: idx < 0 ? null : idx + 1, isBest };
  }

  async topRuns(drillKey: string, mode: Mode, limit = BOARD_SIZE): Promise<RunRecord[]> {
    return this.read<RunRecord[]>(this.boardKey(drillKey, mode), []).slice(0, limit);
  }

  async best(drillKey: string, mode: Mode): Promise<RunRecord | null> {
    return (await this.topRuns(drillKey, mode, 1))[0] ?? null;
  }

  async bests(): Promise<RunRecord[]> {
    return this.read<string[]>('boards', [])
      .map((k) => this.read<RunRecord[]>(k, [])[0])
      .filter((r): r is RunRecord => !!r)
      .sort((a, b) => b.date - a.date);
  }

  async history(limit = HISTORY_SIZE): Promise<RunRecord[]> {
    return this.read<RunRecord[]>('history', []).slice(0, limit);
  }

  async getRun(id: string): Promise<RunRecord | null> {
    const fromHistory = this.read<RunRecord[]>('history', []).find((r) => r.id === id);
    if (fromHistory) return fromHistory;
    for (const k of this.read<string[]>('boards', [])) {
      const r = this.read<RunRecord[]>(k, []).find((x) => x.id === id);
      if (r) return r;
    }
    return null;
  }

  async nameRuns(name: string): Promise<void> {
    const named = (runs: RunRecord[]) => runs.map((r) => (r.player ? r : { ...r, player: name }));
    this.write('history', named(this.read<RunRecord[]>('history', [])));
    for (const k of this.read<string[]>('boards', [])) this.write(k, named(this.read<RunRecord[]>(k, [])));
  }

  async clearRuns(): Promise<void> {
    for (const k of this.read<string[]>('boards', [])) this.kv.removeItem(this.prefix + k);
    this.kv.removeItem(this.prefix + 'boards');
    this.kv.removeItem(this.prefix + 'history');
  }
}

function safeLocalStorage(): KV {
  try {
    const ls = globalThis.localStorage;
    const probe = '__mm_probe__';
    ls.setItem(probe, '1');
    ls.removeItem(probe);
    return ls;
  } catch {
    const mem = new Map<string, string>();
    return { getItem: (k) => mem.get(k) ?? null, setItem: (k, v) => void mem.set(k, v), removeItem: (k) => void mem.delete(k) };
  }
}

export const store: Store = new LocalStore();
