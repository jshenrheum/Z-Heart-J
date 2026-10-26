import { test } from 'node:test';
import assert from 'node:assert/strict';
import type { Task } from '../src/data/types.ts';
import { completeTask, reopenTask, viewTasks } from '../src/lib/tasks.ts';

const base = (over: Partial<Task>): Task => ({ id: 'a', seriesId: 'a', title: 'x', assignee: 'both', status: 'open', notes: '', updatedBy: 'jeffrey', ...over });
let n = 0;
const newId = () => `new-${++n}`;

test('completing a recurring task twice creates exactly one next instance', () => {
  const tasks = [base({ id: 'a', seriesId: 's', due: '2026-11-15', recurrence: { mode: 'schedule', every: 3, unit: 'month' } })];
  const first = completeTask(tasks, 'a', '2026-11-15', 'jeffrey', newId);
  assert.equal(first.changed, true);
  assert.equal(first.created?.due, '2027-02-15');
  const second = completeTask(first.tasks, 'a', '2026-11-15', 'zul', newId); // the other phone
  assert.equal(second.changed, false);
  assert.equal(second.tasks.filter((t) => t.seriesId === 's').length, 2);
});

test('reopen then complete again cannot duplicate the next instance', () => {
  const tasks = [base({ id: 'a', seriesId: 's', due: '2026-11-15', recurrence: { mode: 'schedule', every: 1, unit: 'month' } })];
  const done = completeTask(tasks, 'a', '2026-11-15', 'jeffrey', newId);
  const reopened = reopenTask(done.tasks, 'a', 'jeffrey');
  assert.equal(reopened.filter((t) => t.seriesId === 's').length, 1, 'the untouched next instance is taken back');
  const again = completeTask(reopened, 'a', '2026-11-15', 'jeffrey', newId);
  assert.equal(again.tasks.filter((t) => t.seriesId === 's' && t.due === '2026-12-15').length, 1);
  // if the next instance had been kept (e.g. edited), completing again must not add a second one
  const kept = completeTask(done.tasks.map((t) => (t.id === done.created!.id ? { ...t, notes: 'edited' } : t)), 'a', '2026-11-15', 'jeffrey', newId);
  assert.equal(kept.changed, false);
});

test('a month-end series keeps its anchor across instances', () => {
  let tasks = [base({ id: 'a', seriesId: 's', due: '2027-01-31', recurrence: { mode: 'schedule', every: 1, unit: 'month' } })];
  const r1 = completeTask(tasks, 'a', '2027-01-31', 'jeffrey', newId);
  assert.equal(r1.created?.due, '2027-02-28');
  tasks = r1.tasks;
  const r2 = completeTask(tasks, r1.created!.id, '2027-02-28', 'jeffrey', newId);
  assert.equal(r2.created?.due, '2027-03-31');
});

test('non-recurring tasks just complete', () => {
  const r = completeTask([base({ id: 'a' })], 'a', '2026-10-25', 'zul', newId);
  assert.equal(r.created, undefined);
  assert.equal(r.tasks[0]?.status, 'done');
  assert.equal(completeTask(r.tasks, 'missing', '2026-10-25', 'zul', newId).changed, false);
});

test('views: undated tasks appear in All but never in Upcoming', () => {
  const tasks = [
    base({ id: '1', title: 'B', due: '2026-11-02' }),
    base({ id: '2', title: 'A', due: '2026-10-30' }),
    base({ id: '3', title: 'No date' }),
    base({ id: '4', title: 'Finished', status: 'done', completedOn: '2026-10-01' }),
  ];
  assert.deepEqual(viewTasks(tasks, 'upcoming').map((t) => t.id), ['2', '1']);
  assert.deepEqual(viewTasks(tasks, 'all').map((t) => t.id), ['2', '1', '3']);
  assert.deepEqual(viewTasks(tasks, 'completed').map((t) => t.id), ['4']);
});

test('undo (reopen) after completing a recurring task leaves exactly one open instance', () => {
  const r = { mode: 'schedule', every: 3, unit: 'month' } as const;
  const series = [base({ id: 'a', due: '2026-11-06', recurrence: r })];
  const done = completeTask(series, 'a', '2026-10-25', 'jeffrey', newId);
  assert.equal(done.tasks.filter((t) => t.status === 'open').length, 1);
  const undone = reopenTask(done.tasks, 'a', 'jeffrey');
  assert.deepEqual(undone.map((t) => [t.id, t.status, t.due]), [['a', 'open', '2026-11-06']]);
  // and completing again produces the next instance once
  const again = completeTask(undone, 'a', '2026-10-26', 'jeffrey', newId);
  assert.equal(again.tasks.filter((t) => t.status === 'open').length, 1);
});

test('reopen keeps a next instance that was edited or already finished', () => {
  const r = { mode: 'schedule', every: 3, unit: 'month' } as const;
  const done = completeTask([base({ id: 'a', due: '2026-11-06', recurrence: r })], 'a', '2026-10-25', 'jeffrey', newId);
  const nextId = done.created!.id;
  const edited = done.tasks.map((t) => (t.id === nextId ? { ...t, notes: 'call first' } : t));
  assert.equal(reopenTask(edited, 'a', 'zul').length, 2, 'edited successor is kept');
  const finished = completeTask(done.tasks, nextId, '2027-02-06', 'zul', newId).tasks;
  assert.ok(reopenTask(finished, 'a', 'zul').some((t) => t.id === nextId), 'finished successor is kept');
});

test('reopening a non-recurring or already-open task changes nothing else', () => {
  const tasks = [base({ id: 'a' }), base({ id: 'b', status: 'done', completedOn: '2026-10-01' })];
  assert.equal(reopenTask(tasks, 'a', 'zul'), tasks, 'open task: same array');
  const reopened = reopenTask(tasks, 'b', 'zul');
  assert.equal(reopened.length, 2);
  assert.equal(reopened.find((t) => t.id === 'b')!.status, 'open');
});
