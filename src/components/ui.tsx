import { useEffect, useRef, type ReactNode } from 'react';
import { MEMBERS, type FieldKind, type MemberId, type PinTarget } from '../data/types.ts';
import { useStore } from '../data/store.tsx';
import { useFeedback } from '../lib/feedback.tsx';
import { Link } from '../lib/router.tsx';
import { directionsHref, safeUrl, telHref } from '../lib/summary.ts';
import { Icon, type IconName } from './Icon.tsx';

export function timeAgo(iso: string, now = Date.now()): string {
  const days = Math.floor((now - new Date(iso).getTime()) / 86_400_000);
  if (days <= 0) return 'today';
  if (days === 1) return 'yesterday';
  if (days < 14) return `${days} days ago`;
  return new Date(iso).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: days > 300 ? 'numeric' : undefined });
}

export function UpdatedBy({ by, at }: { by: MemberId; at: string }) {
  return (
    <p className="updated-by">
      Updated by {MEMBERS[by].name} · {timeAgo(at)}
    </p>
  );
}

export function PageHeader({ title, sub, actions, back }: { title: string; sub?: ReactNode; actions?: ReactNode; back?: { to: string; label: string } }) {
  return (
    <div className="page-head">
      {back && (
        <Link to={back.to} className="back-link">
          <Icon name="chevron" size={16} className="flip" /> {back.label}
        </Link>
      )}
      <div className="page-head-row">
        <div className="page-head-text">
          <h1 className="page-title">{title}</h1>
          {sub && <p className="page-sub">{sub}</p>}
        </div>
        {actions && <div className="page-head-actions">{actions}</div>}
      </div>
    </div>
  );
}

/** A section that starts closed: its title is the dropdown; a chevron turns as it opens. */
export function FoldSection({ title, count, action, children, id }: { title: string; count?: number; action?: ReactNode; children: ReactNode; id?: string }) {
  return (
    <details className="section fold" id={id}>
      <summary className="section-head fold-head">
        <h2 className="section-title" id={id ? `${id}-h` : undefined}>
          <Icon name="chevron" size={14} className="fold-chev" />
          {title}
          {count !== undefined && <span className="count">{count}</span>}
        </h2>
      </summary>
      <div className="fold-body">
        {action && <div className="fold-action">{action}</div>}
        {children}
      </div>
    </details>
  );
}

export function Section({ title, count, action, children, id }: { title: string; count?: number; action?: ReactNode; children: ReactNode; id?: string }) {
  return (
    <section className="section" aria-labelledby={id ? `${id}-h` : undefined}>
      <div className="section-head">
        <h2 className="section-title" id={id ? `${id}-h` : undefined}>
          {title}
          {count !== undefined && <span className="count">{count}</span>}
        </h2>
        {action}
      </div>
      {children}
    </section>
  );
}

export function Chip({ children, tone = 'neutral', icon }: { children: ReactNode; tone?: 'neutral' | 'warn' | 'good' | 'heart' | 'lock'; icon?: IconName }) {
  return (
    <span className={`chip chip-${tone}`}>
      {icon && <Icon name={icon} size={14} />}
      {children}
    </span>
  );
}

export function EmptyState({ title, body, action }: { title: string; body?: string; action?: ReactNode }) {
  return (
    <div className="empty">
      <p className="empty-title">{title}</p>
      {body && <p className="muted">{body}</p>}
      {action}
    </div>
  );
}

/** A card that is one big tap target (opens its detail). Copy/call actions live outside it. */
export function CardLink({ to, icon, title, sub, meta, aria }: { to: string; icon: IconName; title: string; sub?: ReactNode; meta?: ReactNode; aria?: string }) {
  return (
    <Link to={to} className="card card-link" aria-label={aria}>
      <span className="card-icon">
        <Icon name={icon} size={22} />
      </span>
      <span className="card-main">
        <span className="card-title">{title}</span>
        {sub && <span className="card-sub">{sub}</span>}
        {meta && <span className="card-meta">{meta}</span>}
      </span>
      <Icon name="chevron" size={18} className="card-chev" />
    </Link>
  );
}

const MONO: FieldKind[] = ['phone', 'fax', 'identifier'];

/**
 * One saved value with its specific actions. Copy is always available and says
 * exactly what it copied ("Fax copied."). Phones add Call; faxes are copy-only and
 * never become call links; addresses add Directions; emails and links open.
 */
export function ValueRow({ label, value, kind, protectedNote }: { label: string; value?: string; kind: FieldKind; protectedNote?: string }) {
  const { copy } = useFeedback();
  if (protectedNote || value === undefined) {
    return (
      <div className="value-row">
        <div className="value-main">
          <span className="value-label">{label}</span>
          <span className="value protected">
            <Icon name="lock" size={16} /> Protected
          </span>
          {protectedNote && <span className="hint">{protectedNote}</span>}
        </div>
      </div>
    );
  }
  const url = kind === 'url' ? safeUrl(value) : undefined;
  return (
    <div className="value-row">
      <div className="value-main">
        <span className="value-label">{label}</span>
        <span className={`value ${MONO.includes(kind) ? 'tnum' : ''}`}>{value}</span>
      </div>
      <div className="value-actions">
        <button type="button" className="btn btn-quiet btn-sm" onClick={() => void copy(label, value)} aria-label={`Copy ${label.toLowerCase()}`}>
          <Icon name="copy" size={17} /> Copy
        </button>
        {kind === 'phone' && (
          <a className="btn btn-quiet btn-sm" href={telHref(value)} aria-label={`Call ${label.toLowerCase()}`}>
            <Icon name="phone" size={17} /> Call
          </a>
        )}
        {kind === 'address' && (
          <a className="btn btn-quiet btn-sm" href={directionsHref(value)} target="_blank" rel="noopener noreferrer" aria-label={`Directions to ${label.toLowerCase()}`}>
            <Icon name="map" size={17} /> Directions
          </a>
        )}
        {kind === 'email' && (
          <a className="btn btn-quiet btn-sm" href={`mailto:${value}`} aria-label={`Email ${value}`}>
            <Icon name="mail" size={17} /> Email
          </a>
        )}
        {url && (
          <a className="btn btn-quiet btn-sm" href={url} target="_blank" rel="noopener noreferrer" aria-label={`Open ${label.toLowerCase()}`}>
            <Icon name="globe" size={17} /> Open
          </a>
        )}
      </div>
    </div>
  );
}

export function PinButton({ target }: { target: PinTarget }) {
  const { state, me, actions } = useStore();
  const pinned = state.pins[me].some((p) => p.kind === target.kind && p.id === target.id);
  return (
    <button type="button" className={`btn btn-quiet btn-sm ${pinned ? 'is-on' : ''}`} aria-pressed={pinned} onClick={() => actions.togglePin(target)}>
      <Icon name="pin" size={17} /> {pinned ? 'Pinned' : 'Pin to Home'}
    </button>
  );
}

export function FilterChips({ items, current, label }: { items: Array<{ key: string; label: string; to: string }>; current: string; label: string }) {
  return (
    <nav className="chips" aria-label={label}>
      {items.map((i) => (
        <Link key={i.key} to={i.to} replace keepScroll className={`chip-btn ${current === i.key ? 'is-on' : ''}`} aria-current={current === i.key ? 'true' : undefined}>
          {i.label}
        </Link>
      ))}
    </nav>
  );
}

export function ConfirmDialog({ title, body, confirmLabel, danger, onConfirm, onCancel }: { title: string; body: string; confirmLabel: string; danger?: boolean; onConfirm: () => void; onCancel: () => void }) {
  const ref = useRef<HTMLButtonElement>(null);
  useEffect(() => {
    ref.current?.focus();
    const onKey = (e: KeyboardEvent) => e.key === 'Escape' && onCancel();
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [onCancel]);
  return (
    <div className="scrim" role="presentation" onMouseDown={(e) => e.target === e.currentTarget && onCancel()}>
      <div className="dialog" role="alertdialog" aria-modal="true" aria-labelledby="confirm-title" aria-describedby="confirm-body">
        <h2 id="confirm-title" className="dialog-title">
          {title}
        </h2>
        <p id="confirm-body" className="muted">
          {body}
        </p>
        <div className="dialog-actions">
          <button type="button" className="btn btn-quiet" onClick={onCancel} ref={ref}>
            Cancel
          </button>
          <button type="button" className={`btn ${danger ? 'btn-danger' : 'btn-primary'}`} onClick={onConfirm}>
            {confirmLabel}
          </button>
        </div>
      </div>
    </div>
  );
}
