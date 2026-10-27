import { test } from 'node:test';
import assert from 'node:assert/strict';
import type { ListItem, SharedList } from '../src/data/types.ts';
import { itemSub, recentMatches } from '../src/lib/lists.ts';

let n = 0;
const item = (name: string, over: Partial<ListItem> = {}): ListItem => ({
  id: `i${++n}`, name, qty: '', note: '', checked: true, position: n, updatedBy: 'jeffrey', updatedAt: `2026-10-${String(10 + n).padStart(2, '0')}T12:00:00.000Z`, version: 1, ...over,
});
const list = (items: ListItem[]): SharedList => ({ id: 'l', title: 'Groceries', description: '', items, updatedBy: 'zul', updatedAt: '2026-10-01T00:00:00.000Z', version: 1 });
const names = (xs: ListItem[]) => xs.map((x) => x.name);

test('matches recently used items by the start of any word, never mid-word', () => {
  const l = list([item('Chicken thighs'), item('Peaches'), item('Rice')]);
  assert.deepEqual(names(recentMatches(l, 'ch')), ['Chicken thighs']);
  assert.deepEqual(names(recentMatches(l, 'thi')), ['Chicken thighs']);
  assert.deepEqual(names(recentMatches(l, 'ice')), []);
});

test('every typed word must match, and details count too', () => {
  const l = list([item('Cheese', { note: 'Shredded' }), item('Chicken thighs'), item('Cream cheese')]);
  assert.deepEqual(names(recentMatches(l, 'shred')), ['Cheese']);
  assert.deepEqual(names(recentMatches(l, 'cr ch')), ['Cream cheese']);
  assert.deepEqual(names(recentMatches(l, 'ch shred')), ['Cheese']);
});

test('only recently used (checked) items are offered, one per name, newest first', () => {
  const l = list([item('Milk', { updatedAt: '2026-10-01T00:00:00.000Z' }), item('milk', { updatedAt: '2026-10-20T00:00:00.000Z' }), item('Mint', { checked: false }), item('Mustard', { updatedAt: '2026-10-25T00:00:00.000Z' })]);
  const hits = recentMatches(l, 'm');
  assert.deepEqual(names(hits), ['Mustard', 'milk']);
});

test('names that begin with the query rank ahead of later-word matches', () => {
  const l = list([item('Hot sauce', { updatedAt: '2026-10-25T00:00:00.000Z' }), item('Sausages', { updatedAt: '2026-10-02T00:00:00.000Z' })]);
  assert.deepEqual(names(recentMatches(l, 'sau')), ['Sausages', 'Hot sauce']);
});

test('blank queries offer nothing; the limit holds', () => {
  const l = list(Array.from({ length: 12 }, (_, k) => item(`Bread ${k}`)));
  assert.deepEqual(recentMatches(l, '   '), []);
  assert.equal(recentMatches(l, 'br').length, 8);
  assert.equal(recentMatches(l, 'br', 3).length, 3);
});

test('a tile’s second line joins quantity and details', () => {
  assert.equal(itemSub(item('Milk', { qty: '1 gal' })), '1 gal');
  assert.equal(itemSub(item('Cheese', { qty: '2', note: 'Shredded' })), '2 · Shredded');
  assert.equal(itemSub(item('Rice')), '');
});
