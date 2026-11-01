import type { ListItem, SharedList } from '../data/types.ts';

const norm = (s: string) => s.trim().toLowerCase();
const words = (s: string) => norm(s).split(/[^\p{L}\p{N}]+/u).filter(Boolean);

/** A Recipes list reads differently: its items are recipes you make, not things you get. */
export const isRecipes = (title: string) => /recipe/i.test(title);
/** Shopping lists keep "To get" and "I need…"; any other list (a to-do list, packing) just says List. */
export const isShopping = (title: string) => /grocer|shopping|store|market|costco|target|pharmacy|errand/i.test(title);

/** The words a list page uses, by what kind of list it is. */
export function listWords(title: string) {
  if (isRecipes(title)) {
    return { open: 'To make', recent: 'Made recently', hint: 'Tick a recipe once you’ve made it. Tap its name for the ingredients and method.', empty: 'No recipes yet.', emptyBody: 'Type a recipe’s name in the field below, then tap it to add the ingredients and method.', allDone: 'Everything’s been made. Open Made recently to put a recipe back.', placeholder: 'Add a recipe…', clear: 'Clear made recently' };
  }
  if (isShopping(title)) {
    return { open: 'To get', recent: 'Recently used', hint: 'Tick an item once you have it. Tap its name for details.', empty: 'Nothing on this list yet.', emptyBody: 'Type what you need in the field below, and tick it once you have it.', allDone: 'Everything’s checked off. Open Recently used to put things back.', placeholder: 'I need…', clear: 'Clear recently used' };
  }
  return { open: 'List', recent: 'Done', hint: 'Tick an item once it’s done. Tap its name for details.', empty: 'Nothing on this list yet.', emptyBody: 'Type an item in the field below, and tick it once it’s done.', allDone: 'Everything’s done. Open Done to bring something back.', placeholder: 'Add an item…', clear: 'Clear done' };
}

/** The second line of a tile: quantity and details. */
export const itemSub = (i: ListItem) => [i.qty, i.note.split('\n')[0]].filter(Boolean).join(' · ');

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
