import './styles/theme.css';
import './styles/app.css';
import { startArt } from './art/background';
import { store } from './storage/store';
import { aboutView } from './ui/about';
import { blitzView } from './ui/blitz';
import { matchView } from './ui/match';
import { accountView, boardView, playView } from './ui/play';
import { online, session, takeAfterSignIn } from './net/online';
import { cardView } from './ui/card';
import { chainView } from './ui/chain';
import { app } from './ui/context';
import { drillView } from './ui/drill';
import { learnView } from './ui/learn';
import { resultsView } from './ui/results';
import { settingsView } from './ui/settings';
import { statsView } from './ui/stats';
import { homeView } from './ui/home';
import { challengeView, trainView } from './ui/practice';
import { startRouter } from './ui/router';

app.art = startArt(document.getElementById('art')!);

// Back from a sign-in link: let Supabase read the code from the URL, then go where the player was headed.
const signIn = online && new URLSearchParams(location.search).has('code') ? session().catch(() => null) : Promise.resolve(null);

Promise.all([store.getPrefs(), signIn]).then(([p, s]) => {
  if (s) {
    history.replaceState(null, '', location.pathname + (takeAfterSignIn() ?? '#/play'));
  }
  app.art?.setEnabled(p.art);
  startRouter(
    document.getElementById('app')!,
    {
      '': homeView,
      train: trainView,
      challenge: challengeView,
      chains: chainView,
      learn: learnView,
      stats: statsView,
      settings: settingsView,
      t: cardView,
      drill: drillView,
      mixed: trainView,
      chain: chainView,
      results: resultsView,
      about: aboutView,
      blitz: blitzView,
      play: playView,
      account: accountView,
      board: boardView,
      match: matchView,
    },
    homeView,
  );
});
