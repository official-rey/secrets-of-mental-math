import { BLITZ_MS, blitzSet, newSeed, type BlitzProblem } from '../blitz/problems';
import * as net from '../net/online';
import { store } from '../storage/store';
import { app } from './context';
import { h } from './dom';
import { ICONS } from './icons';
import { applyKey, keypad, type PadKey } from './keypad';
import type { View } from './router';

export interface BlitzOptions {
  seed: number;
  usePad: boolean;
  title: string;
  back: string;
  /** Extra header content, such as the opponent's live score in a match. */
  extra?: HTMLElement;
  onScore?(score: number): void;
  onEnd(score: number): void;
}

export interface BlitzPlayer {
  el: HTMLElement;
  /** The area under the header; the caller puts the result here when time is up. */
  stage: HTMLElement;
  /** Start the clock, `elapsed` ms in (for a match joined late). */
  start(elapsed?: number): void;
  destroy(): void;
}

/** Whether to show the on-screen keypad, from the setting and the kind of screen. */
export async function wantsPad(): Promise<boolean> {
  const { keypad } = await store.getPrefs();
  return keypad === 'on' || (keypad === 'auto' && matchMedia('(pointer: coarse)').matches);
}

/**
 * One 120-second test. The answer is taken the moment it is right, with no Enter key, so the
 * score measures speed and nothing else. Wrong digits stay until you fix them.
 */
export function blitzPlayer(opts: BlitzOptions): BlitzPlayer {
  const next = blitzSet(opts.seed);
  let problem: BlitzProblem = next();
  let score = 0, startedAt = 0, timer = 0, over = false;

  const stat = h('div', { class: 'drill-stat mono', 'data-testid': 'stat' }, '120s · 0');
  const bar = h('i');
  const progress = h('div', { class: 'progress clock', 'aria-hidden': 'true' }, bar);
  const text = h('div', { class: 'problem', 'data-testid': 'problem', role: 'status', 'aria-live': 'polite' }, problem.text);
  const input = h('input', {
    class: 'answer',
    type: 'text',
    inputmode: opts.usePad ? 'none' : 'numeric',
    autocomplete: 'off',
    spellcheck: 'false',
    'aria-label': 'Your answer',
    'data-testid': 'answer',
  }) as HTMLInputElement;
  const form = h('form', { class: 'answer-form', novalidate: true, onsubmit: (e: Event) => e.preventDefault() }, input);
  const stage = h('main', { class: 'drill-stage' }, text, form);

  const left = () => Math.max(0, BLITZ_MS - (performance.now() - startedAt));

  function paint() {
    const ms = left();
    stat.textContent = `${Math.ceil(ms / 1000)}s · ${score}`;
    bar.style.width = `${(100 * ms) / BLITZ_MS}%`;
    progress.classList.toggle('low', ms < 10_000);
  }

  function check() {
    if (over || !/\d/.test(input.value)) return;
    if (Number(input.value) !== problem.answer) return;
    score++;
    opts.onScore?.(score);
    problem = next();
    text.textContent = problem.text;
    input.value = '';
    paint();
  }

  function onKey(k: PadKey) {
    if (over || k === 'enter') return;
    input.value = applyKey(input.value, k) ?? input.value;
    check();
  }

  function tick() {
    paint();
    if (over || left() > 0) return;
    over = true;
    clearInterval(timer);
    input.readOnly = true;
    opts.onEnd(score);
  }

  input.addEventListener('input', () => {
    input.value = input.value.replace(/[^\d]/g, '');
    check();
  });

  const el = h(
    'div',
    { class: `drill blitz${opts.usePad ? ' has-pad' : ''}` },
    h(
      'header',
      { class: 'drill-bar' },
      h('a', { class: 'iconbtn', href: opts.back, 'aria-label': 'Quit', html: ICONS.close }),
      h('div', { class: 'drill-title' }, opts.title),
      h('div', { class: 'stat-wrap' }, opts.extra ?? null, stat),
    ),
    progress,
    stage,
    opts.usePad ? h('div', { class: 'dock with-pad' }, keypad(onKey)) : null,
  );

  // Test hook for end-to-end runs, as in the drill: only with ?e2e in the URL.
  if (new URLSearchParams(location.search).has('e2e')) {
    (window as unknown as { __mm: unknown }).__mm = { answer: () => problem.answer, finish: () => (startedAt = -BLITZ_MS) };
  }

  return {
    el,
    stage,
    start(elapsed = 0) {
      startedAt = performance.now() - elapsed;
      paint();
      timer = window.setInterval(tick, 100);
      if (!opts.usePad) input.focus();
    },
    destroy() {
      clearInterval(timer);
      over = true;
    },
  };
}

/** Enter the full-screen drill state that hides the art and navigation. */
export function enterDrill() {
  app.art?.pause();
  document.body.classList.add('drilling');
}

export function leaveDrill() {
  document.body.classList.remove('drilling');
  app.art?.resume();
}

/** Solo 120-second test, with the best score kept on this device. */
export async function blitzView(): Promise<View> {
  const usePad = await wantsPad();
  let signedIn = Boolean((await net.myProfile().catch(() => null))?.username);
  const host = h('div', { class: 'blitz-host', 'data-testid': 'blitz' });
  let player: BlitzPlayer | null = null;

  function play() {
    player?.destroy();
    const p = blitzPlayer({
      seed: newSeed(),
      usePad,
      title: '120 seconds',
      back: '#/play',
      onEnd: async (score) => {
        const best = (await store.getPrefs()).blitzBest;
        if (score > best) await store.setPrefs({ blitzBest: score });
        // Signed in: the score goes on the leaderboard. The server checks the two minutes passed.
        const posted = signedIn ? net.submitScore(score).then(() => 'On the leaderboard', (e: Error) => e.message) : null;
        const note = h('p', { class: 'dim mono' }, posted ? '…' : '');
        void posted?.then((t) => (note.textContent = t));
        p.stage.replaceChildren(
          h(
            'div',
            { class: 'blitz-result', 'data-testid': 'blitz-result' },
            h('div', { class: 'blitz-final mono', 'data-testid': 'score' }, String(score)),
            h('p', { class: 'dim mono' }, score > best ? 'New best' : `Best ${best}`),
            posted ? note : null,
            h('button', { class: 'btn primary big block', type: 'button', 'data-testid': 'again', onclick: () => play() }, 'Again', h('span', { class: 'arrow' }, '→')),
            h('a', { class: 'btn block', href: '#/play' }, 'Done'),
          ),
        );
        p.el.querySelector('.dock')?.remove();
        p.el.classList.remove('has-pad');
      },
    });
    player = p;
    host.replaceChildren(p.el);
    p.start();
    if (signedIn) void net.beginTest().catch(() => (signedIn = false));
  }

  return {
    el: host,
    title: '120 seconds',
    mounted() {
      enterDrill();
      play();
    },
    destroy() {
      player?.destroy();
      leaveDrill();
    },
  };
}
