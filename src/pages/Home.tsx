import { MEMBERS } from '../data/types.ts';
import { useStore } from '../data/store.tsx';
import { calendarItems } from '../lib/calendar.ts';
import { addDays, hourIn } from '../lib/dates.ts';
import { resolvePin } from '../lib/pins.ts';
import { Link } from '../lib/router.tsx';
import { routes } from '../lib/routes.ts';
import { viewTasks } from '../lib/tasks.ts';
import { useForms } from '../components/Forms.tsx';
import { Icon } from '../components/Icon.tsx';
import { QuickAdd } from '../components/QuickAdd.tsx';
import { InlineSearch } from '../components/Search.tsx';
import { TaskRow } from '../components/Tasks.tsx';
import { CardLink, Section } from '../components/ui.tsx';
import { CalRow } from './Calendar.tsx';
import { countdown } from '../lib/wedding.ts';

export function HomePage() {
  const { state, me, today } = useStore();
  const forms = useForms();
  const hour = hourIn();
  const greeting = hour < 12 ? 'Good morning' : hour < 18 ? 'Good afternoon' : 'Good evening';

  const pins = state.pins[me].map((p) => resolvePin(state, p, me)).filter((p): p is NonNullable<typeof p> => p !== null).slice(0, 6);
  const lists = [...state.lists].sort((a, b) => (/grocer/i.test(a.title) ? -1 : /grocer/i.test(b.title) ? 1 : 0)).slice(0, 3);
  const coming = viewTasks(state.tasks, 'upcoming');
  // Tasks have their own section below (where they can be ticked off).
  const week = calendarItems(state, today, addDays(today, 6)).filter((i) => i.source !== 'task');

  return (
    <div className="page">
      <h1 className="greeting">
        {greeting}, {MEMBERS[me].name}.
      </h1>

      <InlineSearch />

      <div className="home-grid">
        <Section title="Pinned" id="pins">
          {pins.length > 0 ? (
            <div className="pin-grid">
              {pins.map((p) => (
                <CardLink key={p.key} to={p.to} icon={p.icon} title={p.title} sub={p.sub} />
              ))}
            </div>
          ) : (
            <div className="empty">
              <p className="muted">Pin the things you open most — your work details, the home address, a list — and they’ll wait for you here.</p>
              <Link to={routes.info} className="btn btn-primary">
                <Icon name="pin" size={18} /> Choose from Our Info
              </Link>
            </div>
          )}
        </Section>

        {state.wedding?.date && (() => {
          const c = countdown(state.wedding.date, today);
          return (
            <Link to={routes.wedding} className="wed-home" aria-label={`Wedding: ${c.label} ${c.sub}`}>
              <span className="wed-home-count">{c.label}</span>
              <span className="wed-home-sub">{c.sub}{state.wedding.venue ? ` · ${state.wedding.venue.split('\n')[0]}` : ''}</span>
              <Icon name="chevron" size={18} className="card-chev" />
            </Link>
          );
        })()}

        <Section title="This week" id="week" action={<Link to={routes.calendar} className="inline-link">Calendar</Link>}>
          {week.length > 0 ? (
            <ul className="cal-list card">
              {week.slice(0, 5).map((i) => (
                <CalRow key={i.key} item={i} today={today} withDay />
              ))}
            </ul>
          ) : (
            <div className="empty">
              <p className="muted">Nothing on the calendar for the next seven days.</p>
              <button type="button" className="btn btn-quiet btn-sm" onClick={() => forms.open({ kind: 'event' })}>
                <Icon name="plus" size={17} /> New event
              </button>
            </div>
          )}
        </Section>

        <Section title="Shared lists" id="lists" action={<Link to={routes.lists} className="inline-link">All lists</Link>}>
          {lists.length > 0 ? (
            <div className="stack">
              {lists.map((l, idx) => {
                const open = l.items.filter((i) => !i.checked);
                return (
                  <div className="card list-preview" key={l.id}>
                    <Link to={routes.list(l.id)} className="list-preview-head">
                      <span className="card-title">{l.title}</span>
                      <span className="muted small head-count">
                        {open.length} to get <Icon name="chevron" size={14} />
                      </span>
                    </Link>
                    {open.length > 0 ? (
                      <ul className="preview-items">
                        {open.slice(0, 4).map((i) => (
                          <li key={i.id}>{i.name}</li>
                        ))}
                        {open.length > 4 && <li className="muted">+ {open.length - 4} more</li>}
                      </ul>
                    ) : (
                      <p className="muted small">Nothing left on this list.</p>
                    )}
                    {idx === 0 && <QuickAdd listId={l.id} listTitle={l.title} />}
                  </div>
                );
              })}
            </div>
          ) : (
            <div className="empty">
              <p className="muted">No lists yet.</p>
              <button type="button" className="btn btn-primary" onClick={() => forms.open({ kind: 'list' })}>
                <Icon name="plus" size={18} /> Start a shared list
              </button>
            </div>
          )}
        </Section>

        {coming.length > 0 && (
          <Section title="Coming up" id="coming" action={<Link to={routes.plans} className="inline-link">See all</Link>}>
            <ul className="task-list card">
              {coming.slice(0, 3).map((t) => (
                <TaskRow key={t.id} task={t} />
              ))}
            </ul>
          </Section>
        )}
      </div>
    </div>
  );
}
