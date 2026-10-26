import type { Profile, WorkLocation } from '../data/types.ts';

/**
 * The public work summary is assembled from an explicit allowlist of ordinary
 * fields. It deliberately does not spread or iterate over the records, so a field
 * added to them later (or a protected value) can never leak into a copied summary.
 *
 *   [Display name]
 *   [Specialty]
 *   [Organization and location label]
 *   [Work address]
 *   Phone: [work phone]
 *   Fax: [work fax]
 *   NPI: [NPI]
 *
 * Empty fields are omitted.
 */
export function buildWorkSummary(profile: Profile, location: WorkLocation): string {
  const org = [location.organization || profile.organization, location.label].filter(Boolean).join(' — ');
  const lines: Array<string | undefined> = [
    profile.displayName,
    profile.specialty,
    org,
    location.address,
    location.mainPhone ? `Phone: ${location.mainPhone}` : undefined,
    location.fax ? `Fax: ${location.fax}` : undefined,
    profile.npi ? `NPI: ${profile.npi}` : undefined,
  ];
  return lines
    .map((l) => (l ?? '').trim())
    .filter(Boolean)
    .join('\n');
}

/** Digits and a leading + only — safe for tel: links. Fax numbers never use this. */
export function telHref(phone: string): string {
  const cleaned = phone.replace(/[^\d+]/g, '');
  return `tel:${cleaned}`;
}

export function directionsHref(address: string): string {
  return `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(address)}`;
}

/** http(s) only: no javascript:, data:, etc. Returns undefined when unusable. */
export function safeUrl(raw: string): string | undefined {
  const v = raw.trim();
  if (!v) return undefined;
  try {
    const u = new URL(/^[a-z][a-z0-9+.-]*:/i.test(v) ? v : `https://${v}`);
    return u.protocol === 'https:' || u.protocol === 'http:' ? u.toString() : undefined;
  } catch {
    return undefined;
  }
}
