import { HOME_TEMPLATE_LABEL, MEMBER_IDS, MEMBERS, type Credential, type HomeRecord, type HomeTemplate, type MemberId } from '../data/types.ts';
import { useStore } from '../data/store.tsx';
import { diffDays, displayDate, type DateStr } from '../lib/dates.ts';
import { HOME_ICON } from '../lib/pins.ts';
import { useRoute } from '../lib/router.tsx';
import { routes } from '../lib/routes.ts';
import { directionsHref, telHref } from '../lib/summary.ts';
import { useFeedback } from '../lib/feedback.tsx';
import { useForms } from '../components/Forms.tsx';
import { Icon } from '../components/Icon.tsx';
import { CardLink, Chip, EmptyState, FilterChips, PageHeader, RowGroup, RowLink, Section, Tone } from '../components/ui.tsx';
import type { ReactNode } from 'react';
import { vehicleDates, vehicleSummary } from '../lib/vehicles.ts';

const FILTERS = [
  { key: 'all', label: 'All' },
  { key: 'jeffrey', label: 'Jeffrey' },
  { key: 'zul', label: 'Zul' },
  { key: 'home', label: 'Home' },
] as const;
type Who = (typeof FILTERS)[number]['key'];

const HOME_ORDER: HomeTemplate[] = ['address', 'utility', 'internet', 'maintenance', 'pet', 'emergency', 'other'];

export function expiryChip(expires: DateStr | undefined, today: DateStr): ReactNode {
  if (!expires) return null;
  const n = diffDays(expires, today);
  if (n < 0) return <Chip tone="warn" icon="calendar">Expired {displayDate(expires, today)}</Chip>;
  if (n <= 60) return <Chip tone="heart" icon="calendar">Expires in {n} day{n === 1 ? '' : 's'}</Chip>;
  return <Chip icon="calendar">Expires {displayDate(expires, today)}</Chip>;
}

/** The same, as words for a row's grey line. */
function expiryText(expires: DateStr | undefined, today: DateStr): ReactNode {
  if (!expires) return null;
  const n = diffDays(expires, today);
  if (n < 0) return <Tone tone="warn">Expired {displayDate(expires, today)}</Tone>;
  if (n <= 60) return <Tone tone="soon">Expires in {n} day{n === 1 ? '' : 's'}</Tone>;
  return <span>Expires {displayDate(expires, today)}</span>;
}

/** "Registration renews in 12 days" and the like. */
function dueText(label: string, date: DateStr, today: DateStr): ReactNode {
  const n = diffDays(date, today);
  if (n < 0) return <Tone tone="warn">{label} · overdue</Tone>;
  if (n <= 60) return <Tone tone="soon">{label} in {n} day{n === 1 ? '' : 's'}</Tone>;
  return <span>{label} {displayDate(date, today)}</span>;
}

export function InfoPage() {
  const { state, today } = useStore();
  const forms = useForms();
  const { query } = useRoute();
  const raw = query.get('who');
  const who: Who = FILTERS.some((f) => f.key === raw) ? (raw as Who) : 'all';

  const personBlocks = (m: MemberId, withName: boolean) => {
    const profile = state.profiles.find((p) => p.id === m);
    const locs = state.locations.filter((l) => l.owner === m);
    const creds = state.credentials.filter((c) => c.owner === m);
    const name = MEMBERS[m].name;
    return (
      <>
        {profile && (
          <Section title="Work" id={`work-${m}`}>
            <RowGroup label={`${name} · Work`}>
              <RowLink
                to={routes.profile(m)}
                icon="building"
                title={withName ? `${name} · Work details` : 'Work details'}
                sub={`${profile.specialty} · ${locs.length} location${locs.length === 1 ? '' : 's'}`}
              />
              {locs.map((l) => (
                <RowLink key={l.id} to={routes.record(l.id)} icon="map" title={l.label} sub={l.address.split(',')[0]} meta={l.fax ? ['Fax on file'] : undefined} />
              ))}
            </RowGroup>
          </Section>
        )}
        {creds.length > 0 && (
          <Section title="Credentials" id={`cred-${m}`}>
            <RowGroup label={`${name} · Credentials`}>
              {creds.map((c) => (
                <CredentialRow key={c.id} c={c} today={today} prefix={withName ? name : undefined} />
              ))}
            </RowGroup>
          </Section>
        )}
      </>
    );
  };

  const vehicles = state.home.filter((r) => r.template === 'vehicle');
  const vehicleBlock = () => (
    <div className="group">
      <div className="section-head">
        <h2 className="group-title">Vehicles</h2>
        <button type="button" className="btn btn-quiet btn-sm" onClick={() => forms.open({ kind: 'vehicle' })}>
          <Icon name="plus" size={17} /> Add vehicle
        </button>
      </div>
      {vehicles.length ? (
        <RowGroup label="Vehicles">
          {vehicles.map((r) => {
            const next = vehicleDates(r).sort((a, b) => a.date.localeCompare(b.date))[0];
            return <RowLink key={r.id} to={routes.record(r.id)} icon="car" title={r.title} sub={vehicleSummary(r) || undefined} meta={next ? [dueText(next.label, next.date, today)] : undefined} />;
          })}
        </RowGroup>
      ) : (
        <p className="muted">Make, model, plate, VIN, registration, insurance and service, in one place.</p>
      )}
    </div>
  );

  const homeBlocks = () => {
    // One card for the whole home, in a set order; each row says what kind of thing it is.
    const items = HOME_ORDER.flatMap((t) => state.home.filter((r) => r.template === t));
    if (items.length === 0) return <EmptyState title="Nothing saved about home yet." body="Use Add → Add information to start." />;
    return (
      <RowGroup label="Home">
        {items.map((r) => (
          <HomeRow key={r.id} r={r} />
        ))}
      </RowGroup>
    );
  };

  return (
    <div className="page">
      <PageHeader title="Our Info" />
      <FilterChips
        label="Filter Our Info"
        current={who}
        items={FILTERS.map((f) => ({ key: f.key, label: f.label, to: f.key === 'all' ? routes.info : `${routes.info}?who=${f.key}` }))}
      />
      <RowGroup label="Contacts">
        <RowLink to={routes.contacts} icon="phone" title="Contacts" sub={`${state.contacts.length} people and services`} />
      </RowGroup>

      {who === 'all' && (
        <>
          {MEMBER_IDS.map((m) => (
            <div className="group" key={m}>
              <h2 className="group-title">{MEMBERS[m].name}</h2>
              {personBlocks(m, true)}
            </div>
          ))}
          {vehicleBlock()}
          <div className="group">
            <h2 className="group-title">Home</h2>
            {homeBlocks()}
          </div>
        </>
      )}
      {(who === 'jeffrey' || who === 'zul') && personBlocks(who, false)}
      {who === 'home' && (
        <>
          {vehicleBlock()}
          {homeBlocks()}
        </>
      )}
    </div>
  );
}

function CredentialRow({ c, today, prefix }: { c: Credential; today: DateStr; prefix?: string }) {
  return (
    <RowLink
      to={routes.record(c.id)}
      icon="lock"
      title={prefix ? `${prefix} · ${c.type}` : c.type}
      sub={c.issuer}
      meta={[c.hasValue ? <Tone tone="lock">Number protected</Tone> : 'No number saved', expiryText(c.expires, today)]}
    />
  );
}

function HomeRow({ r }: { r: HomeRecord }) {
  const first = r.fields.find((f) => !f.protected && f.value);
  const hasProtected = r.fields.some((f) => f.protected);
  return (
    <RowLink
      to={routes.record(r.id)}
      icon={HOME_ICON[r.template]}
      title={r.title}
      sub={[HOME_TEMPLATE_LABEL[r.template].toLowerCase() === r.title.trim().toLowerCase() ? '' : HOME_TEMPLATE_LABEL[r.template], first?.value].filter(Boolean).join(' · ')}
      meta={hasProtected ? [<Tone tone="lock">Includes a protected field</Tone>] : undefined}
    />
  );
}

// ------------------------------------------------------------------ contacts

export function ContactsPage() {
  const { state } = useStore();
  const { copy } = useFeedback();
  const forms = useForms();
  const contacts = [...state.contacts].sort((a, b) => a.name.localeCompare(b.name));
  return (
    <div className="page">
      <PageHeader
        title="Contacts"
        back={{ to: routes.info, label: 'Our Info' }}
        actions={
          <button type="button" className="btn btn-primary btn-sm" onClick={() => forms.open({ kind: 'contact' })}>
            <Icon name="plus" size={17} /> Add contact
          </button>
        }
      />
      {contacts.length === 0 ? (
        <EmptyState title="No contacts yet." body="Add your vet, a maintenance provider, a property contact." />
      ) : (
        <ul className="stack list-reset">
          {contacts.map((c) => (
            <li key={c.id} className="card contact-card">
              <CardLink to={routes.record(c.id)} icon="user" title={c.name} sub={[c.role, c.category].filter(Boolean).join(' · ')} />
              <div className="value-actions contact-actions">
                {c.phone && (
                  <a className="btn btn-primary btn-sm" href={telHref(c.phone)} aria-label={`Call ${c.name}`}>
                    <Icon name="phone" size={17} /> Call
                  </a>
                )}
                {c.email && (
                  <a className="btn btn-quiet btn-sm" href={`mailto:${c.email}`} aria-label={`Email ${c.name}`}>
                    <Icon name="mail" size={17} /> Email
                  </a>
                )}
                {c.address && (
                  <a className="btn btn-quiet btn-sm" href={directionsHref(c.address)} target="_blank" rel="noopener noreferrer" aria-label={`Directions to ${c.name}`}>
                    <Icon name="map" size={17} /> Directions
                  </a>
                )}
                {c.fax && (
                  <button type="button" className="btn btn-quiet btn-sm" onClick={() => void copy('Fax', c.fax)} aria-label={`Copy ${c.name} fax number`}>
                    <Icon name="fax" size={17} /> Copy fax
                  </button>
                )}
              </div>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
