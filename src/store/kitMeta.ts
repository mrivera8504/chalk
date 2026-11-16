/**
 * What changed in the team's kit on this device, and when.
 *
 * The kit is the roster, the saved formations, the hand-drawn routes, the
 * league rules and the depth chart: everything about a team that is not a
 * play. Each store writes its whole list to local storage, which is the floor
 * as ever; this module watches those writes so the kit can sync the way plays
 * do, item by item, without a store having to know there is a cloud.
 *
 * Two shapes. A **list** (roster, formations, routes) keeps a stamp per item
 * and a dated marker per deletion, so two devices merge by union and an empty
 * list on a new tablet removes nothing — the loss the notes warned about. A
 * **whole** item (rules, depth) is one object and the newer edit wins; a
 * device that has never edited it carries no stamp, so it never wins.
 *
 * Writes made by the sync itself are applied `quietly`, or every sync would
 * read as an edit and stamp the whole kit as new.
 */

export type KitList = 'roster' | 'formations' | 'routes';
export type KitWhole = 'rules' | 'depth';
export type KitItem = KitList | KitWhole;

export interface ListMeta {
  stamps: Record<string, number>;
  deleted: Record<string, number>;
}

export interface KitMeta {
  roster: ListMeta;
  formations: ListMeta;
  routes: ListMeta;
  /** When each whole item was last edited here; absent is never. */
  at: Partial<Record<KitWhole, number>>;
}

const KEY = 'chalk.kit.meta.v1';
const empty = (): ListMeta => ({ stamps: {}, deleted: {} });

export function readKitMeta(): KitMeta {
  try {
    const raw = JSON.parse(localStorage.getItem(KEY) ?? '{}') as Partial<KitMeta>;
    return {
      roster: { ...empty(), ...raw.roster },
      formations: { ...empty(), ...raw.formations },
      routes: { ...empty(), ...raw.routes },
      at: raw.at ?? {},
    };
  } catch {
    return { roster: empty(), formations: empty(), routes: empty(), at: {} };
  }
}

export function writeKitMeta(meta: KitMeta): void {
  try {
    localStorage.setItem(KEY, JSON.stringify(meta));
  } catch {
    /* worst case an edit syncs as though it were old */
  }
}

let applying = 0;
const listeners = new Set<() => void>();

/** Run a write that came from the cloud, so it is not taken for an edit. */
export function quietly(fn: () => void): void {
  applying++;
  try {
    fn();
  } finally {
    applying--;
  }
}

/** Hear about edits to the kit on this device. */
export function onKitChange(fn: () => void): () => void {
  listeners.add(fn);
  return () => listeners.delete(fn);
}

const emit = () => listeners.forEach((l) => l());

/** A list store is about to write `next` over `prev`. */
export function noteList<T extends { id: string }>(item: KitList, prev: T[], next: T[]): void {
  if (applying) return;
  const meta = readKitMeta();
  const m = meta[item];
  const now = Date.now();
  const before = new Map(prev.map((x) => [x.id, JSON.stringify(x)]));
  let moved = false;
  for (const x of next) {
    if (before.get(x.id) !== JSON.stringify(x)) {
      m.stamps[x.id] = now;
      delete m.deleted[x.id];
      moved = true;
    }
  }
  const kept = new Set(next.map((x) => x.id));
  for (const id of before.keys()) {
    if (!kept.has(id)) {
      m.deleted[id] = now;
      delete m.stamps[id];
      moved = true;
    }
  }
  if (!moved) return;
  writeKitMeta(meta);
  emit();
}

/** A whole item was edited here. */
export function noteWhole(item: KitWhole): void {
  if (applying) return;
  const meta = readKitMeta();
  meta.at[item] = Date.now();
  writeKitMeta(meta);
  emit();
}
