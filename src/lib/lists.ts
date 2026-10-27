import type { ListItem, SharedList } from '../data/types.ts';

const norm = (s: string) => s.trim().toLowerCase();
const words = (s: string) => norm(s).split(/[^\p{L}\p{N}]+/u).filter(Boolean);

/** The second line of a tile: quantity and details. */
export const itemSub = (i: ListItem) => [i.qty, i.note].filter(Boolean).join(' · ');

/**
 * Recently used items whose name or details have a word starting with every word
 * typed ("ch" finds "Chicken thighs"; "shred" finds Cheese · Shredded), newest
 * first, one per name.
 */
export function recentMatches(list: SharedList, query: string, limit = 8): ListItem[] {
  const typed = words(query);
  if (typed.length === 0) return [];
  const q = norm(query);
  const seen = new Set<string>();
  const hits: ListItem[] = [];
  for (const i of [...list.items].filter((x) => x.checked).sort((a, b) => b.updatedAt.localeCompare(a.updatedAt))) {
    const key = norm(i.name);
    if (seen.has(key)) continue;
    const own = words(`${i.name} ${i.note}`);
    if (typed.every((t) => own.some((w) => w.startsWith(t)))) {
      seen.add(key);
      hits.push(i);
    }
  }
  // Names that begin with what was typed come first; otherwise newest first.
  return hits.sort((a, b) => Number(norm(b.name).startsWith(q)) - Number(norm(a.name).startsWith(q))).slice(0, limit);
}
