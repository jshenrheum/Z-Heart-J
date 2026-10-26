import { createContext, useCallback, useContext, useMemo, useState, type ReactNode } from 'react';
import { HOME_TEMPLATE_LABEL, MEMBER_IDS, MEMBERS, type Assignee, type HomeTemplate, type MemberId, type Plan } from '../data/types.ts';
import { useStore } from '../data/store.tsx';
import { useFeedback } from '../lib/feedback.tsx';
import { navigate } from '../lib/router.tsx';
import { routes } from '../lib/routes.ts';
import type { RecurrenceMode, RecurrenceUnit } from '../lib/recurrence.ts';
import { Icon } from './Icon.tsx';
import { FormSheet, type FieldDef, type Values } from './FormSheet.tsx';

/** All "add / edit" forms, opened from anywhere via useForms(). */

export type FormRequest =
  | { kind: 'task'; prefill?: Partial<Values> }
  | { kind: 'contact'; id?: string }
  | { kind: 'home'; id: string }
  | { kind: 'info'; title?: string }
  | { kind: 'location'; owner: MemberId; id?: string }
  | { kind: 'list' }
  | { kind: 'plan' }
  | { kind: 'item'; listId: string; itemId: string };

const FormsCtx = createContext<{ open: (r: FormRequest) => void } | null>(null);
export const useForms = () => {
  const v = useContext(FormsCtx);
  if (!v) throw new Error('FormsProvider missing');
  return v;
};

const SHARED = 'Information you save here is shared with both of you.';

export function FormsProvider({ children }: { children: ReactNode }) {
  const [req, setReq] = useState<FormRequest | null>(null);
  const open = useCallback((r: FormRequest) => setReq(r), []);
  const close = useCallback(() => setReq(null), []);
  const api = useMemo(() => ({ open }), [open]);
  return (
    <FormsCtx.Provider value={api}>
      {children}
      {req?.kind === 'task' && <TaskForm prefill={req.prefill} onClose={close} />}
      {req?.kind === 'contact' && <ContactForm id={req.id} onClose={close} />}
      {req?.kind === 'home' && <HomeRecordForm id={req.id} onClose={close} />}
      {req?.kind === 'info' && <InfoForm title={req.title} onClose={close} />}
      {req?.kind === 'location' && <LocationForm owner={req.owner} id={req.id} onClose={close} />}
      {req?.kind === 'list' && <ListForm onClose={close} />}
      {req?.kind === 'plan' && <PlanForm onClose={close} />}
      {req?.kind === 'item' && <ItemForm listId={req.listId} itemId={req.itemId} onClose={close} />}
    </FormsCtx.Provider>
  );
}

// ------------------------------------------------------------------ task

function TaskForm({ prefill, onClose }: { prefill?: Partial<Values>; onClose: () => void }) {
  const { state, actions } = useStore();
  const { toast } = useFeedback();
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
      options: [{ value: '', label: 'No, just a household task' }, ...state.plans.filter((p: Plan) => p.status === 'active').map((p) => ({ value: p.id, label: p.title }))],
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
    { name: 'notes', label: 'Notes', type: 'textarea' },
  ];
  // The schedule model needs a due date to anchor to.
  const withRule = fields.map((f) => (f.name === 'due' ? { ...f, validate: (_: string, all: Values) => (all.repeat === 'schedule' && !all.planId && !all.due ? 'Add a due date to repeat on a schedule' : undefined) } : f));
  const initial: Values = { title: '', assignee: 'both', due: '', planId: '', repeat: 'none', every: '1', unit: 'month', notes: '', ...prefill };
  return (
    <FormSheet
      title="New task"
      fields={withRule}
      initial={initial}
      submitLabel="Add task"
      note={SHARED}
      onClose={onClose}
      onSubmit={async (v) => {
        const standalone = !v.planId;
        const ok = await actions.addTask({
          title: v.title ?? '',
          assignee: (v.assignee as Assignee) || 'both',
          due: v.due || undefined,
          planId: v.planId || undefined,
          notes: v.notes ?? '',
          recurrence: standalone && v.repeat && v.repeat !== 'none' ? { mode: v.repeat as RecurrenceMode, every: Number(v.every || '1'), unit: (v.unit as RecurrenceUnit) || 'month' } : undefined,
        });
        if (ok) toast('Task added.');
        return ok;
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
      onSubmit={async (v) => {
        const saved = await actions.saveContact(existing?.id ?? null, { name: v.name ?? '', category: v.category ?? '', role: v.role ?? '', phone: v.phone ?? '', fax: v.fax ?? '', email: v.email ?? '', address: v.address ?? '', website: v.website ?? '', note: v.note ?? '' });
        if (saved) {
          toast(existing ? 'Contact saved.' : 'Contact added.');
          if (!existing) navigate(routes.record(saved));
        }
        return saved !== null;
      }}
    />
  );
}

/** Edits a home reference card. Protected fields are never editable here (they use the protected-field path in Stage 2). */
function HomeRecordForm({ id, onClose }: { id: string; onClose: () => void }) {
  const { state, actions } = useStore();
  const { toast } = useFeedback();
  const rec = state.home.find((r) => r.id === id);
  if (!rec) return null;
  const ordinary = rec.fields.map((f, i) => ({ f, i })).filter(({ f }) => !f.protected);
  const typeOf = (k: string): FieldDef['type'] => (k === 'phone' || k === 'fax' ? 'tel' : k === 'email' ? 'email' : k === 'url' ? 'url' : 'text');
  const fields: FieldDef[] = [
    { name: 'title', label: 'Title', required: true, maxLength: 100 },
    ...ordinary.map(({ f, i }): FieldDef => ({ name: `f${i}`, label: f.label, type: typeOf(f.kind), maxLength: 300 })),
    { name: 'notes', label: 'Notes', type: 'textarea' },
  ];
  const initial: Values = { title: rec.title, notes: rec.notes };
  for (const { f, i } of ordinary) initial[`f${i}`] = f.value ?? '';
  const protectedCount = rec.fields.length - ordinary.length;
  return (
    <FormSheet
      title={`Edit ${rec.title}`}
      fields={fields}
      initial={initial}
      submitLabel="Save changes"
      note={`${SHARED}${protectedCount ? ' Protected fields are managed separately and aren’t shown here.' : ''}`}
      onClose={onClose}
      onSubmit={async (v) => {
        const nextFields = rec.fields.map((f, i) => (f.protected ? f : { ...f, value: v[`f${i}`] ?? '' })).filter((f) => f.protected || f.value);
        const ok = await actions.saveHomeRecord(rec.id, { title: v.title ?? rec.title, notes: v.notes ?? '', fields: nextFields });
        if (ok) toast('Saved.');
        return ok;
      }}
    />
  );
}

// ------------------------------------------------------------------ other information

function InfoForm({ title, onClose }: { title?: string; onClose: () => void }) {
  const { actions } = useStore();
  const { toast } = useFeedback();
  const fields: FieldDef[] = [
    { name: 'title', label: 'Title', required: true, maxLength: 100, placeholder: 'e.g. Trash pickup days' },
    { name: 'template', label: 'Category', type: 'select', options: (Object.keys(HOME_TEMPLATE_LABEL) as HomeTemplate[]).map((t) => ({ value: t, label: HOME_TEMPLATE_LABEL[t] })).sort((a, b) => (a.value === 'other' ? -1 : b.value === 'other' ? 1 : 0)) },
    { name: 'details', label: 'Details', type: 'textarea', hint: 'Passwords, recovery codes, and bank logins belong in your password manager — name the entry here instead.' },
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
        const id = await actions.addInfo({ template: (v.template as HomeTemplate) || 'other', title: v.title ?? '', details: v.details ?? '', notes: '' });
        if (id) {
          toast('Saved to Home.');
          navigate(routes.record(id));
        }
        return id !== null;
      }}
    />
  );
}

// ------------------------------------------------------------------ work location

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
      onSubmit={async (v) => {
        const saved = await actions.saveLocation(existing?.id ?? null, owner, {
          label: v.label ?? '', organization: v.organization ?? '', address: v.address ?? '', mainPhone: v.mainPhone ?? '', directPhone: v.directPhone ?? '',
          fax: v.fax ?? '', schedulingPhone: v.schedulingPhone ?? '', notes: v.notes ?? '',
        });
        if (saved) {
          toast(existing ? 'Location saved.' : 'Location added.');
          if (!existing) navigate(routes.record(saved));
        }
        return saved !== null;
      }}
    />
  );
}

// ------------------------------------------------------------------ list / plan / item

function ListForm({ onClose }: { onClose: () => void }) {
  const { actions } = useStore();
  const fields: FieldDef[] = [
    { name: 'title', label: 'List name', required: true, maxLength: 80, placeholder: 'e.g. Packing, Hardware store' },
    { name: 'description', label: 'Description', maxLength: 200 },
  ];
  return (
    <FormSheet
      title="New list"
      fields={fields}
      initial={{ title: '', description: '' }}
      submitLabel="Create list"
      note={SHARED}
      onClose={onClose}
      onSubmit={async (v) => {
        const id = await actions.newList(v.title ?? '', v.description ?? '');
        if (id) navigate(routes.list(id));
        return id !== null;
      }}
    />
  );
}

function PlanForm({ onClose }: { onClose: () => void }) {
  const { actions } = useStore();
  const { toast } = useFeedback();
  const fields: FieldDef[] = [
    { name: 'title', label: 'Plan name', required: true, maxLength: 100 },
    { name: 'template', label: 'Type', type: 'select', options: [{ value: 'home', label: 'Home project' }, { value: 'travel', label: 'Travel' }, { value: 'wedding', label: 'Wedding' }, { value: 'custom', label: 'Custom' }] },
    { name: 'description', label: 'Description', type: 'textarea' },
    { name: 'target', label: 'Target date', type: 'date' },
  ];
  return (
    <FormSheet
      title="New plan"
      fields={fields}
      initial={{ title: '', template: 'home', description: '', target: '' }}
      submitLabel="Create plan"
      note={SHARED}
      onClose={onClose}
      onSubmit={async (v) => {
        const id = await actions.addPlan({ title: v.title ?? '', description: v.description ?? '', target: v.target || undefined, template: (v.template as Plan['template']) || 'custom' });
        if (id) {
          toast('Plan created.');
          navigate(routes.plan(id));
        }
        return id !== null;
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
      onSubmit={(v) => actions.editItem(listId, itemId, { name: v.name ?? '', qty: v.qty ?? '', note: v.note ?? '' })}
    />
  );
}
