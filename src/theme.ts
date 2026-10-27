// Design token (spec §13). I colori dei pad sono fissi e legati alla posizione.

export const colors = {
  chassis: '#121110',
  panel: '#1d1b19',
  panelBorder: '#2e2a27',
  line: '#3d3833',
  text: '#efe6d6',
  textMuted: '#a89f92',
  textDisabled: '#8a8278',
  ink: '#17130f',
  inkMuted: '#3b3128',
  padRestBase: '#1c1a18',
  led: '#ff3b2f',
  ledOff: '#3a1512',
  danger: '#ff6a5c',
  dangerBg: '#3a1512',
  edit: '#f2a437',
  ok: '#9fd18b',
};

export const PAD_COLORS = [
  '#D9382C', '#E2552F', '#EA7030', '#EF8A33',
  '#F2A437', '#F3BE3E', '#EFD25A', '#E8DC8E',
  '#EEE5C6', '#CDBF9F', '#B0A08A', '#93857A',
];

export const fonts = {
  label: 'BarlowCondensed_700Bold',
  labelMedium: 'BarlowCondensed_500Medium',
  mono: 'IBMPlexMono_400Regular',
  monoMedium: 'IBMPlexMono_500Medium',
  monoBold: 'IBMPlexMono_600SemiBold',
};

export const layout = {
  barHeight: 34,
  sideMargin: 24, // zona dei gesti di sistema e del foro della fotocamera (spec §4.1)
  bottomMargin: 14,
  gridTop: 12,
  gap: 12,
  cols: 4,
  rows: 3,
};

function hexToRgb(h: string): [number, number, number] {
  const v = parseInt(h.slice(1), 16);
  return [(v >> 16) & 255, (v >> 8) & 255, v & 255];
}

/** Miscela lineare tra due colori esadecimali: t = 0 → a, t = 1 → b. */
export function mix(a: string, b: string, t: number): string {
  const x = hexToRgb(a);
  const y = hexToRgb(b);
  return '#' + x.map((xv, i) => Math.round(xv + (y[i] - xv) * t).toString(16).padStart(2, '0')).join('');
}

export const restColor = (padColor: string) => mix(colors.padRestBase, padColor, 0.2);
