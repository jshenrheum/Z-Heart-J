import { addDays, addMonthsClamped, type DateStr } from '../lib/dates.ts';
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
    item('groceries', 'g6', 'jeffrey', 'Sliced bread', 6),
    item('groceries', 'g7', 'zul', 'Rice', 7, { checked: true }),
    item('groceries', 'g8', 'jeffrey', 'Cheese', 8, { note: 'Shredded', checked: true }),
    item('groceries', 'g9', 'zul', 'Hand soap', 9, { checked: true }),
    item('groceries', 'g10', 'jeffrey', 'Chicken thighs', 10, { checked: true }),
    row('list', 'packing', 'jeffrey', 3, { title: 'Packing (demo)', description: 'A custom list.' }),
    row('list', 'recipes', 'jeffrey', 2, { title: 'Recipes', description: 'What to cook, and how.' }),
    item('recipes', 'r1', 'jeffrey', 'Weeknight pasta (demo)', 1, { note: 'Pasta, garlic, olive oil, chilli, parmesan.\nBoil the pasta. Warm the garlic and chilli in the oil, toss with the pasta and a ladle of its water, finish with parmesan.' }),
    item('recipes', 'r2', 'zul', 'Overnight oats (demo)', 2, { qty: 'Serves 2', note: 'Oats, milk, yoghurt, honey, berries.\nStir together, leave in the fridge overnight, top with berries.', checked: true }),
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

    row('event', 'ev-dinner', 'zul', 1, {
      title: 'Dinner with friends (demo)', whose: 'both', date: addDays(today, 2), startTime: '19:30', endTime: '21:30',
      location: '500 Example Street, Demoville, ST 00000', notes: 'Demo: the reservation is under “J”.', skips: [],
    }),
    row('event', 'ev-dentist', 'zul', 2, { title: 'Dentist (demo)', whose: 'zul', date: addDays(today, 5), startTime: '10:00', endTime: '11:00', location: 'Demo Dental, 600 Sample Way', notes: '', skips: [] }),
    row('event', 'ev-run', 'jeffrey', 9, { title: 'Morning run (demo)', whose: 'jeffrey', date: addDays(today, -13), startTime: '07:00', location: '', notes: '', repeat: { every: 1, unit: 'week' }, skips: [] }),
    row('event', 'ev-away', 'jeffrey', 4, { title: 'Weekend away (demo)', whose: 'both', date: addDays(today, 12), endDate: addDays(today, 14), location: 'Demo Lake Cabin', notes: '', skips: [] }),
    row('event', 'ev-anniversary', 'zul', 40, { title: 'Anniversary (demo)', whose: 'both', date: addMonthsClamped(addDays(today, 20), -12), location: '', notes: '', repeat: { every: 1, unit: 'year' }, skips: [] }),

    row('wedding', 'wedding', 'zul', 3, { date: addDays(today, 200), time: '16:00', venue: 'Placeholder Hall', address: '100 Example Avenue\nDemoville, ST 00000', budget: 25000, schedule: '3:00 PM Guests arrive\n4:00 PM Ceremony\n5:00 PM Cocktails\n6:30 PM Dinner\n8:00 PM Dancing', notes: 'Demo wedding — every detail here is a placeholder.' }),
    row('plan', 'plan-wedding', 'zul', 4, { title: 'Wedding checklist', description: 'Everything to do before the day.', target: addDays(today, 200), template: 'wedding', status: 'active' }),
    task('tw1', 'zul', { planId: 'plan-wedding', title: 'Send invitations (demo)', assignee: 'both', due: addDays(today, 30) }),
    task('tw2', 'jeffrey', { planId: 'plan-wedding', title: 'Book the band (demo)', assignee: 'jeffrey', due: addDays(today, 45) }),
    task('tw3', 'zul', { planId: 'plan-wedding', title: 'Cake tasting (demo)', assignee: 'both', status: 'done', completedOn: addDays(today, -4) }),
    row('vendor', 'vendor-venue', 'zul', 6, { name: 'Placeholder Hall', category: 'Venue', contact: 'Demo Coordinator', phone: '555-0160', email: 'events@example.com', website: 'https://example.com', status: 'booked', deposit: 'paid', notes: 'Includes tables and chairs.' }),
    row('vendor', 'vendor-photo', 'jeffrey', 2, { name: 'Demo Photography', category: 'Photographer', contact: '', phone: '555-0161', email: '', website: '', status: 'booked', deposit: 'due', depositDue: addDays(today, 14), notes: '8 hours, two photographers.' }),
    row('vendor', 'vendor-florist', 'zul', 1, { name: 'Example Florals', category: 'Florist', contact: '', phone: '', email: 'hello@example.com', website: '', status: 'considering', deposit: 'none', notes: '' }),
    row('guest', 'guest-1', 'zul', 2, { name: 'Demo Family (placeholder)', side: 'zul', party: 4, rsvp: 'yes', table: '1', meal: '', notes: '' }),
    row('guest', 'guest-2', 'jeffrey', 2, { name: 'Example Couple (placeholder)', side: 'jeffrey', party: 2, rsvp: 'pending', table: '', meal: '', notes: '' }),
    row('guest', 'guest-3', 'zul', 1, { name: 'Sample Friend (placeholder)', side: 'both', party: 1, rsvp: 'no', table: '', meal: 'vegetarian', notes: '' }),
    row('budget', 'budget-venue', 'zul', 6, { title: 'Venue hire', category: 'Venue', planned: 8000, paid: 2000, notes: '' }),
    row('budget', 'budget-photo', 'jeffrey', 2, { title: 'Photography', category: 'Photo & video', planned: 3500, paid: 0, notes: '' }),
    row('budget', 'budget-flowers', 'zul', 1, { title: 'Flowers', category: 'Flowers & decor', planned: 1200.5, paid: 1200.5, notes: 'Paid at the tasting.' }),
    row('pins', 'pins-jeffrey', 'jeffrey', 1, { targets: [{ kind: 'profile', id: 'jeffrey' }, { kind: 'profile', id: 'zul' }, { kind: 'record', id: 'home-address' }, { kind: 'list', id: 'groceries' }] }),
    row('pins', 'pins-zul', 'zul', 1, { targets: [{ kind: 'profile', id: 'zul' }, { kind: 'profile', id: 'jeffrey' }, { kind: 'record', id: 'home-address' }, { kind: 'list', id: 'groceries' }] }),
  ];
}
