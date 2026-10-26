import { MEMBERS, type Task } from '../data/types.ts';
import { useStore } from '../data/store.tsx';
import { displayDate, dueState, relativeLabel } from '../lib/dates.ts';
import { describeRecurrence } from '../lib/recurrence.ts';
import { Link } from '../lib/router.tsx';
import { routes } from '../lib/routes.ts';
import { Icon } from './Icon.tsx';
import { Chip } from './ui.tsx';

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
        <span className="task-title">{task.title}</span>
        <span className="task-meta">
          <Chip>{assigneeLabel(task.assignee)}</Chip>
          {done && task.completedOn ? (
            <Chip tone="good" icon="check">
              Done {displayDate(task.completedOn, today)}
            </Chip>
          ) : task.due ? (
            <Chip tone={st === 'overdue' ? 'warn' : st === 'today' || st === 'soon' ? 'heart' : 'neutral'} icon={st === 'overdue' ? 'calendar' : undefined}>
              {dueText(task.due, today)}
            </Chip>
          ) : (
            <span className="muted small">No date</span>
          )}
          {task.recurrence && (
            <Chip icon="repeat">{describeRecurrence(task.recurrence)}</Chip>
          )}
          {plan && (
            <Link to={routes.plan(plan.id)} className="inline-link small task-plan-link">
              {plan.title}
            </Link>
          )}
        </span>
        {task.notes && <span className="task-notes">{task.notes}</span>}
      </div>
    </li>
  );
}
