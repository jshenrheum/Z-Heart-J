import type { Task } from '../data/types.ts';
import type { DateStr } from './dates.ts';
import { nextDue } from './recurrence.ts';

export interface CompleteResult {
  tasks: Task[];
  /** The next instance, only when this call actually created one. */
  created?: Task;
  /** False when the task was already done (a second tap, or the other phone got there first). */
  changed: boolean;
}

/**
 * Completing is idempotent. A second completion of the same task changes nothing,
 * and the next instance is keyed by (seriesId, due) so it can only exist once.
 * In Stage 2 the same rule is enforced by a unique index and one transaction.
 */
export function completeTask(
  tasks: Task[],
  taskId: string,
  completedOn: DateStr,
  by: Task['updatedBy'],
  newId: () => string,
): CompleteResult {
  const task = tasks.find((t) => t.id === taskId);
  if (!task || task.status === 'done') return { tasks, changed: false };

  let next: Task | undefined;
  if (task.recurrence) {
    const due = nextDue(task.due, task.recurrence, completedOn);
    const exists = tasks.some((t) => t.seriesId === task.seriesId && t.due === due);
    if (!exists) {
      next = {
        ...task,
        id: newId(),
        due,
        status: 'open',
        completedOn: undefined,
        createdFrom: task.id,
        updatedBy: by,
        recurrence: { ...task.recurrence, anchorDay: task.recurrence.anchorDay ?? anchorOf(task, completedOn) },
      };
    }
  }

  const updated = tasks.map((t) => (t.id === taskId ? { ...t, status: 'done' as const, completedOn, updatedBy: by } : t));
  return { tasks: next ? [...updated, next] : updated, created: next, changed: true };
}

function anchorOf(task: Task, completedOn: DateStr): number {
  const base = task.recurrence?.mode === 'after_completion' ? completedOn : (task.due ?? completedOn);
  return Number(base.slice(8, 10));
}

/**
 * Reopens a finished task. If completing it generated a next instance that is still
 * open and untouched, that instance is taken back so the series never ends up with
 * two open copies (this is what Undo relies on). A next instance that has been edited
 * or already finished is kept: that could lose someone's work.
 */
export function reopenTask(tasks: Task[], taskId: string, by: Task['updatedBy']): Task[] {
  const original = tasks.find((t) => t.id === taskId);
  if (!original || original.status !== 'done') return tasks;
  const untouched = (t: Task) =>
    t.createdFrom === taskId && t.status === 'open' &&
    t.title === original.title && t.assignee === original.assignee && t.notes === original.notes && t.planId === original.planId &&
    t.recurrence?.mode === original.recurrence?.mode && t.recurrence?.every === original.recurrence?.every && t.recurrence?.unit === original.recurrence?.unit;
  return tasks
    .filter((t) => !untouched(t))
    .map((t) => (t.id === taskId ? { ...t, status: 'open' as const, completedOn: undefined, updatedBy: by } : t));
}

export type TaskView = 'upcoming' | 'all' | 'completed';

export function viewTasks(tasks: Task[], view: TaskView): Task[] {
  const open = tasks.filter((t) => t.status === 'open');
  const byDue = (a: Task, b: Task) => (a.due ?? '9999-12-31').localeCompare(b.due ?? '9999-12-31') || a.title.localeCompare(b.title);
  if (view === 'completed') return tasks.filter((t) => t.status === 'done').sort((a, b) => (b.completedOn ?? '').localeCompare(a.completedOn ?? ''));
  if (view === 'upcoming') return open.filter((t) => t.due).sort(byDue);
  return open.sort(byDue);
}
