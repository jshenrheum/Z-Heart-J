// Generates the standalone brand SVGs and PWA icon PNGs from src/brand/glyphs.json.
// Run: npm run icons   (needs `sharp`; on this workspace: NODE_PATH=/opt/npm-tools/node_modules)
import { createRequire } from 'node:module';
import { readFileSync, writeFileSync, mkdirSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

const require = createRequire(import.meta.url);
const sharp = require('sharp');
const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const g = JSON.parse(readFileSync(join(root, 'src/brand/glyphs.json'), 'utf8'));
const [vx, vy, vw, vh] = g.viewBox.split(' ').map(Number);

const artwork = ({ swash = true, stroke = g.letterStrokeWidth } = {}) => `
  ${swash ? `<path d="${g.swash}" fill="none" stroke="${g.colors.swash}" stroke-width="${g.swashStrokeWidth}" stroke-linecap="round"/>` : ''}
  <g fill="none" stroke="${g.colors.letters}" stroke-width="${stroke}" stroke-linecap="round" stroke-linejoin="round">
    <path d="${g.z}"/><path d="${g.jBar}"/><path d="${g.jStem}"/>
  </g>
  <path fill="${g.colors.heart}" transform="${g.heartTransform}" d="${g.heart}"/>`;

// Full wordmark: transparent background, tight viewBox.
const wordmark = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="${g.viewBox}" role="img" aria-labelledby="t">
  <title id="t">Z heart J</title>${artwork()}
</svg>
`;

// Square monogram: ivory ground, wordmark centred at `scale` of the width.
function square(size, scale, { swash = true, radius = 0, stroke } = {}) {
  const w = size * scale;
  const k = w / vw;
  const h = vh * k;
  const tx = (size - w) / 2 - vx * k;
  const ty = (size - h) / 2 - vy * k + size * 0.012;
  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${size} ${size}" width="${size}" height="${size}">
  <rect width="${size}" height="${size}" rx="${radius}" fill="${g.colors.ivory}"/>
  <g transform="translate(${tx} ${ty}) scale(${k})">${artwork({ swash, stroke })}</g>
</svg>
`;
}

mkdirSync(join(root, 'public/icons'), { recursive: true });
writeFileSync(join(root, 'public/wordmark.svg'), wordmark);
writeFileSync(join(root, 'public/monogram.svg'), square(512, 0.8, { stroke: 7 }));
writeFileSync(join(root, 'public/favicon.svg'), square(64, 0.94, { swash: false, radius: 14, stroke: 10 }));

const png = (svg, file, px) =>
  sharp(Buffer.from(svg), { density: 384 }).resize(px, px).png().toFile(join(root, 'public/icons', file));

await Promise.all([
  png(square(512, 0.8, { stroke: 7 }), 'icon-512.png', 512),
  png(square(512, 0.8, { stroke: 7 }), 'icon-192.png', 192),
  png(square(512, 0.64, { stroke: 8 }), 'icon-maskable-512.png', 512), // content stays inside the 80% safe circle
  png(square(512, 0.64, { stroke: 8 }), 'icon-maskable-192.png', 192),
  png(square(512, 0.8, { swash: false, stroke: 8 }), 'apple-touch-icon.png', 180),
  png(square(64, 0.94, { swash: false, stroke: 10 }), 'favicon-32.png', 32),
  png(square(64, 0.94, { swash: false, stroke: 10 }), 'favicon-48.png', 48),
]);
console.log('brand assets written');
