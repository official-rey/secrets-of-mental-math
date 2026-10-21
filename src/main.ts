import './styles/theme.css';
import './styles/app.css';
import { startArt } from './art/background';
import { store } from './storage/store';
import { aboutView } from './ui/about';
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

store.getPrefs().then((p) => {
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
    },
    homeView,
  );
});
