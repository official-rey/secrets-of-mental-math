const icon = (d: string) => `<svg viewBox="0 0 24 24" aria-hidden="true">${d}</svg>`;

export const ICONS = {
  back: icon('<path d="M15 5l-7 7 7 7"/>'),
  close: icon('<path d="M6 6l12 12M18 6L6 18"/>'),
  soundOn: icon('<path d="M4 9v6h4l5 4V5L8 9H4z"/><path d="M16.5 8.5a5 5 0 0 1 0 7M19 6a8.5 8.5 0 0 1 0 12"/>'),
  soundOff: icon('<path d="M4 9v6h4l5 4V5L8 9H4z"/><path d="M17 9l5 5M22 9l-5 5"/>'),
  train: icon('<circle cx="12" cy="12" r="8.5"/><path d="M10 8.5l5 3.5-5 3.5z"/>'),
  learn: icon('<path d="M4 5.5C6.5 4.5 9.5 4.5 12 6c2.5-1.5 5.5-1.5 8-.5V19c-2.5-1-5.5-1-8 .5-2.5-1.5-5.5-1.5-8-.5z"/><path d="M12 6v13.5"/>'),
  stats: icon('<path d="M4 20h16"/><path d="M7 16v-5M12 16V6M17 16v-8"/>'),
  settings: icon('<path d="M4 7h10M18 7h2M4 17h4M12 17h8"/><circle cx="16" cy="7" r="2"/><circle cx="10" cy="17" r="2"/>'),
  challenge: icon('<circle cx="12" cy="13.5" r="7.5"/><path d="M12 13.5V9.5M10 3h4M18.5 6.5l1.5-1.5"/>'),
  chains: icon('<path d="M10 14a4 4 0 0 0 5.66 0l3-3a4 4 0 0 0-5.66-5.66l-1 1"/><path d="M14 10a4 4 0 0 0-5.66 0l-3 3a4 4 0 0 0 5.66 5.66l1-1"/>'),
  info: icon('<circle cx="12" cy="12" r="9"/><path d="M12 11v6M12 7.5v.5"/>'),
  pause: icon('<path d="M9 6v12M15 6v12"/>'),
  versus: icon('<path d="M4 4l7 7M4 8V4h4M20 4l-7 7M20 8V4h-4"/><path d="M7 17l-3 3M17 17l3 3"/><path d="M5.5 13.5l5 5M18.5 13.5l-5 5"/>'),
  play: icon('<path d="M8 5.5l11 6.5-11 6.5z"/>'),
  skip: icon('<path d="M6 6l7 6-7 6zM16 6v12"/>'),
  hint: icon('<path d="M9 18h6M10 21h4"/><path d="M12 3a6 6 0 0 0-3.5 10.9c.6.5 1 1.2 1 2.1h5c0-.9.4-1.6 1-2.1A6 6 0 0 0 12 3z"/>'),
  backspace: icon('<path d="M9 5h11v14H9l-6-7z"/><path d="M12.5 9.5l5 5M17.5 9.5l-5 5"/>'),
  shuffle: icon('<path d="M3 7h3.5c4 0 6 10 10 10H21M3 17h3.5c1.6 0 2.8-1.6 3.8-3.6M13.7 9.6C14.7 8 15.6 7 16.5 7H21"/><path d="M18.5 4.5L21 7l-2.5 2.5M18.5 14.5L21 17l-2.5 2.5"/>'),
  eye: icon('<path d="M2.5 12S6 5.5 12 5.5 21.5 12 21.5 12 18 18.5 12 18.5 2.5 12 2.5 12z"/><circle cx="12" cy="12" r="2.5"/>'),
};
