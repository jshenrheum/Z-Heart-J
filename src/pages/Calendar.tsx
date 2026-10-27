import { useMemo } from 'react';
import { MEMBERS, otherMember, type Assignee } from '../data/types.ts';
import { useStore } from '../data/store.tsx';
import {
  calendarItems, formatTime, itemsOn, monthGrid, monthOf, monthTitle, nextOccurrence, repeatLabel, shiftMonth, timeLabel, type CalItem, type WhoFilter,
} from '../lib/calendar.ts';
import { addDays, diffDays, displayDate, isDateStr, parseDate, type DateStr } from '../lib/dates.ts';
import { Link, navigate, useRoute } from '../lib/router.tsx';
import { routes } from '../lib/routes.ts';
import { useForms } from '../components/Forms.tsx';
import { Icon } from '../components/Icon.tsx';
import { Chip, EmptyState, FilterChips, PageHeader, Section, UpdatedBy, ValueRow } from '../components/ui.tsx';
import { NotFound } from './NotFound.tsx';

const WEEKDAYS = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];
const UPCOMING_DAYS = 21;
const UPCOMING_MAX = 20;

export const whoseLabel = (w: Assignee) => (w === 'both' ? 'Both' : MEMBERS[w].name);

function dayLabel(d: DateStr, today: DateStr): string {
  const n = diffDays(d, today);
  const date = displayDate(d, today);
  if (n === 0) return `Today · ${date}`;
  if (n === 1) return `Tomorrow · ${date}`;
  if (n === -1) return `Yesterday · ${date}`;
  return date;
}

function fullDay(d: DateStr): string {
  const { y, m, d: day } = parseDate(d);
  return new Intl.DateTimeFormat('en-US', { timeZone: 'UTC', weekday: 'long', month: 'long', day: 'numeric' }).format(new Date(Date.UTC(y, m - 1, day)));
}

/** One line of the agenda: time, whose colour, title and context. */
function shortDay(d: DateStr, today: DateStr): string {
  const n = diffDays(d, today);
  if (n === 0) return 'Today';
  if (n === 1) return 'Tomorrow';
  const { y, m, d: day } = parseDate(d);
  const weekday = new Intl.DateTimeFormat('en-US', { timeZone: 'UTC', weekday: 'short' }).format(new Date(Date.UTC(y, m - 1, day)));
  return `${weekday} ${day}`;
}

export function CalRow({ item, today, withDay }: { item: CalItem; today: DateStr; withDay?: boolean }) {
  const sub = [
    whoseLabel(item.whose),
    item.endTime ? `until ${formatTime(item.endTime)}` : '',
    item.endDate ? `through ${displayDate(item.endDate, today)}` : '',
    item.sub ?? '',
    item.repeating ? 'Repeats' : '',
  ].filter(Boolean);
  return (
    <li className="cal-row">
      <Link to={item.route} className="cal-link">
        <span className="cal-time">
          {withDay && <span className="cal-time-day">{shortDay(item.date, today)}</span>}
          {item.startTime ? formatTime(item.startTime) : 'All day'}
        </span>
        <span className={`cal-bar whose-${item.whose}`} aria-hidden="true" />
        <span className="cal-main">
          <span className="cal-item-title">{item.title}</span>
          <span className="cal-sub">{sub.join(' · ')}</span>
        </span>
        <Icon name="chevron" size={16} className="card-chev" />
      </Link>
    </li>
  );
}

export function CalendarPage() {
  const { state, me, today } = useStore();
  const forms = useForms();
  const { query } = useRoute();
  const other = otherMember(me);

  const whoRaw = query.get('who');
  const who: WhoFilter = whoRaw === 'jeffrey' || whoRaw === 'zul' ? whoRaw : 'all';
  const dRaw = query.get('d');
  const day = dRaw && isDateStr(dRaw) ? dRaw : today;
  const mRaw = query.get('m') ?? '';
  const month = /^\d{4}-(0[1-9]|1[0-2])$/.test(mRaw) ? mRaw : monthOf(day);

  const href = (p: { who?: WhoFilter; m?: string; d?: DateStr }) => {
    const q = new URLSearchParams();
    const w = p.who ?? who;
    if (w !== 'all') q.set('who', w);
    q.set('m', p.m ?? month);
    q.set('d', p.d ?? day);
    return `${routes.calendar}?${q}`;
  };
  const go = (p: { m?: string; d?: DateStr }) => navigate(href(p), { replace: true, keepScroll: true });

  const grid = useMemo(() => monthGrid(month), [month]);
  const gridItems = useMemo(() => calendarItems(state, grid[0]!, grid[41]!, who), [state, grid, who]);
  const dayItems = useMemo(() => itemsOn(calendarItems(state, day, day, who), day), [state, day, who]);
  const upcoming = useMemo(() => {
    const from = addDays(day, 1);
    const all = calendarItems(state, from, addDays(day, UPCOMING_DAYS), who).slice(0, UPCOMING_MAX);
    const groups = new Map<DateStr, CalItem[]>();
    for (const i of all) {
      const d = diffDays(i.date, from) < 0 ? from : i.date; // a trip already under way shows from the next day
      groups.set(d, [...(groups.get(d) ?? []), i]);
    }
    return [...groups.entries()];
  }, [state, day, who]);

  return (
    <div className="page">
      <PageHeader
        title="Calendar"
        actions={
          <button type="button" className="btn btn-primary btn-sm" onClick={() => forms.open({ kind: 'event', date: day })}>
            <Icon name="plus" size={17} /> New event
          </button>
        }
      />
      <div className="cal-filters">
        <FilterChips
          label="Whose calendar"
          current={who}
          items={[
            { key: 'all', label: 'Everyone', to: href({ who: 'all' }) },
            { key: me, label: 'Mine', to: href({ who: me }) },
            { key: other, label: `${MEMBERS[other].name}’s`, to: href({ who: other }) },
          ]}
        />
        <p className="cal-legend" aria-label="Colours">
          <span><i className="dot whose-jeffrey" aria-hidden="true" /> Jeffrey</span>
          <span><i className="dot whose-zul" aria-hidden="true" /> Zul</span>
          <span><i className="dot whose-both" aria-hidden="true" /> Both</span>
        </p>
      </div>

      <section className="card cal" aria-labelledby="cal-month">
        <div className="cal-head">
          <h2 className="cal-title" id="cal-month">
            {monthTitle(month)}
          </h2>
          <div className="cal-nav">
            <button type="button" className="icon-btn" aria-label="Previous month" onClick={() => go({ m: shiftMonth(month, -1) })}>
              <Icon name="chevron" size={18} className="flip" />
            </button>
            <button type="button" className="btn btn-quiet btn-sm" onClick={() => go({ m: monthOf(today), d: today })}>
              Today
            </button>
            <button type="button" className="icon-btn" aria-label="Next month" onClick={() => go({ m: shiftMonth(month, 1) })}>
              <Icon name="chevron" size={18} />
            </button>
          </div>
        </div>
        <div className="cal-week" aria-hidden="true">
          {WEEKDAYS.map((w) => (
            <span key={w}>{w.slice(0, 1)}</span>
          ))}
        </div>
        <div className="cal-grid">
          {grid.map((d) => {
            const on = itemsOn(gridItems, d);
            const whose = [...new Set(on.map((i) => i.whose))].sort();
            const cls = ['cal-day', monthOf(d) !== month ? 'is-other' : '', d === today ? 'is-today' : '', d === day ? 'is-on' : ''].filter(Boolean).join(' ');
            return (
              <button
                key={d}
                type="button"
                className={cls}
                aria-pressed={d === day}
                aria-current={d === today ? 'date' : undefined}
                aria-label={`${fullDay(d)}${on.length ? `, ${on.length} item${on.length === 1 ? '' : 's'}` : ''}`}
                onClick={() => go({ d, m: monthOf(d) })}
              >
                <span className="cal-num">{Number(d.slice(8))}</span>
                <span className="cal-dots" aria-hidden="true">
                  {whose.slice(0, 3).map((w) => (
                    <i key={w} className={`dot whose-${w}`} />
                  ))}
                </span>
              </button>
            );
          })}
        </div>
      </section>

      <Section title={dayLabel(day, today)} id="cal-day">
        {dayItems.length > 0 ? (
          <ul className="cal-list card">
            {dayItems.map((i) => (
              <CalRow key={i.key} item={i} today={today} />
            ))}
          </ul>
        ) : (
          <div className="empty">
            <p className="muted">Nothing {who === 'all' ? '' : `${who === me ? 'of yours ' : `of ${MEMBERS[other].name}’s `}`}on this day.</p>
            <button type="button" className="btn btn-quiet btn-sm" onClick={() => forms.open({ kind: 'event', date: day })}>
              <Icon name="plus" size={17} /> Add an event
            </button>
          </div>
        )}
      </Section>

      <Section title="Coming up" id="cal-next">
        {upcoming.length > 0 ? (
          <div className="cal-agenda card">
            {upcoming.map(([d, list]) => (
              <div key={d}>
                <h3 className="cal-day-head">
                  <button type="button" className="cal-day-link" onClick={() => go({ d, m: monthOf(d) })}>
                    {dayLabel(d, today)}
                  </button>
                </h3>
                <ul className="cal-list">
                  {list.map((i) => (
                    <CalRow key={i.key} item={i} today={today} />
                  ))}
                </ul>
              </div>
            ))}
          </div>
        ) : (
          <EmptyState title="Nothing in the next three weeks." body="Events, dated tasks, plan dates and credential expiry dates all show up here. Later months are on the calendar above." />
        )}
      </Section>
    </div>
  );
}

// ------------------------------------------------------------------ one event

export function EventPage({ id }: { id: string }) {
  const { state, today, actions } = useStore();
  const forms = useForms();
  const { query } = useRoute();
  const ev = state.events.find((e) => e.id === id);
  if (!ev) return <NotFound what="event" />;

  const onRaw = query.get('on');
  const on = ev.repeat ? (onRaw && isDateStr(onRaw) ? onRaw : (nextOccurrence(ev, today) ?? ev.date)) : ev.date;
  const end = ev.endDate ? addDays(on, diffDays(ev.endDate, ev.date)) : undefined;
  const when = `${displayDate(on, today)}${end ? ` – ${displayDate(end, today)}` : ''} · ${timeLabel(ev)}`;
  const next = ev.repeat ? nextOccurrence(ev, addDays(on, 1)) : undefined;
  const repeat = repeatLabel(ev);

  return (
    <div className="page">
      <PageHeader
        title={ev.title}
        sub={
          <span className="chip-row">
            <Chip>
              <i className={`dot whose-${ev.whose}`} aria-hidden="true" /> {whoseLabel(ev.whose)}
            </Chip>
            {repeat && <Chip icon="repeat">{repeat}</Chip>}
          </span>
        }
        back={{ to: `${routes.calendar}?m=${monthOf(on)}&d=${on}`, label: 'Calendar' }}
        actions={
          <button type="button" className="btn btn-quiet btn-sm" onClick={() => forms.open({ kind: 'event', id: ev.id })}>
            <Icon name="edit" size={17} /> Edit
          </button>
        }
      />
      <div className="card rows">
        <ValueRow label="When" value={when} kind="text" />
        {ev.location && <ValueRow label="Where" value={ev.location} kind="address" />}
        {repeat && <ValueRow label="Repeats" value={`${repeat}${ev.repeat?.until ? `, until ${displayDate(ev.repeat.until, today)}` : ''}${next ? ` · next ${displayDate(next, today)}` : ''}`} kind="text" />}
      </div>
      {ev.notes && <p className="notes">{ev.notes}</p>}

      {ev.repeat && (
        <Section title="Just this day" id="ev-one">
          <div className="card">
            <p className="muted">Not happening on {displayDate(on, today)}? Remove only that day; the other repeats stay.</p>
            <button
              type="button"
              className="btn btn-quiet"
              onClick={async () => {
                const r = await actions.skipEventDay(ev.id, on);
                if (r.ok) navigate(`${routes.calendar}?m=${monthOf(on)}&d=${on}`);
              }}
            >
              <Icon name="x" size={17} /> Remove {displayDate(on, today)} only
            </button>
          </div>
        </Section>
      )}
      <UpdatedBy by={ev.updatedBy} at={ev.updatedAt} />
    </div>
  );
}
