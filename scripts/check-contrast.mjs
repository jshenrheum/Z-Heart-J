// WCAG contrast check for every text/background and control/background pairing the CSS uses.
// Text needs 4.5:1 (AA, normal size); non-text UI boundaries and focus indicators need 3:1.
// Gold (#B59A64) is decorative only (bullets, chevrons, rules) and is deliberately not asserted here.
const lum = (hex) => {
  const [r, g, b] = [1, 3, 5].map((i) => parseInt(hex.slice(i, i + 2), 16) / 255).map((c) => (c <= 0.03928 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4));
  return 0.2126 * r + 0.7152 * g + 0.0722 * b;
};
const ratio = (a, b) => { const [x, y] = [lum(a), lum(b)].sort((p, q) => q - p); return (x + 0.05) / (y + 0.05); };

import { readFileSync } from 'node:fs';
const css = readFileSync(new URL('../src/styles.css', import.meta.url), 'utf8');
const token = (name) => { const m = css.match(new RegExp(`--${name}:\\s*(#[0-9A-Fa-f]{6})`)); if (!m) throw new Error(`token --${name} not found in styles.css`); return m[1].toUpperCase(); };
const T = {
  bg: token('bg'), surface: token('surface'), primary: token('primary'), sage: token('sage'), heart: token('heart'), text: token('text'), muted: token('muted'),
  onPrimary: token('on-primary'), danger: token('danger'), warnBg: token('warn-bg'), inputBorder: token('input-border'),
};
// Literal chip/note colours that live in rules rather than tokens: they must really be in the stylesheet.
for (const hex of ['#7A2E1F', '#1F5A33', '#DDEBDD', '#5A4E2C', '#EEEBE2', '#4D4222', '#F4F1E8', '#F3E6E8']) if (!css.toUpperCase().includes(hex.toUpperCase())) throw new Error(`${hex} is no longer used in styles.css; update this script`);
const pairs = [
  // [label, foreground, background, required ratio]
  ['body text on page', T.text, T.bg, 4.5], ['body text on card', T.text, T.surface, 4.5],
  ['muted text on page', T.muted, T.bg, 4.5], ['muted text on card', T.muted, T.surface, 4.5], ['muted text on sage (chips/segments)', T.muted, T.sage, 4.5],
  ['headings/primary on page', T.primary, T.bg, 4.5], ['primary on card', T.primary, T.surface, 4.5], ['primary on sage (chip, active nav)', T.primary, T.sage, 4.5],
  ['button text on primary', T.onPrimary, T.primary, 4.5], ['toast/danger button text on danger', T.onPrimary, T.danger, 4.5],
  ['"required" label (heart) on page', T.heart, T.bg, 4.5], ['"required" label (heart) on card', T.heart, T.surface, 4.5], ['heart chip', T.heart, '#F3E6E8', 4.5],
  ['danger text on page', T.danger, T.bg, 4.5], ['danger text on card', T.danger, T.surface, 4.5],
  ['warning chip', '#7A2E1F', T.warnBg, 4.5], ['warning note (inline error)', '#7A2E1F', '#F6E8E2', 4.5],
  ['success chip', '#1F5A33', '#DDEBDD', 4.5], ['protected chip', '#5A4E2C', '#EEEBE2', 4.5], ['protected value on card', '#5A4E2C', T.surface, 4.5],
  ['protected card heading', '#4D4222', '#F4F1E8', 4.5], ['duplicate-item hint', '#7A2E1F', T.surface, 4.5], ['duplicate-item hint on page', '#7A2E1F', T.bg, 4.5],
  ['placeholder text (muted) on input', T.muted, T.surface, 4.5],
  ['input border on card', T.inputBorder, T.surface, 3], ['input border on page', T.inputBorder, T.bg, 3],
  ['focus ring on page', T.primary, T.bg, 3], ['focus ring on card', T.primary, T.surface, 3], ['focus ring on sage', T.primary, T.sage, 3],
  ['unchecked circle (primary) on card', T.primary, T.surface, 3],
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
