import { HOME_TEMPLATE_LABEL, MEMBERS, type Household, type HomeTemplate, type MemberId, type PinTarget } from '../data/types.ts';
import type { IconName } from '../components/Icon.tsx';
import { routes } from './routes.ts';

export const HOME_ICON: Record<HomeTemplate, IconName> = {
  address: 'home', utility: 'bolt', internet: 'wifi', maintenance: 'wrench', vehicle: 'car', pet: 'paw', emergency: 'phone', other: 'info',
};

export interface ResolvedPin {
  key: string;
  to: string;
  icon: IconName;
  title: string;
  sub: string;
}

/** Pins only ever point at saved records. A pin whose record is gone resolves to null and is skipped. */
export function resolvePin(h: Household, pin: PinTarget, me: MemberId): ResolvedPin | null {
  const key = `${pin.kind}:${pin.id}`;
  switch (pin.kind) {
    case 'profile': {
      const p = h.profiles.find((x) => x.id === pin.id);
      if (!p) return null;
      const n = h.locations.filter((l) => l.owner === p.id).length;
      return { key, to: routes.profile(p.id), icon: 'building', title: p.id === me ? 'My work details' : `${MEMBERS[p.id].name}’s work details`, sub: `${n} location${n === 1 ? '' : 's'}` };
    }
    case 'record': {
      const r = h.home.find((x) => x.id === pin.id);
      return r ? { key, to: routes.record(r.id), icon: HOME_ICON[r.template], title: r.title, sub: `Home · ${HOME_TEMPLATE_LABEL[r.template]}` } : null;
    }
    case 'list': {
      const l = h.lists.find((x) => x.id === pin.id);
      if (!l) return null;
      const open = l.items.filter((i) => !i.checked).length;
      return { key, to: routes.list(l.id), icon: 'list', title: l.title, sub: `${open} to get` };
    }
    case 'plan': {
      const p = h.plans.find((x) => x.id === pin.id);
      return p ? { key, to: routes.plan(p.id), icon: 'calendar', title: p.title, sub: 'Plan' } : null;
    }
    case 'contact': {
      const c = h.contacts.find((x) => x.id === pin.id);
      return c ? { key, to: routes.record(c.id), icon: 'phone', title: c.name, sub: c.category } : null;
    }
  }
}
