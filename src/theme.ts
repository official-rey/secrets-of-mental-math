/** Palette mirrored from styles/theme.css, for anything drawn on a canvas. */
export const PALETTE = {
  paper: '#F4F6F9',
  raised: '#E9EDF2',
  ink: '#1B2430',
  dim: '#5B6878',
  rule: '#CBD3DD',
  accent: '#2A5785',
  soft: '#DCE5EF',
  ok: '#3D7357',
  bad: '#A2443A',
} as const;

export const FONTS = {
  head: "'Space Grotesk', system-ui, sans-serif",
  prose: "'IBM Plex Sans', system-ui, sans-serif",
  mono: "'IBM Plex Mono', ui-monospace, monospace",
} as const;

export const DEV_CREDIT = 'Rey S.';

/** The app's name: header and page titles. */
export const APP_NAME = 'Secrets of Mental Math';
