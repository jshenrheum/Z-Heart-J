// Tracks open forms with unsaved edits, so an app update never reloads over them
// and closing the tab warns first.
const dirty = new Set<string>();
const listeners = new Set<() => void>();
let version = 0;

export function setDirty(id: string, isDirty: boolean) {
  const had = dirty.has(id);
  if (isDirty && !had) dirty.add(id);
  else if (!isDirty && had) dirty.delete(id);
  else return;
  version += 1;
  listeners.forEach((l) => l());
}
export const anyDirty = () => dirty.size > 0;
export const subscribeDirty = (l: () => void) => {
  listeners.add(l);
  return () => listeners.delete(l);
};
export const dirtyVersion = () => version;

if (typeof window !== 'undefined') {
  window.addEventListener('beforeunload', (e) => {
    if (dirty.size > 0) {
      e.preventDefault();
      e.returnValue = '';
    }
  });
}
