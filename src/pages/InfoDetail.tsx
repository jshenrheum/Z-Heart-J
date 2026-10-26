import { HOME_TEMPLATE_LABEL, MEMBERS } from '../data/types.ts';
import { useStore } from '../data/store.tsx';
import { addDays, diffDays, displayDate } from '../lib/dates.ts';
import { useFeedback } from '../lib/feedback.tsx';
import { HOME_ICON } from '../lib/pins.ts';
import { Link } from '../lib/router.tsx';
import { routes } from '../lib/routes.ts';
import { buildWorkSummary, safeUrl, telHref } from '../lib/summary.ts';
import { useForms } from '../components/Forms.tsx';
import { Icon } from '../components/Icon.tsx';
import { CardLink, Chip, PageHeader, PinButton, Section, UpdatedBy, ValueRow } from '../components/ui.tsx';
import { expiryChip } from './Info.tsx';
import { NotFound } from './NotFound.tsx';

export function InfoDetailPage({ id }: { id: string }) {
  const { state } = useStore();
  if (id.startsWith('p-')) return <ProfileDetail memberId={id.slice(2)} />;
  if (state.locations.some((l) => l.id === id)) return <LocationDetail id={id} />;
  if (state.credentials.some((c) => c.id === id)) return <CredentialDetail id={id} />;
  if (state.home.some((r) => r.id === id)) return <HomeDetail id={id} />;
  if (state.contacts.some((c) => c.id === id)) return <ContactDetail id={id} />;
  return <NotFound what="card" />;
}

// ------------------------------------------------------------------ profile

function ProfileDetail({ memberId }: { memberId: string }) {
  const { state, me, today } = useStore();
  const { copy } = useFeedback();
  const forms = useForms();
  const profile = state.profiles.find((p) => p.id === memberId);
  if (!profile) return <NotFound what="profile" />;
  const locs = state.locations.filter((l) => l.owner === profile.id);
  const creds = state.credentials.filter((c) => c.owner === profile.id);
  const name = MEMBERS[profile.id].name;

  return (
    <div className="page">
      <PageHeader
        title={profile.id === me ? 'My work details' : `${name}’s work details`}
        sub={[profile.specialty, profile.organization].filter(Boolean).join(' · ')}
        back={{ to: `${routes.info}?who=${profile.id}`, label: 'Our Info' }}
        actions={<PinButton target={{ kind: 'profile', id: profile.id }} />}
      />

      <Section title={`Work locations`} count={locs.length} id="locs" action={
        <button type="button" className="btn btn-quiet btn-sm" onClick={() => forms.open({ kind: 'location', owner: profile.id })}>
          <Icon name="plus" size={17} /> Add location
        </button>
      }>
        {locs.length === 0 ? (
          <p className="muted">No work locations yet. Add one to copy its address, phone, and fax in a tap.</p>
        ) : (
          <div className="stack">
            {locs.map((l) => (
              <div className="card loc-card" key={l.id}>
                <Link to={routes.record(l.id)} className="loc-head">
                  <span className="card-title">{l.label}</span>
                  <span className="card-sub">{l.address}</span>
                  <span className="open-hint">
                    Open all details <Icon name="chevron" size={14} />
                  </span>
                </Link>
                <div className="value-actions">
                  <button type="button" className="btn btn-primary btn-sm" onClick={() => void copy('Work summary', buildWorkSummary(profile, l))}>
                    <Icon name="copy" size={17} /> Copy work summary
                  </button>
                  {l.fax && (
                    <button type="button" className="btn btn-quiet btn-sm" onClick={() => void copy('Fax', l.fax)} aria-label={`Copy fax for ${l.label}`}>
                      <Icon name="fax" size={17} /> Copy fax
                    </button>
                  )}
                  {l.mainPhone && (
                    <a className="btn btn-quiet btn-sm" href={telHref(l.mainPhone)} aria-label={`Call ${l.label} main phone`}>
                      <Icon name="phone" size={17} /> Call
                    </a>
                  )}
                </div>
              </div>
            ))}
          </div>
        )}
        <p className="hint">The work summary never includes DEA or any other protected number.</p>
      </Section>

      <Section title="Professional profile" id="prof">
        <div className="card rows">
          <ValueRow label="Specialty" value={profile.specialty} kind="text" />
          <ValueRow label="Organization" value={profile.organization} kind="text" />
          <ValueRow label="NPI" value={profile.npi} kind="identifier" />
        </div>
      </Section>

      {creds.length > 0 && (
        <Section title="Credentials" count={creds.length} id="creds">
          <div className="stack">
            {creds.map((c) => (
              <CardLink key={c.id} to={routes.record(c.id)} icon="lock" title={c.type} sub={c.issuer} meta={<span className="chip-row"><Chip tone="lock" icon="lock">Number protected</Chip>{expiryChip(c.expires, today)}</span>} />
            ))}
          </div>
        </Section>
      )}
      <UpdatedBy by={profile.updatedBy} at={profile.updatedAt} />
    </div>
  );
}

// ------------------------------------------------------------------ work location

function LocationDetail({ id }: { id: string }) {
  const { state } = useStore();
  const { copy } = useFeedback();
  const forms = useForms();
  const loc = state.locations.find((l) => l.id === id);
  const profile = state.profiles.find((p) => p.id === loc?.owner);
  if (!loc || !profile) return <NotFound what="location" />;
  const summary = buildWorkSummary(profile, loc);
  return (
    <div className="page">
      <PageHeader
        title={loc.label}
        sub={`${MEMBERS[loc.owner].name} · ${loc.organization}`}
        back={{ to: routes.profile(loc.owner), label: `${MEMBERS[loc.owner].name}’s work details` }}
        actions={
          <button type="button" className="btn btn-quiet btn-sm" onClick={() => forms.open({ kind: 'location', owner: loc.owner, id: loc.id })}>
            <Icon name="edit" size={17} /> Edit
          </button>
        }
      />
      <div className="card rows">
        <ValueRow label="Address" value={loc.address} kind="address" />
        <ValueRow label="Main phone" value={loc.mainPhone} kind="phone" />
        {loc.directPhone && <ValueRow label="Direct phone" value={loc.directPhone} kind="phone" />}
        {loc.fax && <ValueRow label="Fax" value={loc.fax} kind="fax" />}
        {loc.schedulingPhone && <ValueRow label="Scheduling phone" value={loc.schedulingPhone} kind="phone" />}
      </div>
      {loc.notes && <p className="notes">{loc.notes}</p>}

      <Section title="Public work summary" id="summary">
        <div className="card">
          <pre className="summary-preview" aria-label="Work summary preview">{summary}</pre>
          <button type="button" className="btn btn-primary" onClick={() => void copy('Work summary', summary)}>
            <Icon name="copy" size={18} /> Copy work summary
          </button>
          <p className="hint">Built from a fixed list of ordinary fields. You choose where to paste it — nothing is sent from here.</p>
        </div>
      </Section>
      <UpdatedBy by={loc.updatedBy} at={loc.updatedAt} />
    </div>
  );
}

// ------------------------------------------------------------------ credential

function CredentialDetail({ id }: { id: string }) {
  const { state, today } = useStore();
  const forms = useForms();
  const cred = state.credentials.find((c) => c.id === id);
  if (!cred) return <NotFound what="credential" />;
  const renewal = cred.renewalUrl ? safeUrl(cred.renewalUrl) : undefined;
  const due = cred.expires ? (diffDays(addDays(cred.expires, -30), today) > 0 ? addDays(cred.expires, -30) : cred.expires) : undefined;

  return (
    <div className="page">
      <PageHeader title={cred.type} sub={`${MEMBERS[cred.owner].name} · ${cred.issuer}`} back={{ to: routes.profile(cred.owner), label: `${MEMBERS[cred.owner].name}’s work details` }} />
      <div className="card rows">
        <ValueRow label="Issuing body" value={cred.issuer} kind="text" />
        {cred.expires && <ValueRow label="Expires" value={displayDate(cred.expires, today)} kind="date" />}
        {renewal && <ValueRow label="Renewal link" value={renewal} kind="url" />}
      </div>
      {cred.expires && diffDays(cred.expires, today) <= 60 && <p className="chip-row">{expiryChip(cred.expires, today)}</p>}

      <div className="protected-card" role="note">
        <div className="protected-head">
          <Icon name="lock" size={20} />
          <strong>Credential number — protected</strong>
        </div>
        <p>
          This number is stored encrypted on the server. It never appears in search, summaries, previews, or exports. Entering and revealing it turns on once secure sign-in is connected (Stage 2) — nothing is saved from this preview.
        </p>
      </div>

      {cred.expires && due && (
        <Section title="Renewal" id="renewal">
          <div className="card">
            <p className="muted">Nothing is scheduled unless you ask. This creates one task you can edit.</p>
            <button
              type="button"
              className="btn btn-primary"
              onClick={() => forms.open({ kind: 'task', prefill: { title: `Renew ${cred.type}`, assignee: cred.owner, due } })}
            >
              <Icon name="plan" size={18} /> Create renewal task
            </button>
            <p className="hint">The due date starts {due === cred.expires ? 'on the expiration date' : '30 days before it expires'} — change it as you like.</p>
          </div>
        </Section>
      )}
      <UpdatedBy by={cred.updatedBy} at={cred.updatedAt} />
    </div>
  );
}

// ------------------------------------------------------------------ home record

function HomeDetail({ id }: { id: string }) {
  const { state } = useStore();
  const forms = useForms();
  const rec = state.home.find((r) => r.id === id);
  if (!rec) return <NotFound what="card" />;
  return (
    <div className="page">
      <PageHeader
        title={rec.title}
        sub={<span className="chip-row"><Chip icon={HOME_ICON[rec.template]}>{HOME_TEMPLATE_LABEL[rec.template]}</Chip></span>}
        back={{ to: `${routes.info}?who=home`, label: 'Home' }}
        actions={
          <>
            <PinButton target={{ kind: 'record', id: rec.id }} />
            <button type="button" className="btn btn-quiet btn-sm" onClick={() => forms.open({ kind: 'home', id: rec.id })}>
              <Icon name="edit" size={17} /> Edit
            </button>
          </>
        }
      />
      {rec.fields.length > 0 ? (
        <div className="card rows">
          {rec.fields.map((f) => (
            <ValueRow key={f.label} label={f.label} kind={f.kind} value={f.protected ? undefined : f.value} protectedNote={f.protected ? 'Revealed only with secure sign-in (Stage 2).' : undefined} />
          ))}
        </div>
      ) : (
        <p className="muted">No details yet — use Edit to add some.</p>
      )}
      {rec.notes && <p className="notes">{rec.notes}</p>}
      <UpdatedBy by={rec.updatedBy} at={rec.updatedAt} />
    </div>
  );
}

// ------------------------------------------------------------------ contact

function ContactDetail({ id }: { id: string }) {
  const { state } = useStore();
  const forms = useForms();
  const c = state.contacts.find((x) => x.id === id);
  if (!c) return <NotFound what="contact" />;
  return (
    <div className="page">
      <PageHeader
        title={c.name}
        sub={<span className="chip-row"><Chip icon="user">{c.category}</Chip>{c.role && <span>{c.role}</span>}</span>}
        back={{ to: routes.contacts, label: 'Contacts' }}
        actions={
          <>
            <PinButton target={{ kind: 'contact', id: c.id }} />
            <button type="button" className="btn btn-quiet btn-sm" onClick={() => forms.open({ kind: 'contact', id: c.id })}>
              <Icon name="edit" size={17} /> Edit
            </button>
          </>
        }
      />
      <div className="card rows">
        {c.phone && <ValueRow label="Phone" value={c.phone} kind="phone" />}
        {c.fax && <ValueRow label="Fax" value={c.fax} kind="fax" />}
        {c.email && <ValueRow label="Email" value={c.email} kind="email" />}
        {c.address && <ValueRow label="Address" value={c.address} kind="address" />}
        {c.website && <ValueRow label="Website" value={c.website} kind="url" />}
      </div>
      {c.note && <p className="notes">{c.note}</p>}
      <UpdatedBy by={c.updatedBy} at={c.updatedAt} />
    </div>
  );
}
