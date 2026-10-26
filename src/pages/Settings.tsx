import { MEMBER_IDS, MEMBERS } from '../data/types.ts';
import { useStore } from '../data/store.tsx';
import { detectPlatform, isStandalone, promptInstall, usePwa } from '../lib/pwa.ts';
import { Icon } from '../components/Icon.tsx';
import { PageHeader, Section } from '../components/ui.tsx';

const INSTALL_STEPS = {
  ios: 'In Safari, tap the Share button, then “Add to Home Screen”. (Other iPhone browsers can’t install web apps.)',
  android: 'In Chrome, open the ⋮ menu and choose “Install app” (or “Add to Home screen”).',
  desktop: 'In Chrome or Edge, click the install icon at the right end of the address bar, or open the menu and choose “Install Z Heart J”.',
} as const;

export function SettingsPage() {
  const { me, setMe, failNext, setFailNext } = useStore();
  const { canInstall } = usePwa();
  const platform = detectPlatform();
  const installed = isStandalone();

  return (
    <div className="page">
      <PageHeader title="Settings" sub="Z Heart J · Stage 1 preview" />

      <Section title="Viewing as" id="viewing">
        <div className="card">
          <p className="muted">In this preview you can switch between the two members to try “my fax” and personal pins. In the real app, who you are comes from signing in — there is no switch.</p>
          <div className="segmented" role="group" aria-label="Viewing as">
            {MEMBER_IDS.map((m) => (
              <button key={m} type="button" className={`seg ${me === m ? 'is-on' : ''}`} aria-pressed={me === m} onClick={() => setMe(m)}>
                {MEMBERS[m].name}
              </button>
            ))}
          </div>
        </div>
      </Section>

      <Section title="Sharing" id="sharing">
        <div className="card">
          <p>Information you save here is shared with both of you.</p>
          <p className="muted">A person’s name on a card says whose it is. It is attribution, not a privacy setting — separate private spaces would need real server-side permissions and are a later feature.</p>
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

      <Section title="Preview tools" id="tools">
        <div className="card">
          <label className="toggle">
            <input type="checkbox" checked={failNext} onChange={(e) => setFailNext(e.target.checked)} />
            <span>Make the next save fail</span>
          </label>
          <p className="muted">Try it, then add or check a list item: the change rolls back to the last saved version and offers Retry. Nothing is ever shown as saved when it wasn’t.</p>
        </div>
      </Section>

      <Section title="What’s coming" id="roadmap">
        <div className="card">
          <p className="card-title">Next (Stage 2)</p>
          <ul className="bullets">
            <li>Sign-in for just the two of you, checked on the server</li>
            <li>Real shared saving, so both phones see the same lists and cards</li>
            <li>Encrypted credential entry and reveal (DEA and similar)</li>
            <li>Ordinary-data export, and 30-day recovery for deleted records</li>
          </ul>
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
