import { test } from 'node:test';
import assert from 'node:assert/strict';
import { canonical, InvalidData, toHousehold, validateData, type Row } from '../src/lib/records.ts';

const fails = (kind: Parameters<typeof validateData>[0], data: unknown, field?: string) => {
  assert.throws(() => validateData(kind, data), (e: unknown) => e instanceof InvalidData && (field === undefined || e.field === field));
};

test('validation builds a new object from the allowlist and refuses unknown keys', () => {
  const ok = validateData('list', { title: '  Groceries  ', description: '' });
  assert.deepEqual(ok, { title: 'Groceries', description: '' });
  fails('list', { title: 'X', description: '', secret: 'x' }, 'secret');
  fails('list', { title: '', description: '' }, 'title');
});

test('a protected home field can never carry its value in ordinary data', () => {
  const field = { id: 'f-1', label: 'Account', kind: 'identifier', protected: true };
  assert.deepEqual(validateData('home', { template: 'utility', title: 'Power', notes: '', fields: [field] }), {
    template: 'utility', title: 'Power', notes: '', fields: [{ id: 'f-1', label: 'Account', kind: 'identifier', protected: true }],
  });
  fails('home', { template: 'utility', title: 'Power', notes: '', fields: [{ ...field, value: '12345' }] }, 'fields[0].value');
});

test('formats are checked by kind: phones, URLs, dates, NPIs', () => {
  fails('contact', { name: 'A', category: 'B', role: '', phone: 'call me', fax: '', email: '', address: '', website: '', note: '', aliases: [] }, 'phone');
  fails('contact', { name: 'A', category: 'B', role: '', phone: '', fax: '', email: '', address: '', website: 'javascript:alert(1)', note: '', aliases: [] }, 'website');
  fails('credential', { owner: 'zul', type: 'License', issuer: '', expires: '2026-02-30' }, 'expires');
  fails('profile', { displayName: 'J', specialty: '', organization: '', npi: '12345' }, 'npi');
  fails('location', { owner: 'someone', label: 'X', organization: '', address: '', mainPhone: '', directPhone: '', fax: '', schedulingPhone: '', notes: '' }, 'owner');
});

test('task rules: plan steps don’t repeat, schedule mode needs a due date', () => {
  const base = { seriesId: 't-1', title: 'X', assignee: 'both', status: 'open', notes: '' };
  fails('task', { ...base, planId: 'plan-1', recurrence: { mode: 'after_completion', every: 1, unit: 'month' } }, 'recurrence');
  fails('task', { ...base, recurrence: { mode: 'schedule', every: 1, unit: 'month' } }, 'due');
  fails('task', { ...base, recurrence: { mode: 'schedule', every: 0, unit: 'month' }, due: '2026-11-01' }, 'recurrence.every');
  assert.equal(validateData('task', { ...base, completedOn: '2026-10-01' }).completedOn, undefined, 'an open task has no completion day');
});

test('canonical JSON ignores key order and undefined', () => {
  assert.equal(canonical({ b: 1, a: [1, { y: 2, x: undefined }] }), canonical({ a: [1, { y: 2 }], b: 1 }));
});

test('rows map to the app shape; protected presence becomes hasValue, never a value', () => {
  const at = '2026-10-25T12:00:00.000Z';
  const rows: Row[] = [
    { id: 'cred-1', kind: 'credential', version: 3, data: { owner: 'jeffrey', type: 'DEA registration', issuer: '' }, createdBy: 'jeffrey', createdAt: at, updatedBy: 'zul', updatedAt: at, stored: ['number'] },
    { id: 'home-1', kind: 'home', version: 1, data: { template: 'vehicle', title: 'Car', notes: '', fields: [{ id: 'f-p', label: 'Plate', kind: 'identifier', protected: true }] }, createdBy: 'zul', createdAt: at, updatedBy: 'zul', updatedAt: at },
    { id: 'list-1', kind: 'list', version: 1, data: { title: 'Groceries', description: '' }, createdBy: 'zul', createdAt: at, updatedBy: 'zul', updatedAt: at },
    { id: 'i-2', kind: 'item', parentId: 'list-1', version: 1, data: { name: 'Eggs', qty: '', note: '', checked: false, position: 2 }, createdBy: 'zul', createdAt: at, updatedBy: 'zul', updatedAt: at },
    { id: 'i-1', kind: 'item', parentId: 'list-1', version: 1, data: { name: 'Milk', qty: '', note: '', checked: false, position: 1.5 }, createdBy: 'zul', createdAt: at, updatedBy: 'zul', updatedAt: at },
  ];
  const h = toHousehold(rows, new Set(['i-2']));
  assert.equal(h.credentials[0]!.hasValue, true);
  assert.equal(h.credentials[0]!.version, 3);
  assert.equal(h.home[0]!.fields[0]!.hasValue, false);
  assert.equal(h.home[0]!.fields[0]!.value, undefined);
  assert.deepEqual(h.lists[0]!.items.map((i) => `${i.name}${i.sync ? '*' : ''}`), ['Milk', 'Eggs*'], 'items by position; in-flight marked');
});
