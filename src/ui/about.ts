import { h, reveal } from './dom';
import type { View } from './router';
import { layout } from './shell';

export function aboutView(): View {
  const main = reveal(
    h(
      'div',
      null,
      h('h1', { class: 'display' }, 'About'),
      h('p', { class: 'prose' }, 'A trainer for arithmetic in your head. Learn a technique from its worked steps, drill it, then test it against the clock.'),
      h(
        'ul',
        { class: 'prose about-facts' },
        h('li', null, 'Problems are generated on the spot; answers are whole numbers wherever the method allows.'),
        h('li', null, 'Timed runs adjust a rating (Elo), weighted by each problem’s level.'),
        h('li', null, 'No account. Scores and settings stay on this device.'),
      ),
      h('p', { class: 'prose dim' }, 'Techniques adapted from A. T. Benjamin, The Secrets of Mental Math, and the Vedic mathematics tradition, with number theory, trigonometry and other topics beyond the book.'),
      h('p', { class: 'prose dim' }, 'Rey S., BS Mathematics, Central Mindanao University.'),
    ),
  );
  return { el: layout({ active: 'settings', back: { href: '#/settings', label: 'Settings' } }, main), title: 'About' };
}
