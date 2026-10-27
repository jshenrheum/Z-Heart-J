import { createContext, useCallback, useContext, useMemo, useState, type ReactNode } from 'react';
import { HOME_TEMPLATE_LABEL, MEMBER_IDS, MEMBERS, type Assignee, type FieldKind, type HomeTemplate, type MemberId, type Plan } from '../data/types.ts';
import { useStore, type Outcome } from '../data/store.tsx';
import { useFeedback } from '../lib/feedback.tsx';
import { newRowId } from '../lib/records.ts';
import { navigate } from '../lib/router.tsx';
import { routes } from '../lib/routes.ts';
import type { RecurrenceMode, RecurrenceUnit } from '../lib/recurrence.ts';
import { todayIn } from '../lib/dates.ts';
import type { EventRepeat } from '../data/types.ts';
import { Icon } from './Icon.tsx';
import { FormSheet, type FieldDef, type Values } from './FormSheet.tsx';

/** All "add / edit" forms, opened from anywhere via useForms(). */

export type FormRequest =
  | { kind: 'task'; id?: string; prefill?: Partial<Values> }
  | { kind: 'contact'; id?: string }
  | { kind: 'home'; id: string }
  | { kind: 'field'; recordId: string }
  | { kind: 'info'; title?: string }
  | { kind: 'location'; owner: MemberId; id?: string }
  | { kind: 'profile'; id: MemberId }
  | { kind: 'credential'; owner: MemberId; id?: string }
  | { kind: 'list'; id?: string }
  | { kind: 'plan'; id?: string }
  | { kind: 'item'; listId: string; itemId: string }
  | { kind: 'event'; id?: string; date?: string };

const FormsCtx = createContext<{ open: (r: FormRequest) => void } | null>(null);
export const useForms = () => {
  const v = useContext(FormsCtx);
  if (!v) throw new Error('FormsProvider missing');
  return v;
};

const SHARED = 'Information you save here is shared with both of you.';
const done = (r: Outcome<unknown>): true | string => (r.ok ? true : r.message);

export function FormsProvider({ children }: { children: ReactNode }) {
  const [req, setReq] = useState<FormRequest | null>(null);
  const open = useCallback((r: FormRequest) => setReq(r), []);
  const close = useCallback(() => setReq(null), []);
  const api = useMemo(() => ({ open }), [open]);
  return (
    <FormsCtx.Provider value={api}>
      {children}
      {req?.kind === 'task' && <TaskForm id={req.id} prefill={req.prefill} onClose={close} />}
      {req?.kind === 'contact' && <ContactForm id={req.id} onClose={close} />}
      {req?.kind === 'home' && <HomeRecordForm id={req.id} onClose={close} />}
      {req?.kind === 'field' && <FieldForm recordId={req.recordId} onClose={close} />}
      {req?.kind === 'info' && <InfoForm title={req.title} onClose={close} />}
      {req?.kind === 'location' && <LocationForm owner={req.owner} id={req.id} onClose={close} />}
      {req?.kind === 'profile' && <ProfileForm id={req.id} onClose={close} />}
      {req?.kind === 'credential' && <CredentialForm owner={req.owner} id={req.id} onClose={close} />}
      {req?.kind === 'list' && <ListForm id={req.id} onClose={close} />}
      {req?.kind === 'plan' && <PlanForm id={req.id} onClose={close} />}
      {req?.kind === 'item' && <ItemForm listId={req.listId} itemId={req.itemId} onClose={close} />}
      {req?.kind === 'event' && <EventForm id={req.id} date={req.date} onClose={close} />}
    </FormsCtx.Provider>
  );
}

/** "Move to trash" inside an edit form: kept 30 days, with Undo right after. */
function TrashButton({ id, what, after, onClose }: { id: string; what: string; after: string; onClose: () => void }) {
  const { actions } = useStore();
  const [busy, setBusy] = useState(false);
  return (
    <button
      type="button"
      className="btn btn-quiet btn-danger-text"
      disabled={busy}
      onClick={async () => {
        setBusy(true);
        const r = await actions.trashRecord(id, what);
        setBusy(false);
        if (r.ok) {
          onClose();
          navigate(after);
        }
      }}
    >
      <Icon name="trash" size={17} /> Move to trash
    </button>
  );
}

// ------------------------------------------------------------------ task

function TaskForm({ id, prefill, onClose }: { id?: string; prefill?: Partial<Values>; onClose: () => void }) {
  const { state, actions } = useStore();
  const { toast } = useFeedback();
  const existing = id ? state.tasks.find((t) => t.id === id) : undefined;
  const noPlan = (v: Values) => !v.planId;
  const repeats = (v: Values) => noPlan(v) && v.repeat !== 'none';
  const fields: FieldDef[] = [
    { name: 'title', label: 'Task', required: true, maxLength: 120, placeholder: 'e.g. Replace the filter' },
    {
      name: 'assignee', label: 'Who', type: 'select', required: true,
      options: [...MEMBER_IDS.map((m) => ({ value: m, label: MEMBERS[m].name })), { value: 'both', label: 'Both of us' }],
    },
    { name: 'due', label: 'Due date', type: 'date', hint: 'Leave blank for no date. Undated tasks are never shown as late.' },
    {
      name: 'planId', label: 'Part of a plan', type: 'select',
      options: [{ value: '', label: 'No, just a household task' }, ...state.plans.filter((p: Plan) => p.status === 'active' || p.id === existing?.planId).map((p) => ({ value: p.id, label: p.title }))],
    },
    {
      name: 'repeat', label: 'Repeat', type: 'select', showIf: noPlan,
      options: [
        { value: 'none', label: 'Doesn’t repeat' },
        { value: 'schedule', label: 'On a schedule — from the due date' },
        { value: 'after_completion', label: 'After it’s done — from the day it’s done' },
      ],
      hint: 'Every 3 months on a schedule is different from 3 months after it’s done.',
    },
    { name: 'every', label: 'Every how many?', type: 'number', min: 1, max: 99, showIf: repeats },
    {
      name: 'unit', label: 'Unit', type: 'select', showIf: repeats,
      options: [{ value: 'day', label: 'Days' }, { value: 'week', label: 'Weeks' }, { value: 'month', label: 'Months' }, { value: 'year', label: 'Years' }],
      hint: 'If a month doesn’t have that day (like the 31st), the month’s last day is used, and the following months go back to the original day.',
    },
    { name: 'notes', label: 'Notes', type: 'textarea', maxLength: 1000 },
  ];
  // The schedule model needs a due date to anchor to.
  const withRule = fields.map((f) => (f.name === 'due' ? { ...f, validate: (_: string, all: Values) => (all.repeat === 'schedule' && !all.planId && !all.due ? 'Add a due date to repeat on a schedule' : undefined) } : f));
  const initial: Values = existing
    ? {
        title: existing.title, assignee: existing.assignee, due: existing.due ?? '', planId: existing.planId ?? '', repeat: existing.recurrence?.mode ?? 'none',
        every: String(existing.recurrence?.every ?? 1), unit: existing.recurrence?.unit ?? 'month', notes: existing.notes,
      }
    : { title: '', assignee: 'both', due: '', planId: '', repeat: 'none', every: '1', unit: 'month', notes: '', ...prefill };
  return (
    <FormSheet
      title={existing ? 'Edit task' : 'New task'}
      fields={withRule}
      initial={initial}
      submitLabel={existing ? 'Save changes' : 'Add task'}
      note={SHARED}
      onClose={onClose}
      extraAction={existing && <TrashButton id={existing.id} what={`“${existing.title}”`} after={existing.planId ? routes.plan(existing.planId) : routes.plans} onClose={onClose} />}
      onSubmit={async (v) => {
        const standalone = !v.planId;
        const input = {
          title: v.title ?? '',
          assignee: (v.assignee as Assignee) || 'both',
          due: v.due || undefined,
          planId: v.planId || undefined,
          notes: v.notes ?? '',
          recurrence: standalone && v.repeat && v.repeat !== 'none' ? { mode: v.repeat as RecurrenceMode, every: Number(v.every || '1'), unit: (v.unit as RecurrenceUnit) || 'month' } : undefined,
        };
        const r = existing ? await actions.saveTask(existing.id, input) : await actions.addTask(input);
        if (r.ok) toast(existing ? 'Task saved.' : 'Task added.');
        return done(r);
      }}
    />
  );
}

// ------------------------------------------------------------------ contact

const CATEGORIES = ['Veterinarian', 'Dentist', 'Maintenance provider', 'Property contact', 'Wedding vendor'];

function ContactForm({ id, onClose }: { id?: string; onClose: () => void }) {
  const { state, actions } = useStore();
  const { toast } = useFeedback();
  const existing = id ? state.contacts.find((c) => c.id === id) : undefined;
  const fields: FieldDef[] = [
    { name: 'name', label: 'Name', required: true, maxLength: 100 },
    { name: 'category', label: 'Category', required: true, suggestions: CATEGORIES, hint: 'Pick one or type your own.', maxLength: 60 },
    { name: 'role', label: 'Role or company', maxLength: 100 },
    { name: 'phone', label: 'Phone', type: 'tel' },
    { name: 'fax', label: 'Fax', type: 'tel', hint: 'Fax numbers can be copied but are never shown as call links.' },
    { name: 'email', label: 'Email', type: 'email' },
    { name: 'address', label: 'Address', maxLength: 200 },
    { name: 'website', label: 'Website', type: 'url' },
    { name: 'note', label: 'Note', type: 'textarea' },
  ];
  const initial: Values = {
    name: existing?.name ?? '', category: existing?.category ?? '', role: existing?.role ?? '', phone: existing?.phone ?? '', fax: existing?.fax ?? '',
    email: existing?.email ?? '', address: existing?.address ?? '', website: existing?.website ?? '', note: existing?.note ?? '',
  };
  return (
    <FormSheet
      title={existing ? `Edit ${existing.name}` : 'New contact'}
      fields={fields}
      initial={initial}
      submitLabel={existing ? 'Save changes' : 'Add contact'}
      note={`${SHARED} Saving a contact doesn’t send them anything.`}
      onClose={onClose}
      extraAction={existing && <TrashButton id={existing.id} what={`“${existing.name}”`} after={routes.contacts} onClose={onClose} />}
      onSubmit={async (v) => {
        const r = await actions.saveContact(existing?.id ?? null, {
          name: v.name ?? '', category: v.category ?? '', role: v.role ?? '', phone: v.phone ?? '', fax: v.fax ?? '', email: v.email ?? '', address: v.address ?? '', website: v.website ?? '', note: v.note ?? '',
        });
        if (r.ok) {
          toast(existing ? 'Contact saved.' : 'Contact added.');
          if (!existing) navigate(routes.record(r.value));
        }
        return done(r);
      }}
    />
  );
}

// ------------------------------------------------------------------ home cards

/** Edits a home reference card. Protected values are never edited here (see ProtectedValue). */
function HomeRecordForm({ id, onClose }: { id: string; onClose: () => void }) {
  const { state, actions } = useStore();
  const { toast } = useFeedback();
  const rec = state.home.find((r) => r.id === id);
  if (!rec) return null;
  const ordinary = rec.fields.filter((f) => !f.protected);
  const typeOf = (k: string): FieldDef['type'] => (k === 'phone' || k === 'fax' ? 'tel' : k === 'email' ? 'email' : k === 'url' ? 'url' : k === 'date' ? 'date' : 'text');
  const fields: FieldDef[] = [
    { name: 'title', label: 'Title', required: true, maxLength: 100 },
    ...ordinary.map((f): FieldDef => ({ name: `f:${f.id}`, label: f.label, type: typeOf(f.kind), maxLength: 300, hint: f.kind === 'fax' ? 'Copy-only. Never shown as a call link.' : undefined })),
    { name: 'notes', label: 'Notes', type: 'textarea' },
  ];
  const initial: Values = { title: rec.title, notes: rec.notes };
  for (const f of ordinary) initial[`f:${f.id}`] = f.value ?? '';
  const protectedCount = rec.fields.length - ordinary.length;
  return (
    <FormSheet
      title={`Edit ${rec.title}`}
      fields={fields}
      initial={initial}
      submitLabel="Save changes"
      note={`${SHARED} Clearing a field removes it.${protectedCount ? ' Protected fields are managed on the card itself and aren’t shown here.' : ''}`}
      onClose={onClose}
      extraAction={<TrashButton id={rec.id} what={`“${rec.title}”`} after={`${routes.info}?who=home`} onClose={onClose} />}
      onSubmit={async (v) => {
        const nextFields = rec.fields.map((f) => (f.protected ? f : { ...f, value: v[`f:${f.id}`] ?? '' })).filter((f) => f.protected || f.value);
        const r = await actions.saveHomeRecord(rec.id, { title: v.title ?? rec.title, notes: v.notes ?? '', fields: nextFields });
        if (r.ok) toast('Saved.');
        return done(r);
      }}
    />
  );
}

const FIELD_KIND_LABEL: Array<{ value: FieldKind; label: string }> = [
  { value: 'text', label: 'Text' },
  { value: 'phone', label: 'Phone number' },
  { value: 'fax', label: 'Fax number (copy-only)' },
  { value: 'address', label: 'Address' },
  { value: 'email', label: 'Email' },
  { value: 'url', label: 'Web address' },
  { value: 'identifier', label: 'Number or ID' },
  { value: 'date', label: 'Date' },
];

/** Adds one field to a home card: an ordinary value, or a protected one saved separately. */
function FieldForm({ recordId, onClose }: { recordId: string; onClose: () => void }) {
  const { state, actions, backend } = useStore();
  const { toast } = useFeedback();
  const rec = state.home.find((r) => r.id === recordId);
  if (!rec) return null;
  const live = backend.mode === 'live';
  const ordinary = (v: Values) => v.protection !== 'protected';
  const fields: FieldDef[] = [
    { name: 'label', label: 'Field name', required: true, maxLength: 60, placeholder: 'e.g. Account number, Gate code' },
    { name: 'kind', label: 'Kind', type: 'select', options: FIELD_KIND_LABEL },
    {
      name: 'protection', label: 'Protection', type: 'select',
      options: [
        { value: 'ordinary', label: 'Ordinary — shown, searchable, in exports' },
        ...(live ? [{ value: 'protected', label: 'Protected — encrypted, shown only when revealed' }] : []),
      ],
      hint: live ? 'A protected value is never searchable, never in summaries or exports. You’ll enter it on the card after saving.' : 'Protected fields need the signed-in app; the demo doesn’t store protected values.',
    },
    { name: 'value', label: 'Value', showIf: ordinary, maxLength: 300, validate: (val, all) => validateByKind(all.kind, val) },
  ];
  return (
    <FormSheet
      title={`Add a field to ${rec.title}`}
      fields={fields}
      initial={{ label: '', kind: 'text', protection: 'ordinary', value: '' }}
      submitLabel="Add field"
      note={SHARED}
      onClose={onClose}
      onSubmit={async (v) => {
        const kind = (v.kind as FieldKind) || 'text';
        const field = v.protection === 'protected' ? { id: newRowId('f'), label: v.label ?? '', kind, protected: true } : { id: newRowId('f'), label: v.label ?? '', kind, value: v.value ?? '' };
        if (!field.protected && !field.value) return 'Enter a value, or choose Protected to enter it securely afterwards.';
        const r = await actions.saveHomeRecord(rec.id, { title: rec.title, notes: rec.notes, fields: [...rec.fields, field] });
        if (r.ok) toast(field.protected ? 'Field added. Enter its value on the card.' : 'Field added.');
        return done(r);
      }}
    />
  );
}

function validateByKind(kind: string | undefined, raw: string): string | undefined {
  const v = raw.trim();
  if (!v) return undefined;
  if ((kind === 'phone' || kind === 'fax') && !/^[0-9\s().+\-x#,]{3,30}$/i.test(v)) return 'Use digits and ( ) + - only';
  if (kind === 'email' && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(v)) return 'Enter a valid email address';
  if (kind === 'url' && !/^(https?:\/\/)?[^\s]+\.[^\s]+$/i.test(v)) return 'Enter a web address';
  if (kind === 'date' && !/^\d{4}-\d{2}-\d{2}$/.test(v)) return 'Use the form YYYY-MM-DD';
  return undefined;
}

// ------------------------------------------------------------------ other information

function InfoForm({ title, onClose }: { title?: string; onClose: () => void }) {
  const { actions } = useStore();
  const { toast } = useFeedback();
  const fields: FieldDef[] = [
    { name: 'title', label: 'Title', required: true, maxLength: 100, placeholder: 'e.g. Trash pickup days' },
    { name: 'template', label: 'Category', type: 'select', options: (Object.keys(HOME_TEMPLATE_LABEL) as HomeTemplate[]).map((t) => ({ value: t, label: HOME_TEMPLATE_LABEL[t] })).sort((a, b) => (a.value === 'other' ? -1 : b.value === 'other' ? 1 : 0)) },
    { name: 'details', label: 'Details', type: 'textarea', maxLength: 300, hint: 'Passwords, recovery codes, and bank logins belong in your password manager — name the entry here instead.' },
  ];
  return (
    <FormSheet
      title="Add information"
      fields={fields}
      initial={{ title: title ?? '', template: 'other', details: '' }}
      submitLabel="Save"
      note={SHARED}
      onClose={onClose}
      onSubmit={async (v) => {
        const r = await actions.addInfo({ template: (v.template as HomeTemplate) || 'other', title: v.title ?? '', details: v.details ?? '', notes: '' });
        if (r.ok) {
          toast('Saved to Home.');
          navigate(routes.record(r.value));
        }
        return done(r);
      }}
    />
  );
}

// ------------------------------------------------------------------ work: profile, locations, credentials

function ProfileForm({ id, onClose }: { id: MemberId; onClose: () => void }) {
  const { state, actions } = useStore();
  const { toast } = useFeedback();
  const p = state.profiles.find((x) => x.id === id);
  if (!p) return null;
  const fields: FieldDef[] = [
    { name: 'displayName', label: 'Name as it appears on the work summary', maxLength: 80 },
    { name: 'specialty', label: 'Specialty', maxLength: 120 },
    { name: 'organization', label: 'Organization', maxLength: 120 },
    { name: 'npi', label: 'NPI', maxLength: 10, hint: 'A public 10-digit professional identifier. It appears in the work summary.', validate: (v) => (v && !/^\d{10}$/.test(v) ? 'An NPI is 10 digits' : undefined) },
  ];
  return (
    <FormSheet
      title={`${MEMBERS[id].name}’s work details`}
      fields={fields}
      initial={{ displayName: p.displayName, specialty: p.specialty, organization: p.organization, npi: p.npi }}
      submitLabel="Save changes"
      note={`${SHARED} DEA and other protected numbers go on a credential, never here.`}
      onClose={onClose}
      onSubmit={async (v) => {
        const r = await actions.saveProfile(id, { displayName: v.displayName ?? '', specialty: v.specialty ?? '', organization: v.organization ?? '', npi: v.npi ?? '' });
        if (r.ok) toast('Work details saved.');
        return done(r);
      }}
    />
  );
}

function LocationForm({ owner, id, onClose }: { owner: MemberId; id?: string; onClose: () => void }) {
  const { state, actions } = useStore();
  const { toast } = useFeedback();
  const existing = id ? state.locations.find((l) => l.id === id) : undefined;
  const fields: FieldDef[] = [
    { name: 'label', label: 'Location name', required: true, maxLength: 80, placeholder: 'e.g. Main office' },
    { name: 'organization', label: 'Organization', maxLength: 120 },
    { name: 'address', label: 'Address', type: 'textarea', maxLength: 300 },
    { name: 'mainPhone', label: 'Main phone', type: 'tel' },
    { name: 'directPhone', label: 'Direct phone', type: 'tel' },
    { name: 'fax', label: 'Fax', type: 'tel', hint: 'Copy-only. Never shown as a call link.' },
    { name: 'schedulingPhone', label: 'Scheduling phone', type: 'tel' },
    { name: 'notes', label: 'Notes', type: 'textarea' },
  ];
  const initial: Values = {
    label: existing?.label ?? '', organization: existing?.organization ?? '', address: existing?.address ?? '', mainPhone: existing?.mainPhone ?? '',
    directPhone: existing?.directPhone ?? '', fax: existing?.fax ?? '', schedulingPhone: existing?.schedulingPhone ?? '', notes: existing?.notes ?? '',
  };
  return (
    <FormSheet
      title={existing ? `Edit ${existing.label}` : `Add a work location for ${MEMBERS[owner].name}`}
      fields={fields}
      initial={initial}
      submitLabel={existing ? 'Save changes' : 'Add location'}
      note={SHARED}
      onClose={onClose}
      extraAction={existing && <TrashButton id={existing.id} what={`“${existing.label}”`} after={routes.profile(existing.owner)} onClose={onClose} />}
      onSubmit={async (v) => {
        const r = await actions.saveLocation(existing?.id ?? null, owner, {
          label: v.label ?? '', organization: v.organization ?? '', address: v.address ?? '', mainPhone: v.mainPhone ?? '', directPhone: v.directPhone ?? '',
          fax: v.fax ?? '', schedulingPhone: v.schedulingPhone ?? '', notes: v.notes ?? '',
        });
        if (r.ok) {
          toast(existing ? 'Location saved.' : 'Location added.');
          if (!existing) navigate(routes.record(r.value));
        }
        return done(r);
      }}
    />
  );
}

function CredentialForm({ owner, id, onClose }: { owner: MemberId; id?: string; onClose: () => void }) {
  const { state, actions } = useStore();
  const { toast } = useFeedback();
  const existing = id ? state.credentials.find((c) => c.id === id) : undefined;
  const fields: FieldDef[] = [
    { name: 'type', label: 'Credential', required: true, maxLength: 80, placeholder: 'e.g. DEA registration, State license' },
    { name: 'issuer', label: 'Issuing body', maxLength: 120 },
    { name: 'expires', label: 'Expires', type: 'date' },
    { name: 'renewalUrl', label: 'Renewal link', type: 'url' },
  ];
  return (
    <FormSheet
      title={existing ? `Edit ${existing.type}` : `Add a credential for ${MEMBERS[owner].name}`}
      fields={fields}
      initial={{ type: existing?.type ?? '', issuer: existing?.issuer ?? '', expires: existing?.expires ?? '', renewalUrl: existing?.renewalUrl ?? '' }}
      submitLabel={existing ? 'Save changes' : 'Add credential'}
      note={`${SHARED} The number itself isn’t entered here: it’s saved encrypted on the credential’s page and shown only when someone taps Reveal.`}
      onClose={onClose}
      extraAction={existing && <TrashButton id={existing.id} what={`“${existing.type}”`} after={routes.profile(existing.owner)} onClose={onClose} />}
      onSubmit={async (v) => {
        const r = await actions.saveCredential(existing?.id ?? null, owner, { type: v.type ?? '', issuer: v.issuer ?? '', expires: v.expires || undefined, renewalUrl: v.renewalUrl || undefined });
        if (r.ok) {
          toast(existing ? 'Credential saved.' : 'Credential added.');
          if (!existing) navigate(routes.record(r.value));
        }
        return done(r);
      }}
    />
  );
}

// ------------------------------------------------------------------ list / plan / item

function ListForm({ id, onClose }: { id?: string; onClose: () => void }) {
  const { state, actions } = useStore();
  const existing = id ? state.lists.find((l) => l.id === id) : undefined;
  const fields: FieldDef[] = [
    { name: 'title', label: 'List name', required: true, maxLength: 80, placeholder: 'e.g. Packing, Hardware store' },
    { name: 'description', label: 'Description', maxLength: 200 },
  ];
  return (
    <FormSheet
      title={existing ? `Edit ${existing.title}` : 'New list'}
      fields={fields}
      initial={{ title: existing?.title ?? '', description: existing?.description ?? '' }}
      submitLabel={existing ? 'Save changes' : 'Create list'}
      note={SHARED}
      onClose={onClose}
      extraAction={existing && <TrashButton id={existing.id} what={`“${existing.title}”`} after={routes.lists} onClose={onClose} />}
      onSubmit={async (v) => {
        const r = await actions.saveList(existing?.id ?? null, v.title ?? '', v.description ?? '');
        if (r.ok && !existing) navigate(routes.list(r.value));
        return done(r);
      }}
    />
  );
}

function PlanForm({ id, onClose }: { id?: string; onClose: () => void }) {
  const { state, actions } = useStore();
  const { toast } = useFeedback();
  const existing = id ? state.plans.find((p) => p.id === id) : undefined;
  const fields: FieldDef[] = [
    { name: 'title', label: 'Plan name', required: true, maxLength: 100 },
    { name: 'template', label: 'Type', type: 'select', options: [{ value: 'home', label: 'Home project' }, { value: 'travel', label: 'Travel' }, { value: 'wedding', label: 'Wedding' }, { value: 'custom', label: 'Custom' }] },
    { name: 'description', label: 'Description', type: 'textarea' },
    { name: 'target', label: 'Target date', type: 'date' },
    ...(existing ? [{ name: 'status', label: 'Status', type: 'select' as const, options: [{ value: 'active', label: 'Active' }, { value: 'done', label: 'Finished' }] }] : []),
  ];
  return (
    <FormSheet
      title={existing ? `Edit ${existing.title}` : 'New plan'}
      fields={fields}
      initial={existing ? { title: existing.title, template: existing.template, description: existing.description, target: existing.target ?? '', status: existing.status } : { title: '', template: 'home', description: '', target: '' }}
      submitLabel={existing ? 'Save changes' : 'Create plan'}
      note={existing ? `${SHARED} Moving a plan to the trash takes its tasks with it; restoring brings them back.` : SHARED}
      onClose={onClose}
      extraAction={existing && <TrashButton id={existing.id} what={`“${existing.title}”`} after={routes.plans} onClose={onClose} />}
      onSubmit={async (v) => {
        const r = await actions.savePlan(existing?.id ?? null, {
          title: v.title ?? '', description: v.description ?? '', target: v.target || undefined, template: (v.template as Plan['template']) || 'custom', status: (v.status as Plan['status']) || 'active',
        });
        if (r.ok) {
          toast(existing ? 'Plan saved.' : 'Plan created.');
          if (!existing) navigate(routes.plan(r.value));
        }
        return done(r);
      }}
    />
  );
}

function ItemForm({ listId, itemId, onClose }: { listId: string; itemId: string; onClose: () => void }) {
  const { state, actions } = useStore();
  const item = state.lists.find((l) => l.id === listId)?.items.find((i) => i.id === itemId);
  if (!item) return null;
  const fields: FieldDef[] = [
    { name: 'name', label: 'Item', required: true, maxLength: 100 },
    { name: 'qty', label: 'Quantity', maxLength: 40, placeholder: 'e.g. 2, 1 dozen' },
    { name: 'note', label: 'Note', maxLength: 200 },
  ];
  return (
    <FormSheet
      title="Edit item"
      fields={fields}
      initial={{ name: item.name, qty: item.qty, note: item.note }}
      submitLabel="Save"
      onClose={onClose}
      extraAction={
        <button
          type="button"
          className="btn btn-quiet btn-danger-text"
          onClick={() => {
            void actions.deleteItem(listId, itemId);
            onClose();
          }}
        >
          <Icon name="trash" size={17} /> Remove
        </button>
      }
      onSubmit={async (v) => done(await actions.editItem(listId, itemId, { name: v.name ?? '', qty: v.qty ?? '', note: v.note ?? '' }))}
    />
  );
}

// ------------------------------------------------------------------ calendar event

function EventForm({ id, date, onClose }: { id?: string; date?: string; onClose: () => void }) {
  const { state, actions } = useStore();
  const { toast } = useFeedback();
  const existing = id ? state.events.find((e) => e.id === id) : undefined;
  const timed = (v: Values) => v.when !== 'allday';
  const allDay = (v: Values) => v.when === 'allday';
  const repeats = (v: Values) => !!v.repeat && v.repeat !== 'none';
  const fields: FieldDef[] = [
    { name: 'title', label: 'What', required: true, maxLength: 120, placeholder: 'e.g. Dinner with friends' },
    { name: 'whose', label: 'Whose', type: 'select', required: true, options: [{ value: 'both', label: 'Both of us' }, ...MEMBER_IDS.map((m) => ({ value: m, label: MEMBERS[m].name }))] },
    { name: 'date', label: 'Date', type: 'date', required: true },
    { name: 'when', label: 'Time', type: 'select', required: true, options: [{ value: 'timed', label: 'At a set time' }, { value: 'allday', label: 'All day' }] },
    { name: 'startTime', label: 'Starts', type: 'time', required: true, showIf: timed, validate: (v, all) => (all.when !== 'allday' && !v ? 'Add a start time, or choose All day' : undefined) },
    { name: 'endTime', label: 'Ends', type: 'time', showIf: timed, validate: (v, all) => (v && all.startTime && v <= all.startTime ? 'Ends before it starts' : undefined) },
    { name: 'endDate', label: 'Last day', type: 'date', showIf: allDay, hint: 'For something that spans several days, like a trip.', validate: (v, all) => (v && all.date && v < all.date ? 'Ends before it starts' : undefined) },
    { name: 'location', label: 'Where', maxLength: 200, placeholder: 'Address or place' },
    {
      name: 'repeat', label: 'Repeats', type: 'select',
      options: [{ value: 'none', label: 'Doesn’t repeat' }, { value: 'week', label: 'Every week' }, { value: 'month', label: 'Every month' }, { value: 'year', label: 'Every year' }, { value: 'day', label: 'Every day' }],
      hint: existing?.repeat ? 'Changes here apply to every repeat. To change just one day, remove that day from the event’s page and add it again.' : undefined,
    },
    { name: 'every', label: 'How often', type: 'number', min: 1, max: 99, showIf: repeats, hint: '1 = every time, 2 = every other, and so on.' },
    { name: 'until', label: 'Until', type: 'date', showIf: repeats, hint: 'Leave blank to keep repeating.', validate: (v, all) => (v && all.date && v < all.date ? 'Ends before the first day' : undefined) },
    { name: 'notes', label: 'Notes', type: 'textarea', maxLength: 1000 },
  ];
  const initial: Values = existing
    ? {
        title: existing.title, whose: existing.whose, date: existing.date, when: existing.startTime ? 'timed' : 'allday', startTime: existing.startTime ?? '', endTime: existing.endTime ?? '',
        endDate: existing.endDate ?? '', location: existing.location, repeat: existing.repeat?.unit ?? 'none', every: String(existing.repeat?.every ?? 1), until: existing.repeat?.until ?? '', notes: existing.notes,
      }
    : { title: '', whose: 'both', date: date ?? todayIn(), when: 'timed', startTime: '', endTime: '', endDate: '', location: '', repeat: 'none', every: '1', until: '', notes: '' };
  return (
    <FormSheet
      title={existing ? 'Edit event' : 'New event'}
      fields={fields}
      initial={initial}
      submitLabel={existing ? 'Save changes' : 'Add event'}
      note={SHARED}
      onClose={onClose}
      extraAction={existing && <TrashButton id={existing.id} what={`“${existing.title}”`} after={routes.calendar} onClose={onClose} />}
      onSubmit={async (v) => {
        const isTimed = v.when !== 'allday';
        const repeat: EventRepeat | undefined =
          v.repeat && v.repeat !== 'none' ? { every: Number(v.every || '1'), unit: v.repeat as EventRepeat['unit'], ...(v.until ? { until: v.until } : {}) } : undefined;
        const r = await actions.saveEvent(existing?.id ?? null, {
          title: v.title ?? '', whose: (v.whose as Assignee) || 'both', date: v.date ?? '', location: v.location ?? '', notes: v.notes ?? '', repeat,
          ...(isTimed ? { startTime: v.startTime || undefined, endTime: v.endTime || undefined } : { endDate: v.endDate || undefined }),
        });
        if (r.ok) {
          toast(existing ? 'Event saved.' : 'Event added.');
          if (!existing) navigate(routes.event(r.value));
        }
        return done(r);
      }}
    />
  );
}
