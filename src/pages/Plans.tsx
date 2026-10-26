import { useStore } from '../data/store.tsx';
import { displayDate } from '../lib/dates.ts';
import { Link, useRoute } from '../lib/router.tsx';
import { routes } from '../lib/routes.ts';
import { viewTasks, type TaskView } from '../lib/tasks.ts';
import { useForms } from '../components/Forms.tsx';
import { Icon } from '../components/Icon.tsx';
import { TaskRow } from '../components/Tasks.tsx';
import { CardLink, Chip, EmptyState, FilterChips, PageHeader, PinButton, Section, UpdatedBy } from '../components/ui.tsx';
import { NotFound } from './NotFound.tsx';

const VIEWS: Array<{ key: TaskView; label: string }> = [
  { key: 'all', label: 'All open' },
  { key: 'upcoming', label: 'Upcoming' },
  { key: 'completed', label: 'Completed' },
];

const EMPTY: Record<TaskView, { title: string; body: string }> = {
  upcoming: { title: 'Nothing dated coming up.', body: 'Tasks without a date are under All open — they’re never treated as late.' },
  all: { title: 'No open tasks.', body: 'Add one from the Add menu.' },
  completed: { title: 'Nothing finished yet.', body: 'Completed tasks show up here.' },
};

export function PlansPage() {
  const { state, today } = useStore();
  const forms = useForms();
  const { query } = useRoute();
  const raw = query.get('view');
  const view: TaskView = VIEWS.some((v) => v.key === raw) ? (raw as TaskView) : 'all'; // the default shows every open task, so a task saved without a date is never out of sight
  const tasks = viewTasks(state.tasks, view);

  return (
    <div className="page">
      <PageHeader
        title="Plans"
        sub="Household tasks, maintenance, and projects with steps or dates."
        actions={
          <>
            <button type="button" className="btn btn-primary btn-sm" onClick={() => forms.open({ kind: 'task' })}>
              <Icon name="plus" size={17} /> New task
            </button>
            <button type="button" className="btn btn-quiet btn-sm" onClick={() => forms.open({ kind: 'plan' })}>
              New plan
            </button>
          </>
        }
      />
      <FilterChips label="Task view" current={view} items={VIEWS.map((v) => ({ key: v.key, label: v.label, to: v.key === 'all' ? routes.plans : `${routes.plans}?view=${v.key}` }))} />

      {tasks.length > 0 ? (
        <ul className="task-list card">
          {tasks.map((t) => (
            <TaskRow key={t.id} task={t} />
          ))}
        </ul>
      ) : (
        <EmptyState title={EMPTY[view].title} body={EMPTY[view].body} />
      )}

      <Section title="Plans" count={state.plans.length} id="plans">
        {state.plans.length === 0 ? (
          <p className="muted">No plans yet. A plan groups a few tasks around one goal — a trip, a project, an event.</p>
        ) : (
          <div className="stack">
            {state.plans.map((p) => {
              const ts = state.tasks.filter((t) => t.planId === p.id);
              const done = ts.filter((t) => t.status === 'done').length;
              return (
                <CardLink
                  key={p.id}
                  to={routes.plan(p.id)}
                  icon="calendar"
                  title={p.title}
                  sub={`${done} of ${ts.length} task${ts.length === 1 ? '' : 's'} done`}
                  meta={p.target ? <Chip icon="calendar">Target {displayDate(p.target, today)}</Chip> : undefined}
                />
              );
            })}
          </div>
        )}
      </Section>
    </div>
  );
}

export function PlanPage({ id }: { id: string }) {
  const { state, today } = useStore();
  const forms = useForms();
  const plan = state.plans.find((p) => p.id === id);
  if (!plan) return <NotFound what="plan" />;
  const tasks = state.tasks.filter((t) => t.planId === plan.id);
  const open = viewTasks(tasks, 'all');
  const done = viewTasks(tasks, 'completed');
  return (
    <div className="page">
      <PageHeader
        title={plan.title}
        sub={plan.target ? `Target ${displayDate(plan.target, today)}` : undefined}
        back={{ to: routes.plans, label: 'Plans' }}
        actions={<PinButton target={{ kind: 'plan', id: plan.id }} />}
      />
      {plan.description && <p className="notes">{plan.description}</p>}
      <Section
        title="Tasks"
        count={tasks.length}
        id="plan-tasks"
        action={
          <button type="button" className="btn btn-quiet btn-sm" onClick={() => forms.open({ kind: 'task', prefill: { planId: plan.id } })}>
            <Icon name="plus" size={17} /> Add task
          </button>
        }
      >
        {tasks.length === 0 ? (
          <p className="muted">No tasks yet.</p>
        ) : (
          <ul className="task-list card">
            {[...open, ...done].map((t) => (
              <TaskRow key={t.id} task={t} showPlan={false} />
            ))}
          </ul>
        )}
      </Section>
      <UpdatedBy by={plan.updatedBy} at={plan.updatedAt} />
    </div>
  );
}
