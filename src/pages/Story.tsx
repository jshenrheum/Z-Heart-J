import { useEffect, useRef, useState, type ChangeEvent } from 'react';
import type { Moment, PhotoRef } from '../data/types.ts';
import { useStore } from '../data/store.tsx';
import { displayDate } from '../lib/dates.ts';
import { useOnline } from '../lib/online.ts';
import { historyState, Link } from '../lib/router.tsx';
import { routes } from '../lib/routes.ts';
import { countdown } from '../lib/wedding.ts';
import { useForms } from '../components/Forms.tsx';
import { Icon } from '../components/Icon.tsx';
import { EmptyState, PageHeader } from '../components/ui.tsx';
import artSmall from '../assets/art/us-600.webp';

/** The Our story tab (and its Wedding folder) take a deep magenta hue while open. */
export function useStoryTheme() {
  useEffect(() => {
    document.documentElement.dataset.theme = 'story';
    return () => {
      delete document.documentElement.dataset.theme;
    };
  }, []);
}

const longDate = (d: string) => {
  const [y, m, day] = d.split('-').map(Number) as [number, number, number];
  return new Intl.DateTimeFormat('en-US', { timeZone: 'UTC', month: 'long', day: 'numeric', year: 'numeric' }).format(new Date(Date.UTC(y, m - 1, day)));
};

export function StoryPage() {
  const { state, today } = useStore();
  const forms = useForms();
  useStoryTheme();
  const moments = [...state.moments].sort((a, b) => a.date.localeCompare(b.date) || a.title.localeCompare(b.title));
  const w = state.wedding;
  const c = countdown(w?.date, today);
  const [viewing, setViewing] = useState<{ moment: Moment; index: number } | null>(null);
  const live = viewing ? state.moments.find((m) => m.id === viewing.moment.id) : undefined;

  // After adding a moment, bring it into view.
  useEffect(() => {
    const id = historyState<{ focusMoment?: string }>()?.focusMoment;
    if (id) document.getElementById(`m-${id}`)?.scrollIntoView({ block: 'center' });
  }, [moments.length]);

  const years: Array<{ year: string; items: Moment[] }> = [];
  for (const m of moments) {
    const y = m.date.slice(0, 4);
    const last = years[years.length - 1];
    if (last && last.year === y) last.items.push(m);
    else years.push({ year: y, items: [m] });
  }

  return (
    <div className="page story-page">
      <PageHeader
        title="Our story"
        sub={moments.length ? `${moments.length} moment${moments.length === 1 ? '' : 's'} since ${longDate(moments[0]!.date)}` : 'The days worth keeping, with their photos.'}
        actions={
          <button type="button" className="btn btn-primary btn-sm" onClick={() => forms.open({ kind: 'moment' })}>
            <Icon name="plus" size={17} /> Add a moment
          </button>
        }
      />

      <Link to={routes.wedding} className="folder" aria-label={`Wedding: ${w?.date ? `${c.label} ${c.sub}` : 'set the date'}`}>
        <img className="folder-art" src={artSmall} alt="" width={64} height={64} />
        <span className="folder-main">
          <span className="folder-title">Wedding</span>
          <span className="folder-sub">{w?.date ? `${c.label} ${c.sub} · ${displayDate(w.date, today)}` : 'Set the date, the checklist, vendors, budget and guests'}</span>
        </span>
        <Icon name="chevron" size={18} className="card-chev" />
      </Link>

      {moments.length === 0 ? (
        <EmptyState title="Your story starts here." body="Add your first moment: the day you met, a first trip, the proposal. Each one keeps its date, the place, a few words and its photos." />
      ) : (
        <ol className="timeline">
          {years.map((y) => (
            <li key={y.year} className="timeline-year">
              <h2 className="timeline-year-label">{y.year}</h2>
              <ol className="timeline-items">
                {y.items.map((m) => (
                  <MomentCard key={m.id} m={m} onOpen={(index) => setViewing({ moment: m, index })} />
                ))}
              </ol>
            </li>
          ))}
        </ol>
      )}

      {viewing && live && live.photos.length > 0 && <PhotoViewer moment={live} start={Math.min(viewing.index, live.photos.length - 1)} onClose={() => setViewing(null)} />}
    </div>
  );
}

function MomentCard({ m, onOpen }: { m: Moment; onOpen: (index: number) => void }) {
  const { actions, backend } = useStore();
  const forms = useForms();
  const online = useOnline();
  const [adding, setAdding] = useState(0);
  const input = useRef<HTMLInputElement>(null);
  const [first, ...rest] = m.photos;
  const more = rest.slice(0, 3);
  const extra = rest.length - more.length;

  const pick = async (e: ChangeEvent<HTMLInputElement>) => {
    const files = [...(e.target.files ?? [])];
    e.target.value = '';
    if (!files.length) return;
    setAdding(files.length);
    await actions.addPhotos(m.id, files);
    setAdding(0);
  };

  return (
    <li className="moment" id={`m-${m.id}`}>
      <span className="moment-dot" aria-hidden="true" />
      <article className="moment-card">
        {first && (
          <div className={`moment-photos ${more.length ? 'has-more' : ''}`}>
            <button type="button" className="moment-photo moment-photo-main" onClick={() => onOpen(0)} aria-label={`Open the photos of “${m.title}”`}>
              <img src={backend.photoUrl(first.id)} alt="" width={first.w} height={first.h} loading="lazy" decoding="async" />
            </button>
            {more.length > 0 && (
              <div className={`moment-thumbs n-${more.length}`}>
                {more.map((p, i) => (
                  <button key={p.id} type="button" className="moment-photo" onClick={() => onOpen(i + 1)} aria-label={`Photo ${i + 2} of ${m.photos.length}`}>
                    <img src={backend.photoUrl(p.id)} alt="" width={p.w} height={p.h} loading="lazy" decoding="async" />
                    {i === more.length - 1 && extra > 0 && <span className="moment-more">+{extra}</span>}
                  </button>
                ))}
              </div>
            )}
          </div>
        )}
        <div className="moment-body">
          <p className="moment-date">
            <time dateTime={m.date}>{longDate(m.date)}</time>
            {m.place && <span> · {m.place}</span>}
          </p>
          <h3 className="moment-title">{m.title}</h3>
          {m.story && <p className="moment-story">{m.story}</p>}
          <div className="moment-actions">
            <input ref={input} id={`add-${m.id}`} className="sr-only" type="file" accept="image/*" multiple disabled={!online || adding > 0} onChange={(e) => void pick(e)} />
            <label htmlFor={`add-${m.id}`} className={`btn btn-quiet btn-sm ${!online || adding > 0 ? 'is-disabled' : ''}`} aria-disabled={!online || adding > 0 || undefined}>
              <Icon name="plus" size={16} /> {adding ? `Adding ${adding === 1 ? 'a photo' : `${adding} photos`}…` : m.photos.length ? 'Add photos' : 'Add a photo'}
            </label>
            <button type="button" className="btn btn-quiet btn-sm" onClick={() => forms.open({ kind: 'moment', id: m.id })} aria-label={`Edit “${m.title}”`}>
              <Icon name="edit" size={16} /> Edit
            </button>
          </div>
        </div>
      </article>
    </li>
  );
}

/** Full-screen photos of one moment: swipe or the arrows to move, Esc or × to close. */
function PhotoViewer({ moment, start, onClose }: { moment: Moment; start: number; onClose: () => void }) {
  const { actions, backend } = useStore();
  const [i, setI] = useState(start);
  const close = useRef<HTMLButtonElement>(null);
  const back = useRef<Element | null>(document.activeElement);
  const touch = useRef<number | null>(null);
  const n = moment.photos.length;
  const at = Math.min(i, n - 1);
  const p: PhotoRef | undefined = moment.photos[at];
  const go = (d: number) => setI((x) => (Math.min(x, n - 1) + d + n) % n);

  useEffect(() => {
    close.current?.focus();
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose();
      else if (e.key === 'ArrowRight') go(1);
      else if (e.key === 'ArrowLeft') go(-1);
    };
    window.addEventListener('keydown', onKey);
    const prev = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    const returnTo = back.current;
    return () => {
      window.removeEventListener('keydown', onKey);
      document.body.style.overflow = prev;
      if (returnTo instanceof HTMLElement) returnTo.focus();
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  if (!p) return null;
  return (
    <div
      className="viewer"
      role="dialog"
      aria-modal="true"
      aria-label={`${moment.title}, photo ${at + 1} of ${n}`}
      onTouchStart={(e) => (touch.current = e.touches[0]?.clientX ?? null)}
      onTouchEnd={(e) => {
        const x0 = touch.current;
        const x1 = e.changedTouches[0]?.clientX;
        touch.current = null;
        if (x0 !== null && x1 !== undefined && Math.abs(x1 - x0) > 50 && n > 1) go(x1 < x0 ? 1 : -1);
      }}
    >
      <div className="viewer-bar">
        <span className="viewer-count">{n > 1 ? `${at + 1} of ${n}` : moment.title}</span>
        <button
          type="button"
          className="btn btn-quiet btn-sm"
          onClick={() => {
            void actions.removePhoto(moment.id, p.id);
            if (n === 1) onClose();
          }}
        >
          <Icon name="trash" size={16} /> Remove
        </button>
        <button ref={close} type="button" className="icon-btn viewer-close" onClick={onClose} aria-label="Close">
          <Icon name="x" size={22} />
        </button>
      </div>
      <img className="viewer-img" src={backend.photoUrl(p.id)} alt={`${moment.title}, photo ${at + 1}`} width={p.w} height={p.h} />
      {n > 1 && (
        <>
          <button type="button" className="viewer-nav viewer-prev" onClick={() => go(-1)} aria-label="Previous photo">
            <Icon name="chevron" size={26} className="flip" />
          </button>
          <button type="button" className="viewer-nav viewer-next" onClick={() => go(1)} aria-label="Next photo">
            <Icon name="chevron" size={26} />
          </button>
        </>
      )}
    </div>
  );
}
