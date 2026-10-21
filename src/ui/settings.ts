import { store, type KeypadPref } from '../storage/store';
import { app } from './context';
import { segmented } from './controls';
import { h, reveal } from './dom';
import type { View } from './router';
import { layout } from './shell';

function row(label: string, desc: string | null, control: HTMLElement): HTMLElement {
  return h(
    'div',
    { class: 'setting' },
    h('div', { class: 'setting-text' }, h('div', { class: 'setting-label' }, label), desc ? h('div', { class: 'setting-desc' }, desc) : null),
    control,
  );
}

/** Leaderboard name; saved as you type, and put on earlier unnamed runs. */
function nameField(value: string): HTMLElement {
  const input = h('input', { class: 'name-input', type: 'text', maxlength: '20', placeholder: 'Your name', value, autocomplete: 'nickname', 'aria-label': 'Name', 'data-testid': 'settings-name' });
  input.addEventListener('change', async () => {
    const name = input.value.trim().slice(0, 20);
    await store.setPrefs({ nickname: name || undefined });
    if (name) await store.nameRuns(name);
  });
  return input;
}

const onOff = (name: string, value: boolean, set: (v: boolean) => void) =>
  segmented(name, [{ value: 'on', label: 'On' }, { value: 'off', label: 'Off' }], value ? 'on' : 'off', (v) => set(v === 'on'));

export async function settingsView(): Promise<View> {
  const p = await store.getPrefs();
  const status = h('span', { class: 'setting-desc', 'aria-live': 'polite' });

  const erase = h('button', { class: 'btn', type: 'button', 'data-testid': 'erase' }, 'Erase runs');
  erase.addEventListener('click', async () => {
    if (!confirm('Erase every run, personal best and leaderboard on this device? Settings stay.')) return;
    await store.clearRuns();
    status.textContent = 'Runs and bests erased.';
  });

  const content = reveal(
    h(
      'div',
      null,
      h('h1', { class: 'display' }, 'Settings'),
      row('Name', null, nameField(p.nickname ?? '')),
      h('h2', { class: 'section-head' }, 'Drills'),
      row(
        'Number pad',
        null,
        segmented<KeypadPref>(
          'Number pad',
          [
            { value: 'auto', label: 'Auto' },
            { value: 'on', label: 'On' },
            { value: 'off', label: 'Off' },
          ],
          p.keypad,
          (keypad) => store.setPrefs({ keypad }),
        ),
      ),
      row('Vibration', null, onOff('Vibration', p.haptics, (haptics) => store.setPrefs({ haptics }))),
      h('h2', { class: 'section-head' }, 'Display'),
      row(
        'Math art',
        null,
        onOff('Math art', p.art, (art) => {
          store.setPrefs({ art });
          app.art?.setEnabled(art);
        }),
      ),
      h('h2', { class: 'section-head' }, 'Data'),
      row('Runs and bests', null, erase),
      status,
      h('h2', { class: 'section-head' }, 'About'),
      h('a', { class: 'menu-row', href: '#/about', 'data-testid': 'about-link' }, h('span', { class: 'menu-title' }, 'About'), h('span', { class: 'arrow' }, '→')),
    ),
  );

  return { el: layout({ active: 'settings' }, content), title: 'Settings' };
}
