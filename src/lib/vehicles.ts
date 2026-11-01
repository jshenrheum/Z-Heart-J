import type { FieldKind, HomeRecord } from '../data/types.ts';

/**
 * A vehicle is a home card (template "vehicle") whose details use fixed field ids,
 * so the form can offer every category and the card can group them. Fields added
 * by hand (or protected ones) keep their own ids and show under "More".
 */
export type VehicleGroup = 'The car' | 'Registration' | 'Insurance' | 'Service';
export const VEHICLE_GROUPS: VehicleGroup[] = ['The car', 'Registration', 'Insurance', 'Service'];

export interface VehicleFieldSpec {
  id: string;
  label: string;
  kind: FieldKind;
  group: VehicleGroup;
  placeholder?: string;
  /** A date that belongs on the calendar. */
  due?: string;
}

export const VEHICLE_FIELDS: VehicleFieldSpec[] = [
  { id: 'v-driver', label: 'Driven by', kind: 'text', group: 'The car' },
  { id: 'v-make', label: 'Make', kind: 'text', group: 'The car', placeholder: 'e.g. Honda' },
  { id: 'v-model', label: 'Model', kind: 'text', group: 'The car', placeholder: 'e.g. Civic' },
  { id: 'v-year', label: 'Year', kind: 'text', group: 'The car', placeholder: 'e.g. 2021' },
  { id: 'v-color', label: 'Color', kind: 'text', group: 'The car' },
  { id: 'v-plate', label: 'License plate', kind: 'identifier', group: 'Registration' },
  { id: 'v-state', label: 'State', kind: 'text', group: 'Registration', placeholder: 'e.g. NY' },
  { id: 'v-vin', label: 'VIN', kind: 'identifier', group: 'Registration', placeholder: '17 characters, on the dashboard or door frame' },
  { id: 'v-reg', label: 'Registration renews', kind: 'date', group: 'Registration', due: 'Registration renews' },
  { id: 'v-inspect', label: 'Inspection due', kind: 'date', group: 'Registration', due: 'Inspection due' },
  { id: 'v-ins-co', label: 'Insurance company', kind: 'text', group: 'Insurance' },
  { id: 'v-ins-policy', label: 'Policy number', kind: 'identifier', group: 'Insurance' },
  { id: 'v-ins-phone', label: 'Insurance phone', kind: 'phone', group: 'Insurance' },
  { id: 'v-ins-renew', label: 'Policy renews', kind: 'date', group: 'Insurance', due: 'Insurance renews' },
  { id: 'v-roadside', label: 'Roadside assistance', kind: 'phone', group: 'Service' },
  { id: 'v-shop', label: 'Service shop', kind: 'text', group: 'Service' },
  { id: 'v-service', label: 'Next service due', kind: 'date', group: 'Service', due: 'Service due' },
  { id: 'v-tires', label: 'Tire pressure', kind: 'text', group: 'Service', placeholder: 'e.g. 35 psi front, 33 rear' },
  { id: 'v-oil', label: 'Oil type', kind: 'text', group: 'Service', placeholder: 'e.g. 0W-20 synthetic' },
];

const SPEC = new Map(VEHICLE_FIELDS.map((f) => [f.id, f]));
export const vehicleSpec = (fieldId: string) => SPEC.get(fieldId);

const value = (r: HomeRecord, id: string) => {
  const f = r.fields.find((x) => x.id === id);
  return f && !f.protected ? (f.value ?? '') : '';
};

/** "2021 Honda Civic · ABC 1234" — whatever of that is filled in. */
export function vehicleSummary(r: HomeRecord): string {
  const car = [value(r, 'v-year'), value(r, 'v-make'), value(r, 'v-model')].filter(Boolean).join(' ');
  return [car, value(r, 'v-plate')].filter(Boolean).join(' · ');
}

/** The vehicle's dated details, for the calendar and its card. */
export function vehicleDates(r: HomeRecord): Array<{ id: string; label: string; date: string }> {
  return VEHICLE_FIELDS.filter((s) => s.due)
    .map((s) => ({ id: s.id, label: s.due!, date: value(r, s.id) }))
    .filter((d) => /^\d{4}-\d{2}-\d{2}$/.test(d.date));
}
