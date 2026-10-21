import { deltaLabel, ratingLabel } from '../drill/rating';
import { specToHash } from '../drill/spec';
import type { DrillSpec, RunRecord } from '../drill/types';
import { modeLabel, pct, scoreText, secs } from '../share/draw';
import { store } from '../storage/store';
import { fmt } from '../techniques/util';
import { app } from './context';
import { h, reveal } from './dom';
import { backHref } from './drill';
import { go, type View } from './router';
import { layout } from './shell';

/** Results: the score, the rating change, one line of facts, then the leaderboard and what to review. */
export async function resultsView(parts: string[]): Promise<View> {
  let found: { run: RunRecord; saved: { rank: number | null; isBest: boolean }; spec?: DrillSpec } | null = null;
  if (parts[0]) {
    const run = await store.getRun(parts[0]);
    if (run) {
      const board = run.mode === 'training' ? [] : await store.topRuns(run.drillKey, run.mode);
      const idx = board.findIndex((r) => r.id === run.id);
      found = { run, saved: { rank: idx < 0 ? null : idx + 1, isBest: idx === 0 && app.lastResult?.run.id === run.id && app.lastResult.saved.isBest }, spec: run.spec };
    }
  } else if (app.lastResult) {
    found = app.lastResult;
    // Give the finished run a stable address so reloading the page works.
    history.replaceState(null, '', `#/results/${found.run.id}`);
  }
  if (!found) {
    queueMicrotask(() => go('#/stats'));
    return { el: h('div') };
  }
  const { run, saved, spec } = found;
  const s = scoreText(run);
  const board = run.mode === 'training' ? [] : await store.topRuns(run.drillKey, run.mode);
  const nickname = (await store.getPrefs()).nickname;

  /** Asked once: the name that goes on this device's leaderboard. */
  function nameForm(): HTMLElement {
    const input = h('input', { class: 'name-input', type: 'text', maxlength: '20', placeholder: 'Your name', autocomplete: 'nickname', 'aria-label': 'Your name for the leaderboard', 'data-testid': 'nickname' });
    const form = h('form', { class: 'name-form' }, input, h('button', { class: 'btn ink', type: 'submit' }, 'Save'));
    form.addEventListener('submit', async (e) => {
      e.preventDefault();
      const name = input.value.trim().slice(0, 20);
      if (!name) return;
      await store.setPrefs({ nickname: name });
      await store.nameRuns(name);
      go(location.hash);
    });
    return form;
  }

  // Problems that took more than one try, or were skipped.
  const review = run.log.filter((e) => !e.ok || e.misses);
  const delta = run.ratingDelta ?? 0;
  const facts = [`${pct(run.accuracy)} first try`, `${secs(run.avgMs)} each`];
  if (saved.isBest) facts.unshift('personal best');
  else if (saved.rank) facts.unshift(`#${saved.rank}`);

  const main = reveal(
    h(
      'div',
      { class: 'results', 'data-testid': 'results' },
      h('h1', { class: 'display' }, run.drillName),
      h('p', { class: 'dim result-mode mono' }, modeLabel(run)),
      h(
        'div',
        { class: 'result-hero' },
        h(
          'div',
          { class: 'score' },
          h('div', { class: 'score-line' }, h('span', { class: 'score-num', 'data-testid': 'score' }, s.main), h('span', { class: 'score-suffix' }, s.suffix)),
          h('div', { class: 'score-caption' }, s.caption),
        ),
        run.rating !== undefined
          ? h(
              'div',
              { class: 'agility', 'data-testid': 'rating' },
              h('div', { class: 'agility-label' }, 'Rating'),
              h('div', { class: 'agility-value mono' }, ratingLabel(run.rating), h('span', { class: delta >= 0 ? 'up' : 'down' }, ` ${deltaLabel(delta)}`)),
            )
          : null,
      ),
      h('p', { class: 'result-facts mono' }, facts.join(' · ')),
      spec ? h('a', { class: 'btn primary big block', href: specToHash(spec), 'data-testid': 'again' }, 'Again', h('span', { class: 'arrow' }, '→')) : null,
      board.length
        ? h(
            'section',
            null,
            h('h2', { class: 'section-head' }, 'Leaderboard'),
            nickname ? null : nameForm(),
            h(
              'table',
              { class: 'board', 'data-testid': 'leaderboard' },
              h(
                'tbody',
                null,
                board.map((r, i) =>
                  h(
                    'tr',
                    { class: r.id === run.id ? 'me' : '' },
                    h('td', { class: 'rank' }, String(i + 1)),
                    h('td', { class: 'who' }, r.player ?? '—'),
                    h('td', { class: 'num' }, r.mode === 'twenty' ? secs(r.totalMs) : String(r.correct)),
                  ),
                ),
              ),
            ),
          )
        : null,
      review.length
        ? h(
            'section',
            null,
            h('h2', { class: 'section-head' }, 'Review'),
            h(
              'ul',
              { class: 'misses mono' },
              review.slice(0, 12).map((m) =>
                h('li', null, h('span', null, `${m.text} = `, h('b', null, fmt(m.answer))), h('span', { class: 'dim' }, m.skipped ? 'skipped' : `first: ${m.input}`)),
              ),
            ),
          )
        : null,
    ),
  );

  return {
    el: layout({ active: 'stats', back: spec ? { href: backHref(spec), label: 'Back' } : { href: '#/stats', label: 'Stats' } }, main),
    title: 'Results',
  };
}
