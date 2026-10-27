import { useEffect, useRef, useState } from 'react';
import { useStore } from '../data/store.tsx';
import { Wordmark } from './Wordmark.tsx';

const SEEN = 'zhj:intro';
/** The mark's entrance and a short breath; the app shows no sooner. */
const MIN_MS = 1500;
/** Never hold the app longer than this, whether or not it has loaded. */
const MAX_MS = 3200;
/** Matches .intro's fade-out in styles.css. */
const LEAVE_MS = 450;

const canPlay = () => {
  if (typeof window.matchMedia === 'function' && window.matchMedia('(prefers-reduced-motion: reduce)').matches) return false;
  try {
    return !sessionStorage.getItem(SEEN);
  } catch {
    return true;
  }
};

/**
 * The opening: on the black, the Z ♥ J mark fades in, the champagne swash
 * draws between the letters and the heart beats once; then it gives way to the
 * app. Once per session (a cold launch of the installed app is a new session),
 * skipped by a tap or any key, and never with reduced motion. It doubles as the
 * loading screen, leaving once the household has loaded (or after a few seconds
 * regardless), so the first thing after it is the real page. Decorative only:
 * hidden from assistive technology, which reaches the app beneath at once.
 */
export function Intro() {
  const { status } = useStore();
  const [phase, setPhase] = useState<'on' | 'leaving' | 'off'>(() => (canPlay() ? 'on' : 'off'));
  const started = useRef(performance.now());
  const settled = status !== 'loading';

  useEffect(() => {
    if (phase === 'off') return;
    try {
      sessionStorage.setItem(SEEN, '1');
    } catch {
      // Storage off: it plays once for this page.
    }
  }, [phase]);

  useEffect(() => {
    if (phase !== 'on') return;
    const elapsed = performance.now() - started.current;
    const t = window.setTimeout(() => setPhase('leaving'), Math.max(0, (settled ? MIN_MS : MAX_MS) - elapsed));
    const skip = () => setPhase('leaving');
    window.addEventListener('keydown', skip);
    return () => {
      window.clearTimeout(t);
      window.removeEventListener('keydown', skip);
    };
  }, [phase, settled]);

  useEffect(() => {
    if (phase !== 'leaving') return;
    const t = window.setTimeout(() => setPhase('off'), LEAVE_MS);
    return () => window.clearTimeout(t);
  }, [phase]);

  if (phase === 'off') return null;
  return (
    <div className={`intro ${phase === 'leaving' ? 'is-leaving' : ''}`} aria-hidden="true" onPointerDown={() => setPhase('leaving')}>
      <div className="intro-stage">
        <div className="intro-mark">
          <Wordmark height={92} />
        </div>
      </div>
    </div>
  );
}
