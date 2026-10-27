// WCAG contrast for every text/background and control/background pairing in the
// "Midnight" palette. Text needs 4.5:1 (AA, normal size); non-text UI boundaries,
// focus indicators and checkbox edges need 3:1. --faint and the hairline borders
// are decorative only (they never carry information) and are not asserted.
const lum = (hex) => {
  const [r, g, b] = [1, 3, 5].map((i) => parseInt(hex.slice(i, i + 2), 16) / 255).map((c) => (c <= 0.03928 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4));
  return 0.2126 * r + 0.7152 * g + 0.0722 * b;
};
const ratio = (a, b) => { const [x, y] = [lum(a), lum(b)].sort((p, q) => q - p); return (x + 0.05) / (y + 0.05); };

import { readFileSync } from 'node:fs';
const css = readFileSync(new URL('../src/styles.css', import.meta.url), 'utf8');
const token = (name) => { const m = css.match(new RegExp(`--${name}:\\s*(#[0-9A-Fa-f]{6})`)); if (!m) throw new Error(`token --${name} not found in styles.css`); return m[1].toUpperCase(); };
const T = Object.fromEntries(
  ['bg', 'bg-elev', 'surface', 'surface-2', 'surface-3', 'text', 'text-2', 'muted', 'primary', 'on-primary', 'accent', 'heart', 'danger', 'danger-bg', 'good', 'warn', 'input-border', 'focus', 'ink', 'ink-2'].map((n) => [n, token(n)]),
);
// Literal tints that live in rules rather than tokens: they must really be in the stylesheet.
const L = { warnChip: '#2A1810', goodChip: '#10241A', lockChip: '#1F1B13', heartChip: '#2A161B', errorBg: '#2A1214', errorText: '#FFB4AE', demoText: '#EADFC9', demoBg: '#17140E', noteBg: '#1C1910', porcelainLow: '#E8E5DE', recentTile: '#17181B', dockField: '#0F1012' };
for (const hex of Object.values(L)) if (!css.toUpperCase().includes(hex)) throw new Error(`${hex} is no longer used in styles.css; update this script`);

const pairs = [
  // [label, foreground, background, required ratio]
  ...['bg', 'bg-elev', 'surface', 'surface-2', 'surface-3'].map((b) => [`text on ${b}`, T.text, T[b], 4.5]),
  ...['bg', 'surface', 'surface-2'].map((b) => [`secondary text on ${b}`, T['text-2'], T[b], 4.5]),
  ...['bg', 'bg-elev', 'surface', 'surface-2', 'surface-3'].map((b) => [`muted text on ${b}`, T.muted, T[b], 4.5]),
  ...['bg', 'surface', 'surface-2', 'surface-3'].map((b) => [`accent (links, icons, protected) on ${b}`, T.accent, T[b], 4.5]),
  ['accent on protected-card tint', T.accent, L.demoBg, 4.5], ['accent on protected chip', T.accent, L.lockChip, 4.5],
  ['heart ("required", due soon) on bg', T.heart, T.bg, 4.5], ['heart on surface', T.heart, T.surface, 4.5], ['heart chip', T.heart, L.heartChip, 4.5],
  ['danger text on bg', T.danger, T.bg, 4.5], ['danger text on surface', T.danger, T.surface, 4.5], ['danger text on quiet button', T.danger, T['surface-2'], 4.5],
  ['primary button text', T['on-primary'], T.primary, 4.5], ['danger button text', '#FFFFFF', T['danger-bg'], 4.5],
  ['overdue chip', T.warn, L.warnChip, 4.5], ['done chip', T.good, L.goodChip, 4.5],
  ['error note text', L.errorText, L.errorBg, 4.5], ['duplicate hint on surface', L.errorText, T.surface, 4.5], ['save alert text', T.text, L.errorBg, 4.5],
  ['demo banner text', L.demoText, L.demoBg, 4.5], ['warning note text', L.demoText, L.noteBg, 4.5],
  ['placeholder on search field', T.muted, T.surface, 4.5], ['placeholder on input', T.muted, T.bg, 4.5],
  ['input border on bg', T['input-border'], T.bg, 3], ['input border on surface (forms)', T['input-border'], T.surface, 3],
  ['focus ring on bg', T.focus, T.bg, 3], ['focus ring on surface', T.focus, T.surface, 3], ['focus ring on surface-2', T.focus, T['surface-2'], 3],
  // List tiles: the porcelain gradient is checked at its darkest stop; the charcoal one at its lightest.
  ['tile name on porcelain', T.ink, L.porcelainLow, 4.5], ['tile details on porcelain', T['ink-2'], L.porcelainLow, 4.5], ['add button icon on porcelain', T['on-primary'], L.porcelainLow, 3],
  ['recently used name', T['text-2'], L.recentTile, 4.5], ['recently used details', T.muted, L.recentTile, 4.5],
  ['dock placeholder', T.muted, L.dockField, 4.5], ['dock field border', T['input-border'], L.dockField, 3], ['dock duplicate hint', L.errorText, T.bg, 4.5],
  ['unchecked circle on surface', T.muted, T.surface, 3], ['checked circle on surface', T.primary, T.surface, 3], ['toggle accent on surface', T.accent, T.surface, 3],
];
let failed = 0;
for (const [label, fg, bg, need] of pairs) {
  const r = ratio(fg, bg);
  const pass = r >= need;
  if (!pass) failed++;
  console.log(`${pass ? 'PASS' : 'FAIL'}  ${r.toFixed(2).padStart(5)}:1  (need ${need})  ${label}`);
}
console.log(`\n${pairs.length - failed}/${pairs.length} pairs pass`);
process.exit(failed ? 1 : 0);
