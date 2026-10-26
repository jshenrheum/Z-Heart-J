import { MEMBERS } from '../data/types.ts';
import { useStore } from '../data/store.tsx';
import { detectPlatform, isStandalone, promptInstall, usePwa } from '../lib/pwa.ts';
import { routes } from '../lib/routes.ts';
import { Icon } from '../components/Icon.tsx';
import { signOut } from '../components/Layout.tsx';
import { CardLink, PageHeader, Section } from '../components/ui.tsx';
import { DemoSettings } from '../demo/ui.tsx';

const INSTALL_STEPS = {
  ios: 'In Safari, tap the Share button, then “Add to Home Screen”. (Other iPhone browsers can’t install web apps.)',
  android: 'In Chrome, open the ⋮ menu and choose “Install app” (or “Add to Home screen”).',
  desktop: 'In Chrome or Edge, click the install icon at the right end of the address bar, or open the menu and choose “Install Z Heart J”.',
} as const;

export function SettingsPage() {
  const { me, backend } = useStore();
  const { canInstall } = usePwa();
  const platform = detectPlatform();
  const installed = isStandalone();
  const live = backend.mode === 'live';

  return (
    <div className="page">
      <PageHeader title="Settings" sub={live ? undefined : 'Z Heart J · demo preview'} />

      {live && (
        <Section title="Signed in" id="account">
          <div className="card">
            <p>
              You’re signed in as <strong>{MEMBERS[me].name}</strong>.
            </p>
            <p className="muted">Sign-in is handled by Cloudflare Access, and the server checks it on every request. Only the two of you can open this app.</p>
            <button type="button" className="btn btn-quiet" onClick={() => void signOut()}>
              <Icon name="logout" size={18} /> Sign out
            </button>
          </div>
        </Section>
      )}

      {__DEMO__ && <DemoSettings />}

      <Section title="Sharing" id="sharing">
        <div className="card">
          <p>Information you save here is shared with both of you.</p>
          <p className="muted">A person’s name on a card says whose it is. It is attribution, not a privacy setting — separate private spaces would need real server-side permissions and are a later feature.</p>
        </div>
      </Section>

      <Section title="Your data" id="data">
        <div className="stack">
          <CardLink to={routes.trash} icon="trash" title="Trash" sub="Deleted things are kept for 30 days, then removed for good." />
          <div className="card">
            <p className="card-title">Export</p>
            {live && backend.exportHref ? (
              <>
                <p className="muted">Downloads everything ordinary as one JSON file: work details, locations, home cards, contacts, lists, plans and tasks. Protected values (like DEA numbers) are never included.</p>
                <a className="btn btn-quiet" href={backend.exportHref} download>
                  <Icon name="download" size={18} /> Download export
                </a>
              </>
            ) : (
              <p className="muted">Export is available in the signed-in app. The demo preview has nothing real to export.</p>
            )}
          </div>
        </div>
      </Section>

      <Section title="Install on this device" id="install">
        <div className="card">
          {installed ? (
            <p>
              <Icon name="check" size={18} /> You’re using the installed app.
            </p>
          ) : (
            <>
              <p>{INSTALL_STEPS[platform]}</p>
              {canInstall && (
                <button type="button" className="btn btn-primary" onClick={() => void promptInstall()}>
                  <Icon name="download" size={18} /> Install Z Heart J
                </button>
              )}
            </>
          )}
          <p className="hint">Offline, the app opens to a short message — household information is never kept on the device.</p>
        </div>
      </Section>

      <Section title="What’s coming" id="roadmap">
        <div className="card">
          <p className="card-title">Later</p>
          <ul className="bullets">
            <li>Document attachments with expiry dates, opt-in reminders, calendar sync</li>
            <li>Separate private spaces, if you ever want them</li>
          </ul>
        </div>
      </Section>
    </div>
  );
}
