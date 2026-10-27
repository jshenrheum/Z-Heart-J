import { test } from 'node:test';
import assert from 'node:assert/strict';
import type { Row } from '../src/lib/records.ts';
import { applyOutbox, listRows, queueAdd, queueToggle, toggleChange, type OutboxEntry } from '../src/lib/outbox.ts';

const at = '2026-10-27T18:00:00.000Z';
const row = (id: string, kind: Row['kind'], data: Record<string, unknown>, over: Partial<Row> = {}): Row => ({
  id, kind, version: 1, data, createdBy: 'zul', createdAt: '2026-10-01T00:00:00.000Z', updatedBy: 'zul', updatedAt: '2026-10-01T00:00:00.000Z', ...over,
});
const base = () => ({
  groceries: row('groceries', 'list', { title: 'Groceries', description: '' }),
  milk: row('milk', 'item', { name: 'Milk', qty: '', note: '', checked: false, position: 1 }, { parentId: 'groceries' }),
  eggs: row('eggs', 'item', { name: 'Eggs', qty: '', note: '', checked: true, position: 2 }, { parentId: 'groceries' }),
});

test('only lists and their items are kept on the phone', () => {
  const rows = [...Object.values(base()), row('cred', 'credential', { owner: 'zul', type: 'DEA' }), row('m', 'moment', { title: 'x' }), row('c', 'contact', { name: 'Vet' })];
  assert.deepEqual(listRows(rows).map((r) => r.id), ['groceries', 'milk', 'eggs']);
});

test('one queued tick per item: a later tap replaces an earlier one', () => {
  let box: OutboxEntry[] = [];
  box = queueToggle(box, 'milk', true, undefined, at);
  box = queueToggle(box, 'milk', false, 9, at);
  box = queueToggle(box, 'eggs', false, 10, at);
  assert.deepEqual(box.map((e) => [e.t, e.id, e.t === 'toggle' && e.checked]), [['toggle', 'milk', false], ['toggle', 'eggs', false]]);
});

test('ticking an item that was itself added offline changes what will be added', () => {
  let box = queueAdd([], 'tea', 'groceries', { name: 'Tea', qty: '', note: '', position: 3 }, at, 'jeffrey');
  box = queueToggle(box, 'tea', true, undefined, at);
  assert.equal(box.length, 1);
  assert.equal(box[0]!.t === 'add' && box[0]!.data.checked, true);
});

test('the screen shows the queued changes on top of the copy', () => {
  let box = queueToggle([], 'milk', true, undefined, at);
  box = queueToggle(box, 'eggs', false, 7, at);
  box = queueAdd(box, 'tea', 'groceries', { name: 'Tea', qty: '', note: '', position: 8 }, at, 'jeffrey');
  box = queueAdd(box, 'gone', 'no-such-list', { name: 'Lost', qty: '', note: '', position: 1 }, at, 'jeffrey');
  const shown = applyOutbox(base(), box, 'jeffrey');
  assert.equal(shown.milk!.data.checked, true);
  assert.deepEqual([shown.eggs!.data.checked, shown.eggs!.data.position], [false, 7]);
  assert.deepEqual([shown.tea!.kind, shown.tea!.parentId, shown.tea!.data.name, shown.tea!.version], ['item', 'groceries', 'Tea', 0]);
  assert.equal(shown.gone, undefined, 'an item whose list is gone is not shown');
  assert.equal(shown.milk!.updatedBy, 'jeffrey');
  assert.equal(base().milk.data.checked, false, 'the copy itself is untouched');
});

test('on reconnect, a tick is sent only if the server still needs it', () => {
  const e = { t: 'toggle' as const, id: 'milk', checked: true, at };
  assert.deepEqual(toggleChange(e, base().milk), { name: 'Milk', qty: '', note: '', checked: true, position: 1 });
  assert.equal(toggleChange(e, { ...base().milk, data: { ...base().milk.data, checked: true } }), null, 'the other phone got there too');
  assert.equal(toggleChange(e, undefined), null, 'removed on the other phone');
  assert.deepEqual(toggleChange({ t: 'toggle', id: 'eggs', checked: false, position: 12, at }, base().eggs)?.position, 12, 'a put-back goes to the end');
});
