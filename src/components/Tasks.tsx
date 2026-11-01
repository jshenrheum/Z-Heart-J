import { MEMBERS, type Task } from '../data/types.ts';
import { useStore } from '../data/store.tsx';
import { displayDate, dueState, relativeLabel } from '../lib/dates.ts';
import { describeRecurrence } from '../lib/recurrence.ts';
import { Link } from '../lib/router.tsx';
import { routes } from '../lib/routes.ts';
import { useForms } from './Forms.tsx';
import { Icon } from './Icon.tsx';

export function assigneeLabel(a: Task['assignee']) {
  return a === 'both' ? 'Both' : MEMBERS[a].name;
}

function dueText(due: string, today: string) {
  const rel = relativeLabel(due, today);
  const abs = displayDate(due, today);
  return rel === abs ? abs : `${rel} · ${abs}`;
}

export function TaskRow({ task, showPlan = true }: { task: Task; showPlan?: boolean }) {
  const { state, today, actions } = useStore();
  const forms = useForms();
  const done = task.status === 'done';
  const plan = showPlan && task.planId ? state.plans.find((p) => p.id === task.planId) : undefined;
  const st = dueState(task.due, today);

  return (
    <li className={`task ${done ? 'is-done' : ''}`}>
      <button
        type="button"
        role="checkbox"
        aria-checked={done}
        className="check"
        aria-label={done ? `Reopen “${task.title}”` : `Mark “${task.title}” done`}
        onClick={() => void (done ? actions.reopenTask(task.id) : actions.completeTask(task.id))}
      >
        {done && <Icon name="check" size={18} />}
      </button>
      <div className="task-body">
        <button type="button" className="task-title task-edit" onClick={() => forms.open({ kind: 'task', id: task.id })} aria-label={`Edit “${task.title}”`}>
          {task.title}
        </button>
        {/* One quiet line of plain text, never pill-shaped labels: who, when, repeats, plan. */}
        <span className="task-meta">
          <span>{assigneeLabel(task.assignee)}</span>
          {done && task.completedOn ? (
            <span className="t-good">Done {displayDate(task.completedOn, today)}</span>
          ) : task.due ? (
            <span className={st === 'overdue' ? 't-warn' : st === 'today' || st === 'soon' ? 't-heart' : undefined}>{dueText(task.due, today)}</span>
          ) : null}
          {task.recurrence && (
            <span className="task-repeat">
              <Icon name="repeat" size={12} /> {describeRecurrence(task.recurrence)}
            </span>
          )}
          {plan && (
            <Link to={routes.plan(plan.id)} className="task-plan-link">
              {plan.title}
            </Link>
          )}
        </span>
        {task.notes && <span className="task-notes">{task.notes}</span>}
      </div>
    </li>
  );
}
