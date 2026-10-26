import { test } from 'node:test';
import assert from 'node:assert/strict';
import { makeDemoRows } from '../src/demo/data.ts';
import { toHousehold } from '../src/lib/records.ts';

const makeDemoHousehold = (today: string) => toHousehold(makeDemoRows(today));
import { buildIndex, search } from '../src/lib/search.ts';

const TODAY = '2026-10-25';
const h = makeDemoHousehold(TODAY);
const index = buildIndex(h, TODAY);
const q = (query: string, me: 'jeffrey' | 'zul' = 'jeffrey') => search(index, query, { me });
const titles = (query: string, me: 'jeffrey' | 'zul' = 'jeffrey') => q(query, me).results.map((r) => `${r.doc.title}|${r.doc.context}`);

test('"my fax" resolves to the signed-in member and shows every location, labelled', () => {
  const jeff = q('my fax', 'jeffrey');
  assert.deepEqual(jeff.results.map((r) => r.doc.context), ['Jeffrey · Demo Location A', 'Jeffrey · Demo Location B']);
  assert.ok(jeff.scope?.startsWith('Jeffrey'));
  const zul = q('my fax', 'zul');
  assert.deepEqual(zul.results.map((r) => r.doc.context), ['Zul · Demo Location C']);
});

test('"zul fax" and "zul\'s fax" map to Zul\'s records regardless of who is signed in', () => {
  assert.deepEqual(q('zul fax', 'jeffrey').results.map((r) => r.doc.owner), ['zul']);
  assert.deepEqual(q("Zul's fax", 'jeffrey').results.map((r) => r.doc.owner), ['zul']);
});

test('plain "fax" shows everyone\'s faxes plus contact faxes, never choosing silently', () => {
  const r = q('fax').results;
  assert.ok(r.length >= 4);
  assert.ok(r.some((x) => x.doc.title === 'Demo Vet Clinic fax'));
});

test('aliases from the brief resolve', () => {
  assert.equal(q('work number').results[0]?.doc.fieldKind, 'phone');
  assert.equal(q('office address').results[0]?.doc.fieldKind, 'address');
  assert.equal(q('npi').results[0]?.doc.title, 'NPI');
  assert.equal(q('vet').results[0]?.doc.id, 'contact-vet');
  assert.equal(q('ac').results[0]?.doc.id, 'contact-hvac');
  assert.ok(titles('filter').some((t) => t.startsWith('Filter size')));
  assert.equal(q('groceries').results[0]?.doc.id, 'groceries');
  assert.ok(q('renewal').results.some((r) => r.doc.kind === 'credential'));
});

test('searching DEA finds the credential record and its protected status, never a number', () => {
  const hit = q('dea').results[0]?.doc;
  assert.equal(hit?.kind, 'credential');
  assert.equal(hit?.value, undefined);
  assert.match(hit?.protectedNote ?? '', /Protected/);
});

test('protected values cannot reach the index even if one is smuggled into the data', () => {
  const dirty = makeDemoHousehold(TODAY);
  (dirty.credentials[0] as unknown as Record<string, unknown>).number = 'DEA-SECRET-12345';
  (dirty.credentials[0] as unknown as Record<string, unknown>).value = 'DEA-SECRET-12345';
  const plate = dirty.home.find((r) => r.id === 'home-vehicle')!.fields.find((f) => f.protected)!;
  plate.value = 'PLATE-SECRET-999'; // should never exist, but the index must still ignore it
  const idx = buildIndex(dirty, TODAY);
  const blob = JSON.stringify(idx);
  assert.ok(!blob.includes('DEA-SECRET-12345'));
  assert.ok(!blob.includes('PLATE-SECRET-999'));
  assert.equal(search(idx, 'DEA-SECRET-12345', { me: 'jeffrey' }).results.length, 0);
  assert.equal(search(idx, 'PLATE-SECRET-999', { me: 'jeffrey' }).results.length, 0);
  // but the protected field's label is findable, with its status
  const plateHit = search(idx, 'plate', { me: 'jeffrey' }).results[0]?.doc;
  assert.equal(plateHit?.value, undefined);
  assert.match(plateHit?.protectedNote ?? '', /Protected/);
});

test('phone digits are normalised for search while the display format is preserved', () => {
  const hit = q('0102').results[0]?.doc;
  assert.equal(hit?.value, '(555) 010-0102');
});

test('empty and nonsense queries return nothing and invent nothing', () => {
  assert.equal(q('').results.length, 0);
  assert.equal(q('   ').results.length, 0);
  assert.equal(q('zzzxqy').results.length, 0);
  assert.equal(q('the').results.length, 0);
});

test('a name alone shows that person\'s professional records', () => {
  const r = q('zul').results;
  assert.ok(r.length > 0 && r.every((x) => x.doc.owner === 'zul'));
});

test('pins are only a modest tie-breaker', () => {
  const pinned = new Set(['list:packing']);
  const a = search(index, 'list', { me: 'jeffrey', pinned }).results.map((r) => r.doc.id);
  assert.equal(a[0], 'packing');
  const exact = search(index, 'groceries', { me: 'jeffrey', pinned }).results[0]?.doc.id;
  assert.equal(exact, 'groceries'); // an exact match still beats a pinned partial one
});
