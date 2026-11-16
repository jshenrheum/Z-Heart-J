import { MEMBERS, type Task } from '../data/types.ts';
import { useStore } from '../data/store.tsx';
import { displayDate, dueState, relativeLabel } from '../lib/dates.ts';
import { describeRecurrence } from '../lib/recurrence.ts';
import { Link } from '../lib/router.tsx';
import { routes } from '../lib/routes.ts';
import { useForms } from './Forms.tsx';
import { Icon } from './Icon.tsx';
import { useSwipe } from './ListItems.tsx';
import { Fragment, type ReactNode } from 'react';

export function assigneeLabel(a: Task['assignee']) {
  return a === 'both' ? 'Both' : MEMBERS[a].name;
}

function dueText(due: string, today: string) {
  const rel = relativeLabel(due, today);
  const abs = displayDate(due, today);
  return rel === abs ? abs : `${rel} · ${abs}`;
}

/**
 * A task as one clean row, like a list item: the circle, the title (tap to open it),
 * and one grey line with who, when, how it repeats and its plan. Overdue reads in
 * warm words, today and soon in pink. Swipe left to move it to the trash, with Undo.
 */
export function TaskRow({ task, showPlan = true }: { task: Task; showPlan?: boolean }) {
  const { state, today, actions } = useStore();
  const forms = useForms();
  const done = task.status === 'done';
  const plan = showPlan && task.planId ? state.plans.find((p) => p.id === task.planId) : undefined;
  const st = dueState(task.due, today);
  const open = () => forms.open({ kind: 'task', id: task.id });
  const { swipe, handlers } = useSwipe({
    enabled: true,
    onDelete: () => void actions.trashRecord(task.id, `“${task.title}”`),
    onTap: (t) => {
      if (t.closest('.li-text') && !t.closest('button, a')) open();
    },
  });

  const parts: ReactNode[] = [<span key="who">{assigneeLabel(task.assignee)}</span>];
  if (done && task.completedOn) parts.push(<span key="when">Done {displayDate(task.completedOn, today)}</span>);
  else if (task.due) parts.push(<span key="when" className={`task-due is-${st}`}>{dueText(task.due, today)}</span>);
  else parts.push(<span key="when">No date</span>);
  if (task.recurrence) parts.push(<span key="rep" className="task-rep"><Icon name="repeat" size={13} /> {describeRecurrence(task.recurrence)}</span>);
  if (plan)
    parts.push(
      <Link key="plan" to={routes.plan(plan.id)} className="task-plan-link">
        {plan.title}
      </Link>,
    );

  return (
    <li className={`task li-row ${done ? 'is-done' : ''} ${swipe ? 'is-swiping' : ''}`}>
      <button type="button" className="li-delete" tabIndex={swipe ? 0 : -1} aria-hidden={swipe ? undefined : true} onClick={() => void actions.trashRecord(task.id, `“${task.title}”`)}>
        Delete
      </button>
      <div className="li-slide" style={swipe ? { transform: `translateX(${swipe}px)` } : undefined} {...handlers}>
        <button
          type="button"
          role="checkbox"
          aria-checked={done}
          className="check"
          aria-label={done ? `Reopen “${task.title}”` : `Mark “${task.title}” done`}
          onPointerDown={(e) => e.stopPropagation()}
          onClick={() => void (done ? actions.reopenTask(task.id) : actions.completeTask(task.id))}
        >
          {done && <Icon name="check" size={18} />}
        </button>
        <div className="li-text">
          <button type="button" className="li-name task-title task-edit" onClick={() => !swipe && open()} aria-label={`Edit “${task.title}”`}>
            {task.title}
          </button>
          <span className="li-sub task-meta">
            {parts.map((p, k) => (
              <Fragment key={k}>
                {k > 0 && <span className="task-sep" aria-hidden="true"> · </span>}
                {p}
              </Fragment>
            ))}
          </span>
          {task.notes && <span className="li-sub task-notes">{task.notes}</span>}
        </div>
      </div>
    </li>
  );
}
