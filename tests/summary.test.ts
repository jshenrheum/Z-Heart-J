import { test } from 'node:test';
import assert from 'node:assert/strict';
import { makeDemoHousehold } from '../src/data/demo.ts';
import { buildWorkSummary, directionsHref, safeUrl, telHref } from '../src/lib/summary.ts';

const h = makeDemoHousehold('2026-10-25');
const profile = h.profiles[0]!;
const loc = h.locations[0]!;

test('public summary follows the documented order and omits empty fields', () => {
  assert.equal(
    buildWorkSummary(profile, loc),
    ['Jeffrey', 'Demo specialty', 'Demo Organization — Demo Location A', '100 Placeholder Street, Suite 1, Demoville, ST 00000', 'Phone: (555) 010-0100', 'Fax: (555) 010-0102', 'NPI: 0000000000'].join('\n'),
  );
  const sparse = buildWorkSummary({ ...profile, npi: '' }, { ...loc, fax: '', mainPhone: '', address: '' });
  assert.ok(!sparse.includes('Fax:') && !sparse.includes('Phone:') && !sparse.includes('NPI:'));
});

test('NPI keeps every digit, including leading zeros', () => {
  assert.ok(buildWorkSummary({ ...profile, npi: '0012345678' }, loc).endsWith('NPI: 0012345678'));
});

test('summary is built from an allowlist: smuggled fields never appear', () => {
  const dirty = { ...profile, dea: 'DEA-SECRET-111', deaNumber: 'DEA-SECRET-222' } as typeof profile;
  const dirtyLoc = { ...loc, password: 'SECRET-333', protectedValue: 'SECRET-444' } as typeof loc;
  const out = buildWorkSummary(dirty, dirtyLoc);
  assert.ok(!/SECRET/.test(out));
  assert.ok(!/DEA/i.test(out));
});

test('links: tel strips formatting, fax is never a call link, urls are http(s) only', () => {
  assert.equal(telHref('(555) 010-0100'), 'tel:5550100100');
  assert.equal(telHref('+1 (555) 010-0100'), 'tel:+15550100100');
  assert.equal(safeUrl('javascript:alert(1)'), undefined);
  assert.equal(safeUrl('data:text/html,hi'), undefined);
  assert.equal(safeUrl('example.com/x'), 'https://example.com/x');
  assert.equal(safeUrl('   '), undefined);
  assert.ok(directionsHref('1 A St, B').includes(encodeURIComponent('1 A St, B')));
});
