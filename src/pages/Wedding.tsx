import { useEffect } from 'react';
import { MEMBERS, type BudgetItem, type Guest, type Vendor } from '../data/types.ts';
import { useStore } from '../data/store.tsx';
import { displayDate, dueState } from '../lib/dates.ts';
import { formatTime } from '../lib/calendar.ts';
import { Link, useRoute } from '../lib/router.tsx';
import { routes } from '../lib/routes.ts';
import { directionsHref, safeUrl, telHref } from '../lib/summary.ts';
import { viewTasks } from '../lib/tasks.ts';
import { budgetTotals, byName, countdown, guestCounts, money, scheduleLines, vendorCounts, weddingPlan } from '../lib/wedding.ts';
import { useForms } from '../components/Forms.tsx';
import { Icon } from '../components/Icon.tsx';
import { TaskRow } from '../components/Tasks.tsx';
import { Chip, EmptyState, FilterChips, PageHeader, Section, UpdatedBy } from '../components/ui.tsx';
import artLarge from '../assets/art/us.webp';
import artSmall from '../assets/art/us-600.webp';

type Tab = 'overview' | 'checklist' | 'vendors' | 'budget' | 'guests';
const TABS: Array<{ key: Tab; label: string }> = [
  { key: 'overview', label: 'Overview' },
  { key: 'checklist', label: 'Checklist' },
  { key: 'vendors', label: 'Vendors' },
  { key: 'budget', label: 'Budget' },
  { key: 'guests', label: 'Guests' },
];

export function WeddingPage() {
  const { state, today, actions } = useStore();
  const forms = useForms();
  const { query } = useRoute();
  const raw = query.get('tab');
  const tab: Tab = TABS.some((t) => t.key === raw) ? (raw as Tab) : 'overview';
  const w = state.wedding;
  const plan = weddingPlan(state);
  // The page's own hue: set while it's open, gone when it isn't.
  useEffect(() => {
    document.documentElement.dataset.theme = 'wedding';
    return () => {
      delete document.documentElement.dataset.theme;
    };
  }, []);
  const tasks = plan ? state.tasks.filter((t) => t.planId === plan.id) : [];
  const open = viewTasks(tasks, 'all');
  const doneTasks = viewTasks(tasks, 'completed');
  const c = countdown(w?.date, today);
  const g = guestCounts(state.guests);
  const vc = vendorCounts(state.vendors);
  const totals = budgetTotals(state.budget, w?.budget);

  const newChecklistTask = () => forms.open({ kind: 'task', prefill: plan ? { planId: plan.id } : {} });
  const startChecklist = async () => {
    const r = await actions.savePlan(null, { title: 'Wedding checklist', description: 'Everything to do before the day.', template: 'wedding', target: w?.date });
    if (r.ok) forms.open({ kind: 'task', prefill: { planId: r.value } });
  };

  return (
    <div className="page">
      <PageHeader
        title="Wedding"
        sub={w?.date ? `${displayDate(w.date, today)}${w.time ? ` · ${formatTime(w.time)}` : ''}${w.venue ? ` · ${w.venue.split('\n')[0]}` : ''}` : 'Everything for the day, in one place.'}
        actions={
          <button type="button" className="btn btn-quiet btn-sm" onClick={() => forms.open({ kind: 'wedding' })}>
            <Icon name="edit" size={17} /> {w ? 'Edit details' : 'Set the date'}
          </button>
        }
      />
      <FilterChips label="Wedding section" current={tab} items={TABS.map((t) => ({ key: t.key, label: t.label, to: t.key === 'overview' ? routes.wedding : routes.weddingTab(t.key) }))} />

      {tab === 'overview' && (
        <>
          <figure className="wed-art">
            <img src={artLarge} srcSet={`${artSmall} 600w, ${artLarge} 1200w`} sizes="(min-width: 900px) 520px, 100vw" width={1200} height={1200} alt="The two of you, drawn: in white coats, hand in hand in a hospital corridor at sunset." decoding="async" />
          </figure>
          <div className="wed-hero">
            <span className="wed-hero-label">
              <Icon name="heart" size={12} /> Countdown
            </span>
            <span className="wed-hero-count" aria-live="polite">{c.label}</span>
            <span className="wed-hero-sub">{c.sub}</span>
            {w?.date && (
              <span className="wed-hero-when">
                <span>{displayDate(w.date, today)}</span>
                {w.time && <span>{formatTime(w.time)}</span>}
                {w.venue && <span>{w.venue.split('\n')[0]}</span>}
              </span>
            )}
            {!w?.date && (
              <button type="button" className="btn btn-primary btn-sm" onClick={() => forms.open({ kind: 'wedding' })}>
                <Icon name="calendar" size={17} /> Set the date
              </button>
            )}
          </div>

          <div className="wed-stats">
            <Link to={routes.weddingTab('checklist')} className="wed-stat">
              <span className="wed-stat-n">{open.length}</span>
              <span className="wed-stat-l">to do{doneTasks.length ? ` · ${doneTasks.length} done` : ''}</span>
            </Link>
            <Link to={routes.weddingTab('guests')} className="wed-stat">
              <span className="wed-stat-n">{g.yes}</span>
              <span className="wed-stat-l">coming{g.pending ? ` · ${g.pending} waiting` : g.people ? ` of ${g.people}` : ''}</span>
            </Link>
            <Link to={routes.weddingTab('budget')} className="wed-stat">
              <span className={`wed-stat-n ${money(totals.paid).length > 7 ? 'is-long' : ''}`}>{money(totals.paid)}</span>
              <span className="wed-stat-l">paid{totals.overall !== undefined ? ` of ${money(totals.overall)}` : totals.planned ? ` of ${money(totals.planned)}` : ''}</span>
            </Link>
          </div>

          {w?.address && (
            <div className="card">
              <p className="card-title">{w.venue || 'The venue'}</p>
              <p className="muted pre">{w.address}</p>
              <a className="btn btn-quiet btn-sm" href={directionsHref(w.address)} target="_blank" rel="noopener noreferrer">
                <Icon name="map" size={17} /> Directions
              </a>
            </div>
          )}

          <Section title="The day" id="schedule">
            {w?.schedule ? (
              <ul className="wed-schedule card">
                {scheduleLines(w.schedule).map((l, i) => (
                  <li key={i}>
                    <span className="wed-time">{l.time}</span>
                    <span>{l.what}</span>
                  </li>
                ))}
              </ul>
            ) : (
              <p className="muted">No schedule yet. Add the day’s moments under Edit details, one per line.</p>
            )}
          </Section>

          {vc.depositsDue > 0 && (
            <Section title="Deposits due" id="deposits">
              <ul className="wed-rows">{byName(state.vendors.filter((v) => v.deposit === 'due')).map((v) => <VendorRow key={v.id} v={v} today={today} />)}</ul>
            </Section>
          )}

          {w?.notes && (
            <Section title="Notes" id="wed-notes">
              <p className="notes">{w.notes}</p>
            </Section>
          )}
          {w && <UpdatedBy by={w.updatedBy} at={w.updatedAt} />}
        </>
      )}

      {tab === 'checklist' && (
        <Section
          title="Checklist"
          count={open.length}
          id="checklist"
          action={
            <button type="button" className="btn btn-primary btn-sm" onClick={() => (plan ? newChecklistTask() : void startChecklist())}>
              <Icon name="plus" size={17} /> Add task
            </button>
          }
        >
          {!plan ? (
            <EmptyState title="No checklist yet." body="Add the first task and the checklist starts. Tasks get due dates, go to either of you, and show on the calendar." />
          ) : tasks.length === 0 ? (
            <EmptyState title="Nothing on the checklist yet." body="Add a task above." />
          ) : (
            <ul className="task-list card">
              {[...open, ...doneTasks].map((t) => (
                <TaskRow key={t.id} task={t} showPlan={false} />
              ))}
            </ul>
          )}
        </Section>
      )}

      {tab === 'vendors' && (
        <Section
          title="Vendors"
          count={state.vendors.length}
          id="vendors"
          action={
            <button type="button" className="btn btn-primary btn-sm" onClick={() => forms.open({ kind: 'vendor' })}>
              <Icon name="plus" size={17} /> Add vendor
            </button>
          }
        >
          {state.vendors.length === 0 ? (
            <EmptyState title="No vendors yet." body="The venue, photographer, caterer… each with its contact, whether it’s booked, and the deposit." />
          ) : (
            <ul className="wed-rows">
              {[...byName(state.vendors.filter((v) => v.status === 'booked')), ...byName(state.vendors.filter((v) => v.status !== 'booked'))].map((v) => (
                <VendorRow key={v.id} v={v} today={today} />
              ))}
            </ul>
          )}
        </Section>
      )}

      {tab === 'budget' && (
        <Section
          title="Budget"
          count={state.budget.length}
          id="budget"
          action={
            <button type="button" className="btn btn-primary btn-sm" onClick={() => forms.open({ kind: 'budget' })}>
              <Icon name="plus" size={17} /> Add line
            </button>
          }
        >
          <div className="card stack">
            <div className="wed-totals">
              <span>
                Paid <strong>{money(totals.paid)}</strong>
              </span>
              <span>
                Planned <strong>{money(totals.planned)}</strong>
              </span>
              {totals.overall !== undefined && (
                <span>
                  Budget <strong>{money(totals.overall)}</strong>
                </span>
              )}
            </div>
            <div className="wed-bar" role="img" aria-label={`${money(totals.paid)} paid of ${money(totals.overall ?? totals.planned)}`}>
              <span className="wed-bar-planned" style={{ width: `${totals.plannedShare * 100}%` }} />
              <span className="wed-bar-paid" style={{ width: `${totals.paidShare * 100}%` }} />
            </div>
            {totals.remaining !== undefined && (
              <p className={`small ${totals.remaining < 0 ? 'danger-text' : 'muted'}`}>
                {totals.remaining < 0 ? `${money(-totals.remaining)} over the budget as planned.` : `${money(totals.remaining)} of the budget not yet planned.`}
              </p>
            )}
            {totals.overall === undefined && (
              <button type="button" className="btn btn-quiet btn-sm" onClick={() => forms.open({ kind: 'wedding' })}>
                Set an overall budget
              </button>
            )}
          </div>
          {state.budget.length === 0 ? (
            <EmptyState title="No budget lines yet." body="Add what you expect to spend on each part, then record what’s been paid." />
          ) : (
            <ul className="wed-rows">
              {[...state.budget].sort((a, b) => b.planned - a.planned || a.title.localeCompare(b.title)).map((b) => (
                <BudgetRow key={b.id} b={b} />
              ))}
            </ul>
          )}
        </Section>
      )}

      {tab === 'guests' && (
        <Section
          title="Guests"
          count={g.parties}
          id="guests"
          action={
            <button type="button" className="btn btn-primary btn-sm" onClick={() => forms.open({ kind: 'guest' })}>
              <Icon name="plus" size={17} /> Add guest
            </button>
          }
        >
          {g.parties > 0 && (
            <div className="wed-stats">
              <div className="wed-stat">
                <span className="wed-stat-n">{g.yes}</span>
                <span className="wed-stat-l">coming</span>
              </div>
              <div className="wed-stat">
                <span className="wed-stat-n">{g.pending}</span>
                <span className="wed-stat-l">to hear from</span>
              </div>
              <div className="wed-stat">
                <span className="wed-stat-n">{g.no}</span>
                <span className="wed-stat-l">not coming</span>
              </div>
            </div>
          )}
          {g.parties === 0 ? (
            <EmptyState title="No guests yet." body="Add each guest, or a couple or family as one line, and keep their RSVP, table and meal here." />
          ) : (
            <ul className="wed-rows">
              {byName(state.guests).map((gu) => (
                <GuestRow key={gu.id} g={gu} />
              ))}
            </ul>
          )}
        </Section>
      )}
    </div>
  );
}

function VendorRow({ v, today }: { v: Vendor; today: string }) {
  const forms = useForms();
  const site = v.website ? safeUrl(v.website) : undefined;
  const due = v.deposit === 'due' && v.depositDue ? dueState(v.depositDue, today) : 'none';
  return (
    <li className="wed-row">
      <div className="wed-row-main">
        <div className="wed-row-title">
          <button type="button" className="wed-row-name" onClick={() => forms.open({ kind: 'vendor', id: v.id })} aria-label={`Edit ${v.name}`}>
            {v.name}
          </button>
          <span className="wed-row-sub">{v.category}{v.contact ? ` · ${v.contact}` : ''}</span>
        </div>
        <div className="wed-row-meta">
          <Chip tone={v.status === 'booked' ? 'good' : 'neutral'} icon={v.status === 'booked' ? 'check' : undefined}>{v.status === 'booked' ? 'Booked' : 'Considering'}</Chip>
          {v.deposit === 'paid' && <Chip tone="neutral">Deposit paid</Chip>}
          {v.deposit === 'due' && (
            <Chip tone={due === 'overdue' ? 'warn' : due === 'today' || due === 'soon' ? 'heart' : 'neutral'} icon="calendar">
              Deposit due{v.depositDue ? ` ${displayDate(v.depositDue, today)}` : ''}
            </Chip>
          )}
        </div>
        {v.notes && <span className="wed-row-sub">{v.notes}</span>}
      </div>
      <div className="wed-row-actions">
        {v.phone && (
          <a className="icon-btn" href={telHref(v.phone)} aria-label={`Call ${v.name}`}>
            <Icon name="phone" size={20} />
          </a>
        )}
        {v.email && (
          <a className="icon-btn" href={`mailto:${v.email}`} aria-label={`Email ${v.name}`}>
            <Icon name="mail" size={20} />
          </a>
        )}
        {site && (
          <a className="icon-btn" href={site} target="_blank" rel="noopener noreferrer" aria-label={`${v.name} website`}>
            <Icon name="globe" size={20} />
          </a>
        )}
      </div>
    </li>
  );
}

function GuestRow({ g }: { g: Guest }) {
  const { actions } = useStore();
  const forms = useForms();
  const side = g.side === 'both' ? 'Both of ours' : `${MEMBERS[g.side].name}’s`;
  const opts: Array<{ v: Guest['rsvp']; label: string; cls?: string }> = [
    { v: 'yes', label: 'Yes' },
    { v: 'no', label: 'No', cls: 'rsvp-no' },
    { v: 'pending', label: '?' },
  ];
  return (
    <li className="wed-row">
      <div className="wed-row-main">
        <div className="wed-row-title">
          <button type="button" className="wed-row-name" onClick={() => forms.open({ kind: 'guest', id: g.id })} aria-label={`Edit ${g.name}`}>
            {g.name}
          </button>
          <span className="wed-row-sub">
            {side}
            {g.party > 1 ? ` · ${g.party} people` : ''}
            {g.table ? ` · Table ${g.table}` : ''}
            {g.meal ? ` · ${g.meal}` : ''}
          </span>
        </div>
        {g.notes && <span className="wed-row-sub">{g.notes}</span>}
      </div>
      <div className="rsvp" role="group" aria-label={`RSVP for ${g.name}`}>
        {opts.map((o) => (
          <button key={o.v} type="button" className={o.cls} aria-pressed={g.rsvp === o.v} aria-label={`${g.name}: ${o.v === 'yes' ? 'coming' : o.v === 'no' ? 'not coming' : 'no answer yet'}`} onClick={() => void actions.setRsvp(g.id, o.v)}>
            {o.label}
          </button>
        ))}
      </div>
    </li>
  );
}

function BudgetRow({ b }: { b: BudgetItem }) {
  const forms = useForms();
  return (
    <li className="wed-row">
      <div className="wed-row-main">
        <div className="wed-row-title">
          <button type="button" className="wed-row-name" onClick={() => forms.open({ kind: 'budget', id: b.id })} aria-label={`Edit ${b.title}`}>
            {b.title}
          </button>
          {b.category && <span className="wed-row-sub">{b.category}</span>}
        </div>
        {b.notes && <span className="wed-row-sub">{b.notes}</span>}
      </div>
      <div className="wed-amount">
        <div>{money(b.planned)}</div>
        <div className="wed-amount-paid">{b.paid >= b.planned && b.planned > 0 ? 'Paid in full' : b.paid > 0 ? `${money(b.paid)} paid` : 'Nothing paid yet'}</div>
      </div>
    </li>
  );
}
