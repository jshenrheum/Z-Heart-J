import { MEMBER_IDS, MEMBERS } from '../data/types.ts';
import { useStore } from '../data/store.tsx';
import { Section } from '../components/ui.tsx';

/**
 * DEMO BUILD ONLY. These pieces are referenced behind the __DEMO__ build flag, so
 * the production build doesn't contain them: there is no "viewing as" switch and
 * no simulated failure in the signed-in app.
 */

export function DemoBanner() {
  return (
    <p className="demo-banner" role="note">
      <strong>Demo preview.</strong> Every name, number, and address here is a placeholder, and changes reset when you close the app.
    </p>
  );
}

export function DemoSettings() {
  const { me, demo } = useStore();
  if (!demo) return null;
  return (
    <>
      <Section title="Viewing as" id="viewing">
        <div className="card">
          <p className="muted">In this preview you can switch between the two members to try “my fax” and personal pins. In the real app, who you are comes from signing in — there is no switch.</p>
          <div className="segmented" role="group" aria-label="Viewing as">
            {MEMBER_IDS.map((m) => (
              <button key={m} type="button" className={`seg ${me === m ? 'is-on' : ''}`} aria-pressed={me === m} onClick={() => demo.setMe(m)}>
                {MEMBERS[m].name}
              </button>
            ))}
          </div>
        </div>
      </Section>

      <Section title="Preview tools" id="tools">
        <div className="card">
          <label className="toggle">
            <input type="checkbox" checked={demo.failNext} onChange={(e) => demo.setFailNext(e.target.checked)} />
            <span>Make the next save fail</span>
          </label>
          <p className="muted">Try it, then add or check a list item: the change rolls back to the last saved version and offers Retry. Nothing is ever shown as saved when it wasn’t.</p>
        </div>
      </Section>
    </>
  );
}
