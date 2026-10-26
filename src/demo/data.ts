import { addDays, type DateStr } from '../lib/dates.ts';
import type { Kind, Row } from '../lib/records.ts';
import type { MemberId } from '../data/types.ts';

/**
 * DEMO CONTENT ONLY — included in the demo build (`npm run build:demo`) and never in
 * the production build. Everything below is an unmistakable placeholder: reserved
 * 555-01xx phone numbers, "Demo"/"Placeholder" names, all-zero identifiers, and
 * example.com addresses. No personal, credential, or account data is seeded, and
 * dates are generated relative to today.
 *
 * Protected values (DEA and similar) do not exist here or anywhere in the client:
 * protected fields are only marked as such.
 */
export function makeDemoRows(today: DateStr): Row[] {
  const ago = (days: number) => new Date(Date.now() - days * 86_400_000).toISOString();
  let n = 0;
  const row = (kind: Kind, id: string, by: MemberId, days: number, data: Record<string, unknown>, parentId?: string): Row => {
    // Creation times keep the order below (oldest first), so cards keep their places.
    const createdAt = new Date(Date.UTC(2026, 0, 1) + n++ * 1000).toISOString();
    return { id, kind, ...(parentId ? { parentId } : {}), version: 1, data, createdBy: by, createdAt, updatedBy: by, updatedAt: ago(days) };
  };

  const location = (id: string, owner: MemberId, data: Record<string, string>) =>
    row('location', id, owner, owner === 'jeffrey' ? 6 : 9, { owner, directPhone: '', schedulingPhone: '', notes: '', ...data });
  const item = (list: string, id: string, by: MemberId, name: string, position: number, extra: { qty?: string; note?: string; checked?: boolean } = {}) =>
    row('item', id, by, 1, { name, qty: extra.qty ?? '', note: extra.note ?? '', checked: extra.checked ?? false, position }, list);
  const task = (id: string, by: MemberId, data: Record<string, unknown>) =>
    row('task', id, by, 2, { seriesId: id, status: 'open', notes: '', ...data }, data.planId as string | undefined);

  return [
    row('profile', 'jeffrey', 'jeffrey', 6, { displayName: 'Jeffrey', specialty: 'Demo specialty', organization: 'Demo Organization', npi: '0000000000' }),
    row('profile', 'zul', 'zul', 9, { displayName: 'Zul', specialty: 'Demo specialty', organization: 'Demo Organization (Zul)', npi: '0000000001' }),

    location('loc-j1', 'jeffrey', {
      label: 'Demo Location A', organization: 'Demo Organization', address: '100 Placeholder Street, Suite 1, Demoville, ST 00000',
      mainPhone: '(555) 010-0100', directPhone: '(555) 010-0101', fax: '(555) 010-0102', schedulingPhone: '(555) 010-0103', notes: 'Demo data — not a real office.',
    }),
    location('loc-j2', 'jeffrey', { label: 'Demo Location B', organization: 'Demo Organization', address: '200 Example Avenue, Demoville, ST 00000', mainPhone: '(555) 010-0200', fax: '(555) 010-0202' }),
    location('loc-z1', 'zul', {
      label: 'Demo Location C', organization: 'Demo Organization (Zul)', address: '300 Sample Road, Demoville, ST 00000', mainPhone: '(555) 010-0300', fax: '(555) 010-0302', schedulingPhone: '(555) 010-0303',
    }),

    row('credential', 'cred-j1', 'jeffrey', 6, { owner: 'jeffrey', type: 'DEA registration', issuer: 'Demo issuing body', expires: addDays(today, 120) }),
    row('credential', 'cred-j2', 'jeffrey', 6, { owner: 'jeffrey', type: 'State medical license', issuer: 'Demo State Board', expires: addDays(today, 38) }),
    row('credential', 'cred-z1', 'zul', 9, { owner: 'zul', type: 'Professional license', issuer: 'Demo State Board' }),

    row('home', 'home-address', 'zul', 12, {
      template: 'address', title: 'Home address', notes: '',
      fields: [
        { id: 'f-address', label: 'Address', kind: 'address', value: '1 Placeholder Lane, Demoville, ST 00000' },
        { id: 'f-delivery', label: 'Delivery instructions', kind: 'text', value: 'Demo: leave packages at the side door.' },
      ],
    }),
    row('home', 'home-electric', 'jeffrey', 20, {
      template: 'utility', title: 'Electric (demo provider)', notes: '',
      fields: [
        { id: 'f-provider', label: 'Provider', kind: 'text', value: 'Demo Electric Co.' },
        { id: 'f-support', label: 'Support phone', kind: 'phone', value: '(555) 010-0400' },
        { id: 'f-site', label: 'Service website', kind: 'url', value: 'https://example.com/demo-electric' },
        { id: 'f-account', label: 'Account reference', kind: 'identifier', protected: true },
      ],
    }),
    row('home', 'home-internet', 'jeffrey', 20, {
      template: 'internet', title: 'Internet', notes: 'Passwords live in the password manager, not here.',
      fields: [
        { id: 'f-provider', label: 'Provider', kind: 'text', value: 'Demo Broadband' },
        { id: 'f-network', label: 'Network name', kind: 'text', value: 'DemoNet' },
        { id: 'f-router', label: 'Router model', kind: 'text', value: 'Demo Router X1' },
        { id: 'f-manager', label: 'Password manager entry', kind: 'text', value: 'Look for “Home Wi-Fi (demo)”' },
      ],
    }),
    row('home', 'home-hvac', 'zul', 4, {
      template: 'maintenance', title: 'AC and filter', notes: '',
      fields: [
        { id: 'f-filter', label: 'Filter size', kind: 'text', value: '16 × 25 × 1 (demo)' },
        { id: 'f-unit', label: 'Unit model', kind: 'text', value: 'DEMO-AC-100' },
        { id: 'f-service', label: 'Service provider', kind: 'text', value: 'Demo Cool Air Service' },
      ],
    }),
    row('home', 'home-pet', 'zul', 30, {
      template: 'pet', title: 'Demo Pet', notes: '',
      fields: [
        { id: 'f-vet', label: 'Veterinarian', kind: 'text', value: 'Demo Vet Clinic' },
        { id: 'f-clinic', label: 'Clinic number', kind: 'phone', value: '(555) 010-0500' },
        { id: 'f-care', label: 'Care notes', kind: 'text', value: 'Demo: food and care instructions go here.' },
      ],
    }),
    row('home', 'home-vehicle', 'jeffrey', 45, {
      template: 'vehicle', title: 'Vehicle (demo)', notes: '',
      fields: [
        { id: 'f-model', label: 'Make and model', kind: 'text', value: 'Demo Sedan' },
        { id: 'f-year', label: 'Year', kind: 'text', value: '2020' },
        { id: 'f-plate', label: 'Plate', kind: 'identifier', protected: true },
      ],
    }),

    row('contact', 'contact-hvac', 'zul', 4, {
      name: 'Demo Cool Air Service', role: 'Heating and cooling', category: 'Maintenance provider', phone: '(555) 010-0600', fax: '', email: 'service@example.com', address: '',
      website: 'https://example.com/demo-cool-air', note: 'Demo: AC and heating service.', aliases: ['ac', 'a/c', 'hvac', 'air conditioning', 'heating', 'cooling'],
    }),
    row('contact', 'contact-vet', 'zul', 30, {
      name: 'Demo Vet Clinic', role: 'Veterinarian', category: 'Veterinarian', phone: '(555) 010-0500', fax: '(555) 010-0502', email: '', address: '400 Sample Way, Demoville, ST 00000',
      website: '', note: 'Demo: records can be faxed to the clinic.', aliases: ['vet', 'veterinarian', 'pet', 'animal'],
    }),
    row('contact', 'contact-property', 'jeffrey', 60, {
      name: 'Demo Property Contact', role: 'Property manager', category: 'Property contact', phone: '(555) 010-0700', fax: '', email: 'property@example.com', address: '', website: '',
      note: '', aliases: ['landlord', 'property', 'hoa', 'building'],
    }),

    row('list', 'groceries', 'zul', 1, { title: 'Groceries', description: 'Demo items — change them freely.' }),
    item('groceries', 'g1', 'zul', 'Milk', 1, { qty: '1 gal' }),
    item('groceries', 'g2', 'jeffrey', 'Eggs', 2, { qty: '1 dozen' }),
    item('groceries', 'g3', 'zul', 'Bananas', 3),
    item('groceries', 'g4', 'jeffrey', 'Coffee', 4, { note: 'Whole bean' }),
    item('groceries', 'g5', 'zul', 'Olive oil', 5, { checked: true }),
    row('list', 'packing', 'jeffrey', 3, { title: 'Packing (demo)', description: 'A custom list.' }),
    item('packing', 'p1', 'jeffrey', 'Chargers', 1),
    item('packing', 'p2', 'zul', 'Toiletries', 2),

    row('plan', 'plan-home', 'zul', 5, { title: 'Demo home project', description: 'Template: Home Project. Placeholder plan for the preview.', target: addDays(today, 45), template: 'home', status: 'active' }),
    row('plan', 'plan-trip', 'jeffrey', 8, { title: 'Demo trip', description: 'Template: Travel. Placeholder plan for the preview.', template: 'travel', status: 'active' }),

    task('t1', 'zul', { planId: 'plan-home', title: 'Get two quotes', assignee: 'both', due: addDays(today, 10) }),
    task('t2', 'zul', { planId: 'plan-home', title: 'Choose a contractor', assignee: 'zul', due: addDays(today, 21) }),
    task('t3', 'zul', { planId: 'plan-home', title: 'Schedule the work', assignee: 'jeffrey' }),
    task('t4', 'jeffrey', { planId: 'plan-trip', title: 'Book lodging', assignee: 'both' }),
    task('t5', 'zul', { title: 'Replace AC filter', assignee: 'both', due: addDays(today, 12), notes: 'See “AC and filter” for the size.', recurrence: { mode: 'schedule', every: 3, unit: 'month' } }),
    task('t6', 'jeffrey', { title: 'Test smoke alarms', assignee: 'jeffrey', due: addDays(today, -3), recurrence: { mode: 'after_completion', every: 6, unit: 'month' } }),
    task('t7', 'zul', { title: 'Renew parking permit (demo)', assignee: 'zul' }),
    task('t8', 'jeffrey', { title: 'Wipe down the router (demo)', assignee: 'jeffrey', status: 'done', completedOn: addDays(today, -9) }),

    row('pins', 'pins-jeffrey', 'jeffrey', 1, { targets: [{ kind: 'profile', id: 'jeffrey' }, { kind: 'profile', id: 'zul' }, { kind: 'record', id: 'home-address' }, { kind: 'list', id: 'groceries' }] }),
    row('pins', 'pins-zul', 'zul', 1, { targets: [{ kind: 'profile', id: 'zul' }, { kind: 'profile', id: 'jeffrey' }, { kind: 'record', id: 'home-address' }, { kind: 'list', id: 'groceries' }] }),
  ];
}
