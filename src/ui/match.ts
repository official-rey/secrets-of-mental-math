import { BLITZ_MS } from '../blitz/problems';
import * as net from '../net/online';
import { blitzPlayer, enterDrill, leaveDrill, wantsPad, type BlitzPlayer } from './blitz';
import { h } from './dom';
import { ICONS } from './icons';
import { go, type View } from './router';

const wait = (ms: number) => new Promise((r) => setTimeout(r, ms));

/**
 * A rated match: find an opponent, count down together, race the same 120 seconds of
 * problems while each sees the other's score, then settle the ratings on the server.
 */
export async function matchView(): Promise<View> {
  const me = net.online ? await net.myProfile().catch(() => null) : null;
  const usePad = await wantsPad();
  const host = h('div', { class: 'blitz-host', 'data-testid': 'match' });
  let alive = true, searching = false, player: BlitzPlayer | null = null, race: ReturnType<typeof net.raceChannel> | null = null;

  /** A plain full-screen card in the drill frame, for the stages around the race. */
  const card = (title: string, ...body: (Node | null)[]) =>
    h(
      'div',
      { class: 'drill' },
      h('header', { class: 'drill-bar' }, h('a', { class: 'iconbtn', href: '#/play', 'aria-label': 'Leave', html: ICONS.close }), h('div', { class: 'drill-title' }, title)),
      h('main', { class: 'drill-stage' }, h('div', { class: 'blitz-result' }, ...body)),
    );

  const failed = (e: unknown) => host.replaceChildren(card('Match', h('p', { class: 'error' }, (e as Error).message), h('a', { class: 'btn block', href: '#/play' }, 'Back')));

  async function search() {
    searching = true;
    const t0 = Date.now();
    const clock = h('p', { class: 'dim mono' }, '0 s');
    host.replaceChildren(card('Match', h('p', null, 'Looking for an opponent'), clock, h('a', { class: 'btn block', href: '#/play', 'data-testid': 'cancel' }, 'Cancel')));
    while (alive) {
      const id = await net.findMatch();
      if (id) {
        searching = false;
        return id;
      }
      clock.textContent = `${Math.round((Date.now() - t0) / 1000)} s`;
      await wait(2000);
    }
    return null;
  }

  async function play(id: string) {
    const m = await net.matchView(id);
    if (!m || !alive) return;
    // Local time of the start, corrected by how far this device's clock is from the server's.
    const skew = Date.parse(m.server_now) - Date.now();
    const startAt = Date.parse(m.starts_at) - skew;

    const count = h('div', { class: 'blitz-final mono' }, '');
    host.replaceChildren(card('Match', h('p', null, `${me!.username} (${m.me_rating})`), h('p', { class: 'dim mono' }, 'vs'), h('p', null, `${m.them_name} (${m.them_rating})`), count));
    while (alive && Date.now() < startAt) {
      count.textContent = String(Math.ceil((startAt - Date.now()) / 1000));
      await wait(100);
    }
    if (!alive) return;

    const theirs = h('div', { class: 'drill-stat mono them', 'data-testid': 'them' }, `${m.them_name} 0`);
    race = net.raceChannel(id, me!.id, (s) => (theirs.textContent = `${m.them_name} ${s}`));
    const score = await new Promise<number>((done) => {
      player = blitzPlayer({ seed: Number(m.seed), usePad, title: 'Match', back: '#/play', extra: theirs, onScore: (s) => race?.send(s), onEnd: done });
      host.replaceChildren(player.el);
      // Join late (a slow device, a reload) and the clock is already running.
      player.start(Math.max(0, Date.now() - startAt));
    });
    player?.el.querySelector('.dock')?.remove();
    player?.stage.replaceChildren(h('div', { class: 'blitz-result' }, h('p', { class: 'dim mono' }, `${score} · waiting for ${m.them_name}`)));

    // Send the score (retrying while the server still thinks the clock is running), then
    // wait for the other score, or for the grace period after which a missing score is 0.
    const endsAt = startAt + BLITZ_MS;
    for (let tries = 0; alive && tries < 10; tries++) {
      try {
        await net.submitMatch(id, score);
        break;
      } catch (e) {
        if (!/still running/.test((e as Error).message)) throw e;
        await wait(1000);
      }
    }
    let r = await net.matchView(id);
    while (alive && r && !r.done) {
      await wait(1500);
      if (Date.now() > endsAt + 31_000) await net.submitMatch(id, null).catch(() => {});
      r = await net.matchView(id);
    }
    race?.close();
    race = null;
    if (!alive || !r) return;

    const mine = r.me_score ?? 0, other = r.them_score ?? 0;
    const verdict = mine > other ? 'Won' : mine < other ? 'Lost' : 'Drawn';
    const delta = r.me_delta ?? 0;
    player?.stage.replaceChildren(
      h(
        'div',
        { class: 'blitz-result', 'data-testid': 'match-result' },
        h('p', { class: 'mono' }, verdict),
        h('div', { class: 'blitz-final mono' }, `${mine}–${other}`),
        h('p', { class: 'dim mono' }, `Rating ${m.me_rating + delta} (${delta >= 0 ? '+' : '−'}${Math.abs(delta)})`),
        h('button', { class: 'btn primary big block', type: 'button', 'data-testid': 'rematch', onclick: () => go('#/match') }, 'Next match', h('span', { class: 'arrow' }, '→')),
        h('a', { class: 'btn block', href: '#/play' }, 'Done'),
      ),
    );
  }

  return {
    el: host,
    title: 'Match',
    mounted() {
      if (!me?.username) return go('#/account');
      enterDrill();
      search()
        .then((id) => (id ? play(id) : undefined))
        .catch(failed);
    },
    destroy() {
      alive = false;
      player?.destroy();
      race?.close();
      if (searching) void net.leaveQueue();
      leaveDrill();
    },
  };
}
