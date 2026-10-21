import { store } from '../storage/store';
import { byCategory, techniques } from '../techniques/registry';
import type { CategoryId, Technique, Tier } from '../techniques/types';
import { cardBody } from './card';
import { h } from './dom';
import type { View } from './router';
import { layout } from './shell';

/** Learn's tabs: Featured (the handful worth learning first), then every group. */
export type LearnTab = CategoryId | 'featured';

const SHORT: Record<LearnTab, { label: string; glyph: string }> = {
  featured: { label: 'Featured', glyph: '★' },
  addsub: { label: 'Add & subtract', glyph: '±' },
  mul: { label: 'Multiply', glyph: '×' },
  div: { label: 'Divide', glyph: '÷' },
  pow: { label: 'Powers & roots', glyph: '√' },
  est: { label: 'Estimate & check', glyph: '≈' },
  higher: { label: 'Higher math', glyph: 'Σ' },
};

const TIERS: Tier[] = ['Foundation', 'Core', 'Advanced'];

/**
 * Learn only teaches: techniques by group, each opening in place with its idea, a worked
 * example and a picture, plus one button to train it. Choosing what to practise is Train's job.
 */
export async function learnView(parts: string[]): Promise<View> {
  const prefs = await store.getPrefs();
  const groups: { id: LearnTab; name: string; items: Technique[] }[] = [
    { id: 'featured', name: 'Featured', items: techniques.filter((t) => t.meta.featured) },
    ...byCategory(),
  ];
  const known = new Set(techniques.map((t) => t.meta.id));
  let current: LearnTab =
    groups.find((g) => g.id === parts[0])?.id ?? (groups.some((g) => g.id === prefs.learnCategory) ? prefs.learnCategory : groups[0].id);
  let openId: string | null = parts[1] && known.has(parts[1]) ? parts[1] : null;

  const list = h('div', { class: 'learn-list' });

  const chips = groups.map((g) =>
    h(
      'button',
      { type: 'button', class: 'chip', role: 'tab', 'data-cat': g.id, onclick: () => select(g.id) },
      h('span', { class: 'chip-glyph', 'aria-hidden': 'true' }, SHORT[g.id].glyph),
      h('span', null, SHORT[g.id].label),
    ),
  );

  function row(t: Technique, n: number): HTMLElement {
    const id = t.meta.id;
    const bodyId = `learn-${id}`;
    const body = h('div', { class: 'tech-body', id: bodyId, hidden: true });
    const head = h(
      'button',
      { type: 'button', class: 'tech-head', 'aria-expanded': 'false', 'aria-controls': bodyId, 'data-testid': `open-${id}` },
      h('span', { class: 'num' }, String(n).padStart(2, '0')),
      h('span', { class: 'tech-text' }, h('span', { class: 'name' }, t.meta.name)),
      h('span', { class: 'chev', 'aria-hidden': 'true' }),
    );
    head.addEventListener('click', () => toggle(id));
    return h('li', { class: 'tech', 'data-id': id }, head, body);
  }

  function toggle(id: string, force?: boolean, scroll = false) {
    const open = force ?? openId !== id;
    // One technique open at a time.
    list.querySelectorAll<HTMLElement>('li.tech').forEach((li) => {
      const isThis = li.dataset.id === id && open;
      const head = li.querySelector('.tech-head')!;
      const body = li.querySelector<HTMLElement>('.tech-body')!;
      head.setAttribute('aria-expanded', String(isThis));
      li.classList.toggle('open', isThis);
      if (isThis && !body.firstChild) {
        const t = techniques.find((x) => x.meta.id === id)!;
        body.append(h('p', { class: 'tech-idea' }, t.meta.idea), cardBody(t, prefs.level));
      }
      body.hidden = !isThis;
      if (isThis && scroll) requestAnimationFrame(() => li.scrollIntoView({ block: 'start', behavior: 'smooth' }));
    });
    openId = open ? id : null;
    history.replaceState(null, '', `#/learn/${current}${openId ? `/${openId}` : ''}`);
  }

  function paint() {
    const g = groups.find((x) => x.id === current)!;
    chips.forEach((c) => c.setAttribute('aria-selected', String(c.dataset.cat === current)));
    let n = 0;
    // Featured is one short list, in the order worth learning; the groups split by tier.
    if (current === 'featured') {
      list.replaceChildren(h('ol', { class: 'tech-list featured', 'data-testid': 'featured-list' }, g.items.map((t) => row(t, ++n))));
      return;
    }
    list.replaceChildren(
      ...TIERS.map((tier) => {
        const items = g.items.filter((t) => t.meta.tier === tier);
        if (!items.length) return null;
        return h(
          'section',
          { class: 'tier-group' },
          h('h3', { class: `tier-head badge tier-${tier.toLowerCase()}` }, tier),
          h('ol', { class: 'tech-list' }, items.map((t) => row(t, ++n))),
        );
      }).filter((x): x is HTMLElement => !!x),
    );
  }

  function select(id: LearnTab) {
    current = id;
    openId = null;
    store.setPrefs({ learnCategory: id });
    history.replaceState(null, '', `#/learn/${id}`);
    paint();
  }

  paint();

  const content = h(
    'div',
    null,
    h('h1', { class: 'display' }, 'Learn'),
    h('div', { class: 'chips', role: 'tablist', 'aria-label': 'Technique groups' }, chips),
    list,
  );

  return {
    el: layout({ active: 'learn' }, content),
    title: 'Learn',
    mounted() {
      if (openId) toggle(openId, true, true);
    },
  };
}
