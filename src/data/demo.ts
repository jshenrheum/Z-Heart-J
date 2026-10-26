import { addDays, type DateStr } from '../lib/dates.ts';
import type { Household, MemberId } from './types.ts';

/**
 * DEMO CONTENT ONLY. Everything below is an unmistakable placeholder: reserved
 * 555-01xx phone numbers, "Demo"/"Placeholder" names, all-zero identifiers, and
 * example.com addresses. No personal, credential, or account data is seeded, and
 * dates are generated relative to today (nothing from outside the brief).
 *
 * Protected values (DEA and similar) do not exist in this file or anywhere in the
 * client bundle — credentials carry metadata only.
 */
export function makeDemoHousehold(today: DateStr): Household {
  const ago = (days: number) => new Date(Date.now() - days * 86_400_000).toISOString();
  const by = (m: MemberId, days: number) => ({ updatedBy: m, updatedAt: ago(days) });

  return {
    profiles: [
      { id: 'jeffrey', displayName: 'Jeffrey', specialty: 'Demo specialty', organization: 'Demo Organization', npi: '0000000000', ...by('jeffrey', 6) },
      { id: 'zul', displayName: 'Zul', specialty: 'Demo specialty', organization: 'Demo Organization (Zul)', npi: '0000000001', ...by('zul', 9) },
    ],
    locations: [
      {
        id: 'loc-j1', owner: 'jeffrey', label: 'Demo Location A', organization: 'Demo Organization',
        address: '100 Placeholder Street, Suite 1, Demoville, ST 00000',
        mainPhone: '(555) 010-0100', directPhone: '(555) 010-0101', fax: '(555) 010-0102', schedulingPhone: '(555) 010-0103',
        notes: 'Demo data — not a real office.', ...by('jeffrey', 6),
      },
      {
        id: 'loc-j2', owner: 'jeffrey', label: 'Demo Location B', organization: 'Demo Organization',
        address: '200 Example Avenue, Demoville, ST 00000',
        mainPhone: '(555) 010-0200', directPhone: '', fax: '(555) 010-0202', schedulingPhone: '',
        notes: '', ...by('jeffrey', 6),
      },
      {
        id: 'loc-z1', owner: 'zul', label: 'Demo Location C', organization: 'Demo Organization (Zul)',
        address: '300 Sample Road, Demoville, ST 00000',
        mainPhone: '(555) 010-0300', directPhone: '', fax: '(555) 010-0302', schedulingPhone: '(555) 010-0303',
        notes: '', ...by('zul', 9),
      },
    ],
    credentials: [
      { id: 'cred-j1', owner: 'jeffrey', type: 'DEA registration', issuer: 'Demo issuing body', expires: addDays(today, 120), hasValue: false, ...by('jeffrey', 6) },
      { id: 'cred-j2', owner: 'jeffrey', type: 'State medical license', issuer: 'Demo State Board', expires: addDays(today, 38), hasValue: false, ...by('jeffrey', 6) },
      { id: 'cred-z1', owner: 'zul', type: 'Professional license', issuer: 'Demo State Board', hasValue: false, ...by('zul', 9) },
    ],
    home: [
      {
        id: 'home-address', template: 'address', title: 'Home address', notes: '', ...by('zul', 12),
        fields: [
          { label: 'Address', kind: 'address', value: '1 Placeholder Lane, Demoville, ST 00000' },
          { label: 'Delivery instructions', kind: 'text', value: 'Demo: leave packages at the side door.' },
        ],
      },
      {
        id: 'home-electric', template: 'utility', title: 'Electric (demo provider)', notes: '', ...by('jeffrey', 20),
        fields: [
          { label: 'Provider', kind: 'text', value: 'Demo Electric Co.' },
          { label: 'Support phone', kind: 'phone', value: '(555) 010-0400' },
          { label: 'Service website', kind: 'url', value: 'https://example.com/demo-electric' },
          { label: 'Account reference', kind: 'identifier', protected: true },
        ],
      },
      {
        id: 'home-internet', template: 'internet', title: 'Internet', notes: 'Passwords live in the password manager, not here.', ...by('jeffrey', 20),
        fields: [
          { label: 'Provider', kind: 'text', value: 'Demo Broadband' },
          { label: 'Network name', kind: 'text', value: 'DemoNet' },
          { label: 'Router model', kind: 'text', value: 'Demo Router X1' },
          { label: 'Password manager entry', kind: 'text', value: 'Look for “Home Wi-Fi (demo)”' },
        ],
      },
      {
        id: 'home-hvac', template: 'maintenance', title: 'AC and filter', notes: '', ...by('zul', 4),
        fields: [
          { label: 'Filter size', kind: 'text', value: '16 × 25 × 1 (demo)' },
          { label: 'Unit model', kind: 'text', value: 'DEMO-AC-100' },
          { label: 'Service provider', kind: 'text', value: 'Demo Cool Air Service' },
        ],
      },
      {
        id: 'home-pet', template: 'pet', title: 'Demo Pet', notes: '', ...by('zul', 30),
        fields: [
          { label: 'Veterinarian', kind: 'text', value: 'Demo Vet Clinic' },
          { label: 'Clinic number', kind: 'phone', value: '(555) 010-0500' },
          { label: 'Care notes', kind: 'text', value: 'Demo: food and care instructions go here.' },
        ],
      },
      {
        id: 'home-vehicle', template: 'vehicle', title: 'Vehicle (demo)', notes: '', ...by('jeffrey', 45),
        fields: [
          { label: 'Make and model', kind: 'text', value: 'Demo Sedan' },
          { label: 'Year', kind: 'text', value: '2020' },
          { label: 'Plate', kind: 'identifier', protected: true },
        ],
      },
    ],
    contacts: [
      {
        id: 'contact-hvac', name: 'Demo Cool Air Service', role: 'Heating and cooling', category: 'Maintenance provider',
        phone: '(555) 010-0600', fax: '', email: 'service@example.com', address: '', website: 'https://example.com/demo-cool-air',
        note: 'Demo: AC and heating service.', aliases: ['ac', 'a/c', 'hvac', 'air conditioning', 'heating', 'cooling'], ...by('zul', 4),
      },
      {
        id: 'contact-vet', name: 'Demo Vet Clinic', role: 'Veterinarian', category: 'Veterinarian',
        phone: '(555) 010-0500', fax: '(555) 010-0502', email: '', address: '400 Sample Way, Demoville, ST 00000', website: '',
        note: 'Demo: records can be faxed to the clinic.', aliases: ['vet', 'veterinarian', 'pet', 'animal'], ...by('zul', 30),
      },
      {
        id: 'contact-property', name: 'Demo Property Contact', role: 'Property manager', category: 'Property contact',
        phone: '(555) 010-0700', fax: '', email: 'property@example.com', address: '', website: '',
        note: '', aliases: ['landlord', 'property', 'hoa', 'building'], ...by('jeffrey', 60),
      },
    ],
    lists: [
      {
        id: 'groceries', title: 'Groceries', description: 'Demo items — change them freely.', ...by('zul', 1),
        items: [
          { id: 'g1', name: 'Milk', qty: '1 gal', note: '', checked: false, updatedBy: 'zul' },
          { id: 'g2', name: 'Eggs', qty: '1 dozen', note: '', checked: false, updatedBy: 'jeffrey' },
          { id: 'g3', name: 'Bananas', qty: '', note: '', checked: false, updatedBy: 'zul' },
          { id: 'g4', name: 'Coffee', qty: '', note: 'Whole bean', checked: false, updatedBy: 'jeffrey' },
          { id: 'g5', name: 'Olive oil', qty: '', note: '', checked: true, updatedBy: 'zul' },
        ],
      },
      {
        id: 'packing', title: 'Packing (demo)', description: 'A custom list.', ...by('jeffrey', 3),
        items: [
          { id: 'p1', name: 'Chargers', qty: '', note: '', checked: false, updatedBy: 'jeffrey' },
          { id: 'p2', name: 'Toiletries', qty: '', note: '', checked: false, updatedBy: 'zul' },
        ],
      },
    ],
    plans: [
      { id: 'plan-home', title: 'Demo home project', description: 'Template: Home Project. Placeholder plan for the preview.', target: addDays(today, 45), template: 'home', status: 'active', ...by('zul', 5) },
      { id: 'plan-trip', title: 'Demo trip', description: 'Template: Travel. Placeholder plan for the preview.', template: 'travel', status: 'active', ...by('jeffrey', 8) },
    ],
    tasks: [
      { id: 't1', seriesId: 't1', planId: 'plan-home', title: 'Get two quotes', assignee: 'both', due: addDays(today, 10), status: 'open', notes: '', updatedBy: 'zul' },
      { id: 't2', seriesId: 't2', planId: 'plan-home', title: 'Choose a contractor', assignee: 'zul', due: addDays(today, 21), status: 'open', notes: '', updatedBy: 'zul' },
      { id: 't3', seriesId: 't3', planId: 'plan-home', title: 'Schedule the work', assignee: 'jeffrey', status: 'open', notes: '', updatedBy: 'zul' },
      { id: 't4', seriesId: 't4', planId: 'plan-trip', title: 'Book lodging', assignee: 'both', status: 'open', notes: '', updatedBy: 'jeffrey' },
      {
        id: 't5', seriesId: 't5', title: 'Replace AC filter', assignee: 'both', due: addDays(today, 12), status: 'open', notes: 'See “AC and filter” for the size.',
        recurrence: { mode: 'schedule', every: 3, unit: 'month' }, updatedBy: 'zul',
      },
      {
        id: 't6', seriesId: 't6', title: 'Test smoke alarms', assignee: 'jeffrey', due: addDays(today, -3), status: 'open', notes: '',
        recurrence: { mode: 'after_completion', every: 6, unit: 'month' }, updatedBy: 'jeffrey',
      },
      { id: 't7', seriesId: 't7', title: 'Renew parking permit (demo)', assignee: 'zul', status: 'open', notes: '', updatedBy: 'zul' },
      { id: 't8', seriesId: 't8', title: 'Wipe down the router (demo)', assignee: 'jeffrey', status: 'done', completedOn: addDays(today, -9), notes: '', updatedBy: 'jeffrey' },
    ],
    pins: {
      jeffrey: [
        { kind: 'profile', id: 'jeffrey' },
        { kind: 'profile', id: 'zul' },
        { kind: 'record', id: 'home-address' },
        { kind: 'list', id: 'groceries' },
      ],
      zul: [
        { kind: 'profile', id: 'zul' },
        { kind: 'profile', id: 'jeffrey' },
        { kind: 'record', id: 'home-address' },
        { kind: 'list', id: 'groceries' },
      ],
    },
  };
}
