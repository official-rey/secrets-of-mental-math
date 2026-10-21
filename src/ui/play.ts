import * as net from '../net/online';
import { store } from '../storage/store';
import { segmented } from './controls';
import { h, reveal } from './dom';
import { go, type View } from './router';
import { layout } from './shell';

const row = (href: string, title: string, desc: string, right: string, testid: string) =>
  h(
    'a',
    { class: 'menu-row', href, 'data-testid': testid },
    h('span', { class: 'menu-text' }, h('span', { class: 'menu-title' }, title), h('span', { class: 'menu-desc mono' }, desc)),
    h('span', { class: 'menu-score mono' }, right),
  );

const offlineNote = () => h('p', { class: 'dim', 'data-testid': 'offline' }, 'Online play is not set up on this copy of the site.');

/** Play: the 120-second test, matches against other players, and the leaderboard. */
export async function playView(): Promise<View> {
  const prefs = await store.getPrefs();
  let me: net.Profile | null = null;
  let error = '';
  try {
    me = await net.myProfile();
  } catch (e) {
    error = (e as Error).message;
  }

  const account = !net.online
    ? offlineNote()
    : me?.username
      ? row('#/account', me.username, `${me.games} matches · ${me.wins} won`, String(me.rating), 'account-row')
      : row('#/account', me ? 'Pick a username' : 'Sign in', 'for matches and the leaderboard', '→', 'account-row');

  const content = reveal(
    h(
      'div',
      null,
      h('h1', { class: 'display' }, 'Play'),
      h('p', { class: 'dim' }, 'Two minutes of + − × ÷. Each answer is taken the moment it is right.'),
      error ? h('p', { class: 'error' }, error) : null,
      h(
        'div',
        { class: 'menu' },
        account,
        row('#/blitz', '120 seconds', 'solo · scores go on the board when signed in', prefs.blitzBest ? String(prefs.blitzBest) : '→', 'play-solo'),
        net.online ? row(me?.username ? '#/match' : '#/account', 'Find a match', 'same problems, same clock · rated', '→', 'play-match') : null,
        net.online ? row('#/board', 'Leaderboard', 'best 120 s · rating', '→', 'play-board') : null,
      ),
    ),
  );
  return { el: layout({ active: 'play' }, content), title: 'Play' };
}

/** Sign in, pick a username, or sign out. */
export async function accountView(): Promise<View> {
  const box = h('div', { class: 'account', 'data-testid': 'account' });
  const msg = h('p', { class: 'dim', role: 'status' });
  const fail = (e: unknown) => {
    msg.textContent = (e as Error).message;
    msg.className = 'error';
  };

  async function paint() {
    if (!net.online) return box.replaceChildren(offlineNote());
    msg.textContent = '';
    msg.className = 'dim';
    let me: net.Profile | null = null;
    try {
      me = await net.myProfile();
    } catch (e) {
      fail(e);
    }

    if (!me) {
      const email = h('input', { class: 'field', type: 'email', placeholder: 'you@example.com', autocomplete: 'email', 'aria-label': 'Email', required: true }) as HTMLInputElement;
      // The Google button shows only once Google sign-in is switched on in the project.
      const google = await net.googleEnabled();
      const form = h(
        'form',
        {
          class: 'stack',
          onsubmit: async (e: Event) => {
            e.preventDefault();
            try {
              await net.signInWithEmail(email.value.trim());
              msg.className = 'dim';
              msg.textContent = `A sign-in link is on its way to ${email.value.trim()}. Open it on this device.`;
            } catch (err) {
              fail(err);
            }
          },
        },
        email,
        h('button', { class: `btn block${google ? '' : ' primary'}`, type: 'submit', 'data-testid': 'email-link' }, 'Email me a sign-in link'),
      );
      box.replaceChildren(form, msg);
      if (google) {
        box.prepend(
          h('button', { class: 'btn primary big block', type: 'button', 'data-testid': 'google', onclick: () => net.signInWithGoogle().catch(fail) }, 'Continue with Google'),
          h('p', { class: 'or dim mono' }, 'or'),
        );
      }
      return;
    }

    const name = h('input', {
      class: 'field mono',
      value: me.username ?? '',
      placeholder: 'username',
      maxlength: 16,
      pattern: '[A-Za-z0-9_]{3,16}',
      autocomplete: 'nickname',
      'aria-label': 'Username',
      'data-testid': 'username',
    }) as HTMLInputElement;
    box.replaceChildren(
      me.username
        ? h('dl', { class: 'facts mono' }, h('dt', null, 'Rating'), h('dd', null, String(me.rating)), h('dt', null, 'Matches'), h('dd', null, `${me.games} · ${me.wins} won`))
        : h('p', null, 'Pick the name other players will see.'),
      h(
        'form',
        {
          class: 'stack',
          onsubmit: async (e: Event) => {
            e.preventDefault();
            try {
              await net.setUsername(name.value.trim());
              await store.setPrefs({ nickname: name.value.trim() });
              go('#/play');
            } catch (err) {
              fail(err);
            }
          },
        },
        h('label', { class: 'control-label' }, 'Username'),
        name,
        h('button', { class: 'btn primary block', type: 'submit', 'data-testid': 'save-username' }, me.username ? 'Rename' : 'Save'),
      ),
      msg,
      h('button', { class: 'btn block quiet', type: 'button', onclick: () => net.signOut().then(() => go('#/play'), fail) }, 'Sign out'),
    );
  }

  const stop = net.onAuthChange(() => void paint());
  await paint();
  return {
    el: layout({ active: 'play', back: { href: '#/play', label: 'Play' } }, reveal(h('div', null, h('h1', { class: 'display' }, 'Account'), box))),
    title: 'Account',
    destroy: stop,
  };
}

type Board = 'all' | 'week' | 'rating';

/** Best 120-second score per player (all time or this week), and match ratings. */
export async function boardView(): Promise<View> {
  let which: Board = 'all';
  const me = net.online ? await net.myProfile().catch(() => null) : null;
  const table = h('div', { class: 'board', 'data-testid': 'board' });

  async function paint() {
    table.replaceChildren(h('p', { class: 'dim mono' }, '…'));
    try {
      const rows =
        which === 'rating'
          ? (await net.topRatings()).map((r) => ({ name: r.username, value: r.rating, note: `${r.games} · ${r.wins} won` }))
          : (await net.topScores(which)).map((r) => ({ name: r.username, value: r.score, note: String(r.rating) }));
      table.replaceChildren(
        rows.length
          ? h(
              'ol',
              { class: 'ranks mono' },
              rows.map((r, i) =>
                h(
                  'li',
                  { class: r.name === me?.username ? 'me' : null },
                  h('span', { class: 'rank' }, String(i + 1)),
                  h('span', { class: 'who' }, r.name),
                  h('span', { class: 'note dim' }, r.note),
                  h('span', { class: 'val' }, String(r.value)),
                ),
              ),
            )
          : h('p', { class: 'dim' }, 'No entries yet.'),
      );
    } catch (e) {
      table.replaceChildren(h('p', { class: 'error' }, (e as Error).message));
    }
  }

  const content = net.online
    ? h(
        'div',
        null,
        h('h1', { class: 'display' }, 'Leaderboard'),
        segmented<Board>('Board', [{ value: 'all', label: 'All time' }, { value: 'week', label: '7 days' }, { value: 'rating', label: 'Rating' }], which, (b) => {
          which = b;
          void paint();
        }),
        table,
      )
    : h('div', null, h('h1', { class: 'display' }, 'Leaderboard'), offlineNote());
  if (net.online) void paint();
  return { el: layout({ active: 'play', back: { href: '#/play', label: 'Play' } }, reveal(content)), title: 'Leaderboard' };
}
