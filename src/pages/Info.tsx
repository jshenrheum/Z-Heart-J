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
import { CardLink, Chip, EmptyState, FilterChips, PageHeader, Section } from '../components/ui.tsx';
import type { ReactNode } from 'react';

const FILTERS = [
  { key: 'all', label: 'All' },
  { key: 'jeffrey', label: 'Jeffrey' },
  { key: 'zul', label: 'Zul' },
  { key: 'home', label: 'Home' },
] as const;
type Who = (typeof FILTERS)[number]['key'];

const HOME_ORDER: HomeTemplate[] = ['address', 'utility', 'internet', 'maintenance', 'vehicle', 'pet', 'emergency', 'other'];

export function expiryChip(expires: DateStr | undefined, today: DateStr): ReactNode {
  if (!expires) return null;
  const n = diffDays(expires, today);
  if (n < 0) return <Chip tone="warn" icon="calendar">Expired {displayDate(expires, today)}</Chip>;
  if (n <= 60) return <Chip tone="heart" icon="calendar">Expires in {n} day{n === 1 ? '' : 's'}</Chip>;
  return <Chip icon="calendar">Expires {displayDate(expires, today)}</Chip>;
}

export function InfoPage() {
  const { state, today } = useStore();
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
            <div className="stack">
              <CardLink
                to={routes.profile(m)}
                icon="building"
                title={withName ? `${name} · Work details` : 'Work details'}
                sub={`${profile.specialty} · ${locs.length} location${locs.length === 1 ? '' : 's'}`}
              />
              {locs.map((l) => (
                <CardLink key={l.id} to={routes.record(l.id)} icon="map" title={l.label} sub={l.address.split(',')[0]} meta={l.fax ? <span className="muted small">Fax on file</span> : undefined} />
              ))}
            </div>
          </Section>
        )}
        {creds.length > 0 && (
          <Section title="Credentials" id={`cred-${m}`}>
            <div className="stack">
              {creds.map((c) => (
                <CredentialCard key={c.id} c={c} today={today} prefix={withName ? name : undefined} />
              ))}
            </div>
          </Section>
        )}
      </>
    );
  };

  const homeBlocks = () => {
    const groups = HOME_ORDER.map((t) => ({ t, items: state.home.filter((r) => r.template === t) })).filter((g) => g.items.length > 0);
    if (groups.length === 0) return <EmptyState title="Nothing saved about home yet." body="Use Add → Add information to start." />;
    return groups.map((g) => (
      <Section title={HOME_TEMPLATE_LABEL[g.t]} key={g.t} id={`home-${g.t}`}>
        <div className="stack">
          {g.items.map((r) => (
            <HomeCard key={r.id} r={r} />
          ))}
        </div>
      </Section>
    ));
  };

  return (
    <div className="page">
      <PageHeader title="Our Info" sub="The details of our life, easy to find." />
      <FilterChips
        label="Filter Our Info"
        current={who}
        items={FILTERS.map((f) => ({ key: f.key, label: f.label, to: f.key === 'all' ? routes.info : `${routes.info}?who=${f.key}` }))}
      />
      <CardLink to={routes.contacts} icon="phone" title="Contacts" sub={`${state.contacts.length} people and services`} />

      {who === 'all' && (
        <>
          {MEMBER_IDS.map((m) => (
            <div className="group" key={m}>
              <h2 className="group-title">{MEMBERS[m].name}</h2>
              {personBlocks(m, true)}
            </div>
          ))}
          <div className="group">
            <h2 className="group-title">Home</h2>
            {homeBlocks()}
          </div>
        </>
      )}
      {(who === 'jeffrey' || who === 'zul') && personBlocks(who, false)}
      {who === 'home' && homeBlocks()}
    </div>
  );
}

function CredentialCard({ c, today, prefix }: { c: Credential; today: DateStr; prefix?: string }) {
  return (
    <CardLink
      to={routes.record(c.id)}
      icon="lock"
      title={prefix ? `${prefix} · ${c.type}` : c.type}
      sub={c.issuer}
      meta={
        <span className="chip-row">
          <Chip tone="lock" icon="lock">Number protected</Chip>
          {expiryChip(c.expires, today)}
        </span>
      }
    />
  );
}

function HomeCard({ r }: { r: HomeRecord }) {
  const first = r.fields.find((f) => !f.protected && f.value);
  const hasProtected = r.fields.some((f) => f.protected);
  return (
    <CardLink
      to={routes.record(r.id)}
      icon={HOME_ICON[r.template]}
      title={r.title}
      sub={first?.value}
      meta={hasProtected ? <Chip tone="lock" icon="lock">Includes protected field</Chip> : undefined}
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
        sub="Shared directory — adding someone never sends them anything."
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
