import { heroPlate } from '../art/hero';
import { store } from '../storage/store';
import { APP_NAME } from '../theme';
import { h, reveal } from './dom';
import { ICONS } from './icons';
import type { View } from './router';
import { layout, SECTIONS } from './shell';

/** Home: the name, one line on what it is, the four sections, and one drawing. Nothing else. */
export async function homeView(): Promise<View> {
  const prefs = await store.getPrefs();
  const plate = prefs.art ? heroPlate() : null;

  const content = reveal(
    h(
      'div',
      { class: 'landing' },
      h(
        'section',
        { class: 'first-screen', 'data-testid': 'first-screen' },
        h('h1', { class: 'display' }, APP_NAME),
        h('p', { class: 'lede dim' }, 'Techniques, drills and timed sets for arithmetic in your head.'),
        h(
          'div',
          { class: 'actions' },
          SECTIONS.map((sec) =>
            h(
              'a',
              { class: 'btn block mode-btn', href: sec.href, 'data-testid': `home-${sec.id}` },
              h('span', { class: 'mode-icon', html: ICONS[sec.icon] }),
              h('span', { class: 'mode-label' }, sec.label),
              h('span', { class: 'arrow' }, '→'),
            ),
          ),
        ),
      ),
      plate ? h('section', { class: 'coda' }, plate.el) : null,
    ),
  );

  return { el: layout({ active: 'home' }, content), destroy: () => plate?.destroy() };
}
