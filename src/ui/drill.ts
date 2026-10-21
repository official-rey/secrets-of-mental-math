import { DrillSession, nextCombo, TWENTY, type Attempt } from '../drill/engine';
import { drillName, parseSpec, ROMAN } from '../drill/spec';
import { rateRun } from '../drill/rating';
import type { DrillSpec } from '../drill/types';
import { store } from '../storage/store';
import { getTechnique } from '../techniques/registry';
import { fmt } from '../techniques/util';
import { app } from './context';
import { h } from './dom';
import { ICONS } from './icons';
import { applyKey, keypad, type PadKey } from './keypad';
import { go, type View } from './router';
import { setMath } from './math';
import { renderStepper, renderSteps } from './steps';

export function backHref(spec: DrillSpec): string {
  if (spec.kind === 'chain') return '#/chain';
  if (spec.mode !== 'training') return '#/challenge';
  return spec.kind === 'technique' ? `#/t/${spec.ids[0]}` : '#/train';
}

const sizeClass = (text: string) => (text.length <= 9 ? 'xl' : text.length <= 15 ? 'lg' : text.length <= 24 ? 'md' : 'sm');

const secs = (ms: number) => (ms / 1000).toFixed(1);


function toolButton(icon: string, label: string, testid: string, onclick: () => void): HTMLButtonElement {
  const b = h('button', { type: 'button', class: 'tool', 'data-testid': testid }, h('span', { class: 'tool-icon', html: icon }), h('span', { class: 'tool-label' }, label));
  b.addEventListener('pointerdown', (e) => e.preventDefault());
  b.addEventListener('click', onclick);
  return b;
}

export async function drillView(_parts: string[], q: URLSearchParams): Promise<View> {
  const parsed = parseSpec(q);
  if (!parsed) {
    queueMicrotask(() => go('#/'));
    return { el: h('div') };
  }
  const spec: DrillSpec = parsed;
  const prefs = await store.setPrefs({ last: spec });
  const usePad = prefs.keypad === 'on' || (prefs.keypad === 'auto' && matchMedia('(pointer: coarse)').matches);
  // Trig and logs can have negative answers: offer a minus key (or a keyboard that has one).
  const signed = spec.kind !== 'chain' && spec.ids.some((id) => getTechnique(id)?.meta.signed);
  const buzz = (ms: number) => {
    if (prefs.haptics) navigator.vibrate?.(ms);
  };

  const session = new DrillSession(spec);
  const timed = spec.mode !== 'training';
  let state: 'answering' | 'review' | 'paused' | 'done' = 'answering';
  let hints = 0;
  let timer = 0;
  let feedbackTimer = 0;

  // Sprint and Endless show a clock bar.
  const counted = spec.mode === 'sprint' || spec.mode === 'endless';
  // Chains and Challenge remember the highest rung reached.
  const climbs = spec.kind === 'chain' || !!spec.ladder;
  const bestKey = spec.kind === 'chain' ? 'chainBest' : 'challengeBest';
  let ladderBest = prefs[bestKey];

  // ----- Elements -----
  const levelTag = h('div', { class: 'level-tag', 'data-testid': 'level' });
  const bonus = h('span', { class: 'bonus mono', 'aria-live': 'polite' });
  const stat = h('div', { class: 'drill-stat mono', 'data-testid': 'stat' });
  const streakEl = h('span', { class: 'streak mono', 'data-testid': 'streak', hidden: true });
  const bar = h('i');
  const progress = h('div', { class: `progress${counted ? ' clock' : ''}`, 'aria-hidden': 'true' }, bar);
  const tag = h('div', { class: 'drill-tag' });
  const problem = h('div', { class: 'problem', 'data-testid': 'problem', role: 'status', 'aria-live': 'polite' });
  const hint = h('div', { class: 'problem-hint mono' });
  const hintSteps = h('div', { class: 'hint-steps', 'data-testid': 'hint-steps' });
  const input = h('input', {
    class: 'answer',
    type: 'text',
    inputmode: usePad ? 'none' : signed ? 'text' : 'decimal',
    autocomplete: 'off',
    autocorrect: 'off',
    autocapitalize: 'off',
    spellcheck: 'false',
    enterkeyhint: 'go',
    'aria-label': 'Your answer',
    'data-testid': 'answer',
  });
  const form = h('form', { class: 'answer-form', novalidate: true }, input);
  const feedback = h('div', { class: 'feedback mono', 'aria-live': 'polite', 'data-testid': 'feedback' });
  const solution = h('div', { class: 'solution', hidden: true, 'data-testid': 'solution' });
  const resumeBtn = h('button', { class: 'btn ink', type: 'button', 'data-testid': 'resume', onclick: () => togglePause() }, 'Resume', h('span', { class: 'arrow' }, '→'));
  const pausedCover = h('div', { class: 'paused-cover', hidden: true }, h('h2', null, 'Paused'), h('p', { class: 'dim' }, 'The clock is stopped.'), resumeBtn);

  // Tools: hints and answers while training; pause and skip when timed.
  const tools: HTMLButtonElement[] = [];
  let pauseBtn: HTMLButtonElement | null = null;
  let hintBtn: HTMLButtonElement | null = null;
  if (timed) {
    pauseBtn = toolButton(ICONS.pause, 'Pause', 'pause', () => togglePause());
    tools.push(pauseBtn, toolButton(ICONS.skip, 'Skip', 'skip', () => skip()));
  } else {
    hintBtn = toolButton(ICONS.hint, 'Hint', 'hint', () => showHint());
    tools.push(toolButton(ICONS.info, 'How', 'how', () => openLesson()), hintBtn, toolButton(ICONS.eye, 'Show answer', 'reveal', () => skip()));
  }
  const toolbar = h('div', { class: 'toolbar' }, tools);
  const dock = h('div', { class: `dock${usePad ? ' with-pad' : ''}` }, toolbar, usePad ? keypad(onKey, signed) : null);

  const doneBtn = timed ? null : h('button', { class: 'iconbtn done', type: 'button', 'data-testid': 'done', onclick: () => end() }, 'Done');

  const el = h(
    'div',
    { class: `drill${usePad ? ' has-pad' : ''}` },
    h(
      'header',
      { class: 'drill-bar' },
      h('a', { class: 'iconbtn', href: backHref(spec), 'aria-label': 'Quit drill', html: ICONS.close }),
      h('div', { class: 'drill-title' }, drillName(spec)),
      h('div', { class: 'stat-wrap' }, streakEl, stat, bonus),
      doneBtn,
    ),
    progress,
    h('main', { class: 'drill-stage' }, levelTag, tag, problem, hint, hintSteps, form, feedback, solution, pausedCover),
    dock,
  );

  // ----- Rendering -----
  function paintStats() {
    const log = session.log;
    const ok = session.correct;
    if (spec.mode === 'sprint') {
      const left = session.remaining();
      stat.textContent = `${Math.ceil(left / 1000)}s · ✓${ok}`;
      // The bar is the time left: it runs down, and jumps back up when a right answer adds time.
      bar.style.width = `${(100 * left) / session.timeLimit()}%`;
      progress.classList.toggle('low', left < 10_000);
      if (left <= 0 && state !== 'done') end();
    } else if (spec.mode === 'endless') {
      const lives = session.lives;
      stat.textContent = `Lives ${Math.max(0, lives)} · ✓${ok}`;
      // The bar is this problem's clock; it gets shorter the more you solve.
      const left = session.problemRemaining();
      bar.style.width = `${(100 * left) / session.problemLimit()}%`;
      progress.classList.toggle('low', left < 3_000);
      if (left <= 0 && state === 'answering') timeUp();
    } else if (spec.mode === 'twenty') {
      stat.textContent = `${Math.min(log.length + 1, TWENTY)}/${TWENTY} · ${secs(session.elapsed())}s`;
      bar.style.width = `${(100 * log.length) / TWENTY}%`;
    } else {
      stat.textContent = `✓${ok} ✗${log.length - session.firstTry}`;
    }
  }

  /** The streak counter beside the score: shown from 3 in a row, with a pop on each one. */
  function paintStreak(n: number) {
    // Sprint shows the combo toward its next payout, like Puzzle Storm; other modes the streak from 3.
    const sprint = spec.mode === 'sprint';
    streakEl.hidden = sprint ? n < 1 : n < 3;
    streakEl.textContent = sprint ? `combo ${n}/${nextCombo(n)}` : `${n} in a row`;
    streakEl.classList.remove('pop');
    void streakEl.offsetWidth;
    if (n >= 3) streakEl.classList.add('pop');
  }

  /** The current technique's lesson (example and picture) in a sheet over the problem. */
  function openLesson() {
    const t = getTechnique(session.current.technique);
    if (!t) return;
    const sheet = h(
      'div',
      { class: 'lesson-sheet', role: 'dialog', 'aria-modal': 'true', 'aria-label': t.meta.name, 'data-testid': 'lesson-sheet' },
      h(
        'div',
        { class: 'sheet-inner' },
        h('div', { class: 'sheet-head' }, h('h2', null, t.meta.name), h('button', { class: 'iconbtn', type: 'button', 'aria-label': 'Close', html: ICONS.close, onclick: () => close() })),
        h('p', { class: 'tech-idea' }, t.meta.idea),
        renderStepper(t.steps(t.card.example)),
      ),
    );
    const close = () => {
      sheet.remove();
      input.focus();
    };
    sheet.addEventListener('click', (e) => e.target === sheet && close());
    el.append(sheet);
  }

  function showProblem() {
    const p = session.current;
    setMath(problem, p.text);
    problem.className = `problem ${sizeClass(p.text)}`;
    fitProblem();
    void problem.offsetWidth;
    problem.classList.add('enter');
    hint.textContent = p.hint ?? '';
    tag.textContent = session.sources.length > 1 ? session.sourceName(p) : '';
    hints = 0;
    hintSteps.replaceChildren();
    if (hintBtn) hintBtn.disabled = false;
    input.value = '';
    input.readOnly = false;
    input.classList.remove('is-wrong', 'is-ok');
    solution.hidden = true;
    solution.replaceChildren();
    dock.hidden = false;
    input.focus();
  }

  /** "Level I → III" while the drill is still climbing to the chosen level, then just the level. */
  function paintLevel() {
    const cur = session.level, target = spec.level;
    // Chains and Challenge climb as far as you can take them: no target to show.
    levelTag.textContent = climbs ? `Level ${ROMAN[cur]}` : cur < target ? `Level ${ROMAN[cur]} → ${ROMAN[target]}` : `Level ${ROMAN[cur]}`;
  }

  /** Brief "+2 s" beside the clock when a correct sprint answer adds time. */
  function showBonus(a: Attempt) {
    if (!a.bonusMs) return;
    bonus.textContent = a.bonusMs > 0 ? `+${a.bonusMs / 1000} s` : `−${-a.bonusMs / 1000} s`;
    bonus.classList.toggle('minus', a.bonusMs < 0);
    bonus.classList.remove('pop');
    void bonus.offsetWidth;
    bonus.classList.add('pop');
  }

  /** Shrink the problem until it fits on one line, so expressions never break mid-way. */
  function fitProblem() {
    problem.style.fontSize = '';
    const max = problem.parentElement!.clientWidth;
    let size = parseFloat(getComputedStyle(problem).fontSize);
    while (problem.scrollWidth > max && size > 16) {
      size -= 2;
      problem.style.fontSize = `${size}px`;
    }
  }

  function flash(text: string, cls: 'ok' | 'bad') {
    clearTimeout(feedbackTimer);
    feedback.textContent = text;
    feedback.className = `feedback mono ${cls}`;
    void feedback.offsetWidth;
    feedback.classList.add('pulse');
    feedbackTimer = window.setTimeout(() => (feedback.textContent = ''), cls === 'ok' ? 900 : 2200);
  }

  function next() {
    if (session.isFinished()) return end();
    session.advance();
    state = 'answering';
    showProblem();
    paintStats();
  }

  /** Training: reveal one more line of the worked solution, never the final answer. */
  function showHint() {
    if (state !== 'answering') return;
    const steps = session.steps();
    const available = steps.slice(1, -1);
    if (hints >= available.length) return;
    hints++;
    hintSteps.replaceChildren(
      renderSteps([{ op: '', expr: steps[0].expr }, ...available.slice(0, hints).map((s) => ({ ...s, op: s.op ?? '=' }))], { markLast: false }),
    );
    if (hintBtn && hints >= available.length) hintBtn.disabled = true;
    input.focus();
  }

  function review(answer: string, problemText: string, steps: ReturnType<typeof session.steps>) {
    state = 'review';
    input.readOnly = true;
    feedback.textContent = '';
    hintSteps.replaceChildren();
    dock.hidden = true;
    solution.replaceChildren(
      h('div', { class: 'solution-head' }, h('span', { class: 'dim' }, 'Answer'), h('span', { class: 'mono solution-answer' }, fmt(answer))),
      renderSteps(steps),
      h('button', { class: 'btn ink block big', type: 'button', 'data-testid': 'next', onclick: () => next() }, 'Next', h('span', { class: 'arrow' }, '↵')),
    );
    solution.setAttribute('aria-label', `Worked solution for ${problemText}`);
    solution.hidden = false;
    input.focus();
  }

  /** After a right answer: the combo count, and a rung reached for the first time is kept. */
  function reward(a: Attempt) {
    paintStreak(a.streak);
    if (climbs && a.levelUp && a.levelUp > ladderBest) {
      ladderBest = a.levelUp;
      store.setPrefs({ [bestKey]: ladderBest });
    }
  }

  function submit() {
    if (state === 'done' || state === 'paused') return;
    if (state === 'review') return next();
    const raw = input.value.trim();
    if (!raw) return;
    const a = session.submit(raw);
    paintStats();
    if (a.ok) {
      reward(a);
      flash(a.levelUp ? `✓ ${fmt(a.problem.answer)} · Level ${ROMAN[a.levelUp]}` : `✓ ${fmt(a.problem.answer)}`, 'ok');
      showBonus(a);
      paintLevel();
      input.classList.add('is-ok');
      return next();
    }
    // A miss is forgiven: shake, clear, and try the same problem again. In Endless it costs a life.
    if (a.done) return end();
    buzz(40);
    paintStreak(0);
    input.value = '';
    input.classList.remove('is-wrong');
    void input.offsetWidth;
    input.classList.add('is-wrong');
    showBonus(a);
    flash(a.lifeLost ? 'Incorrect, −1 life' : 'Incorrect, try again', 'bad');
    // While training, each miss also shows one more line of the method.
    if (!timed) showHint();
    input.focus();
  }

  function skip() {
    if (state !== 'answering') return;
    const a = session.skip();
    paintStats();
    paintStreak(0);
    if (session.isFinished()) return end();
    if (timed) {
      flash(`${a.problem.text} = ${fmt(a.problem.answer)}`, 'bad');
      return next();
    }
    review(a.problem.answer, a.problem.text, session.steps(a.problem));
  }

  /** Endless: the problem's clock ran out. It costs a life; the answer shows and the run moves on. */
  function timeUp() {
    const a = session.skip();
    buzz(40);
    paintStreak(0);
    if (session.isFinished()) return end();
    flash(`Time! ${a.problem.text} = ${fmt(a.problem.answer)}`, 'bad');
    next();
  }

  function togglePause() {
    if (!timed || state === 'done' || state === 'review') return;
    if (state === 'paused') {
      session.resume();
      state = 'answering';
      el.classList.remove('is-paused');
      pausedCover.hidden = true;
      pauseBtn!.querySelector('.tool-icon')!.innerHTML = ICONS.pause;
      pauseBtn!.querySelector('.tool-label')!.textContent = 'Pause';
      input.focus();
    } else {
      session.pause();
      state = 'paused';
      el.classList.add('is-paused');
      pausedCover.hidden = false;
      pauseBtn!.querySelector('.tool-icon')!.innerHTML = ICONS.play;
      pauseBtn!.querySelector('.tool-label')!.textContent = 'Resume';
      resumeBtn.focus();
    }
    paintStats();
  }

  function onKey(k: PadKey) {
    if (state !== 'answering') return;
    buzz(6);
    const v = applyKey(input.value, k);
    if (v === null) return submit();
    input.value = v;
    input.focus();
  }

  async function end() {
    if (state === 'done') return;
    state = 'done';
    clearInterval(timer);
    session.finish();
    if (session.log.length === 0) return go(backHref(spec));
    const run = session.result();
    const p = await store.getPrefs();
    if (p.nickname) run.player = p.nickname;
    // Timed runs move the rating.
    if (timed) {
      const r = rateRun(p.rating, run);
      run.rating = r.rating;
      run.ratingDelta = r.delta;
      await store.setPrefs({ rating: r.rating, ratingPeak: Math.max(p.ratingPeak, r.rating) });
    }
    const saved = await store.saveRun(run);
    // Lifetime total.
    const solved = p.solved + run.correct;
    await store.setPrefs({ solved });
    app.lastResult = { run, saved, spec };
    go('#/results');
  }

  form.addEventListener('submit', (e) => {
    e.preventDefault();
    submit();
  });
  input.addEventListener('keydown', (e) => {
    if (e.key === 'Escape') {
      e.preventDefault();
      input.value = '';
    }
  });

  // Test hook for end-to-end runs: exposes the current answer only when ?e2e is in the URL.
  if (new URLSearchParams(location.search).has('e2e')) {
    (window as unknown as { __mm: unknown }).__mm = { answer: () => session.current?.answer, session };
  }

  return {
    el,
    title: drillName(spec),
    mounted() {
      app.art?.pause();
      document.body.classList.add('drilling');
      session.start();
      paintLevel();
      showProblem();
      paintStats();
      timer = window.setInterval(paintStats, 100);
      addEventListener('resize', fitProblem);
    },
    destroy() {
      removeEventListener('resize', fitProblem);
      clearInterval(timer);
      clearTimeout(feedbackTimer);
      document.body.classList.remove('drilling');
      app.art?.resume();
    },
  };
}
