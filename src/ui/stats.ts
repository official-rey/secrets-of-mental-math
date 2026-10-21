import { chainSource } from '../chain/generator';
import { MODES, type RunRecord } from '../drill/types';
import { pct, scoreText, secs } from '../share/draw';
import { store } from '../storage/store';
import { getTechnique } from '../techniques/registry';
import { h, reveal } from './dom';
import type { View } from './router';
import { layout } from './shell';

import { ROMAN } from '../techniques/types';

interface TechStat {
  id: string;
  name: string;
  attempts: number;
  correct: number;
  ms: number;
}

/** Per-technique totals across every logged problem in history. */
function byTechnique(runs: RunRecord[]): TechStat[] {
  const map = new Map<string, TechStat>();
  for (const r of runs) {
    for (const e of r.log) {
      if (!e.technique) continue;
      let s = map.get(e.technique);
      if (!s) {
        const name = e.technique.startsWith('chain') ? chainSource.name : getTechnique(e.technique)?.meta.name;
        if (!name) continue;
        s = { id: e.technique, name, attempts: 0, correct: 0, ms: 0 };
        map.set(e.technique, s);
      }
      s.attempts++;
      if (e.ok && !e.misses) s.correct++;
      s.ms += e.ms;
    }
  }
  return [...map.values()].sort((a, b) => b.attempts - a.attempts);
}

const runLabel = (r: RunRecord) => `${MODES.find((m) => m.id === r.mode)!.label} · ${ROMAN[r.level]}`;

function runRow(r: RunRecord, extra?: string): HTMLElement {
  const s = scoreText(r);
  return h(
    'a',
    { class: 'menu-row', href: `#/results/${r.id}` },
    h(
      'span',
      { class: 'menu-text' },
      h('span', { class: 'menu-title' }, r.drillName),
      h('span', { class: 'menu-desc mono' }, extra ? `${runLabel(r)} · ${extra}` : runLabel(r)),
    ),
    h('span', { class: 'menu-score mono' }, `${s.main}${s.suffix}`),
  );
}

export async function statsView(): Promise<View> {
  const runs = await store.history();
  const bests = await store.bests();

  if (!runs.length) {
    return {
      el: layout(
        { active: 'stats' },
        h('h1', { class: 'display' }, 'Stats'),
        h('p', { class: 'lede' }, 'No runs yet.'),
        h('a', { class: 'btn primary block', href: '#/train' }, 'Train', h('span', { class: 'arrow' }, '→')),
      ),
      title: 'Stats',
    };
  }

  const answered = runs.reduce((a, r) => a + r.attempted, 0);
  const correct = runs.reduce((a, r) => a + r.accuracy * r.attempted, 0);
  const ms = runs.reduce((a, r) => a + r.avgMs * r.attempted, 0);
  const techs = byTechnique(runs);

  const content = reveal(
    h(
      'div',
      null,
      h('h1', { class: 'display' }, 'Stats'),
      h(
        'dl',
        { class: 'stats four', 'data-testid': 'totals' },
        h('div', null, h('dt', { class: 'kicker' }, 'Runs'), h('dd', null, String(runs.length))),
        h('div', null, h('dt', { class: 'kicker' }, 'Answered'), h('dd', null, String(answered))),
        h('div', null, h('dt', { class: 'kicker' }, 'Accuracy'), h('dd', null, pct(answered ? correct / answered : 0))),
        h('div', null, h('dt', { class: 'kicker' }, 'Avg time'), h('dd', null, secs(answered ? ms / answered : 0))),
      ),
      techs.length
        ? h(
            'section',
            null,
            h('h2', { class: 'section-head' }, 'By technique'),
            h(
              'ul',
              { class: 'tech-stats' },
              techs.map((t) => {
                const acc = t.correct / t.attempts;
                const weak = t.attempts >= 5 && acc < 0.8;
                return h(
                  'li',
                  null,
                  h(
                    'a',
                    { href: t.id.startsWith('chain') ? '#/chain' : `#/t/${t.id}` },
                    h('span', { class: 'ts-name' }, t.name, weak ? h('span', { class: 'badge tier-advanced' }, 'Practise') : null),
                    h('span', { class: 'ts-bar', 'aria-hidden': 'true' }, h('i', { style: { width: pct(acc) } })),
                    h('span', { class: 'ts-num mono' }, `${pct(acc)} · ${secs(t.ms / t.attempts)} · ${t.attempts}×`),
                  ),
                );
              }),
            ),
          )
        : null,
      bests.length
        ? h('section', null, h('h2', { class: 'section-head' }, 'Personal bests'), h('div', { class: 'menu' }, bests.slice(0, 12).map((r) => runRow(r))))
        : null,
      h(
        'section',
        null,
        h('h2', { class: 'section-head' }, 'Recent runs'),
        h(
          'div',
          { class: 'menu' },
          runs.slice(0, 15).map((r) => runRow(r, new Date(r.date).toLocaleDateString(undefined, { month: 'short', day: 'numeric' }))),
        ),
      ),
    ),
  );

  return { el: layout({ active: 'stats' }, content), title: 'Stats' };
}
