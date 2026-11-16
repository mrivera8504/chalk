import { readDepth, readSetCharts, writeDepth, writeSetCharts } from '../domain/depth';
import { readFormations, writeFormations } from '../domain/presets/formations';
import { readCustomRoutes, writeCustomRoutes } from '../domain/presets/routes';
import { readRoster, writeRoster } from '../domain/roster';
import { DEFAULT_SETTINGS, type Formation } from '../domain/types';
import { quietly, readKitMeta, writeKitMeta, type KitList, type ListMeta } from './kitMeta';
import { RULE_KEYS, getSettings, setSettings } from './settings';
import { explain, type SyncState } from './sync';

/**
 * The team's kit in the cloud: `/teams/{teamId}/kit/{item}`.
 *
 * So a coach's second device has the roster, the saved fronts and formations,
 * the hand-drawn routes, the league rules and the depth chart, and not only
 * the plays. See `kitMeta.ts` for how each item merges and why an empty list
 * on a new tablet can never empty a full one.
 *
 * Only the coach's own team. Local storage holds one roster, one list of
 * formations, one set of rules per device; merging a head coach's kit into an
 * assistant's own would be the cross-team merge the team book was built to
 * avoid. A joined team's kit is readable under the rules for the day it gets a
 * per-team local copy of its own.
 */

type Fs = typeof import('firebase/firestore');
async function open(): Promise<{ fs: Fs; db: import('firebase/firestore').Firestore }> {
  const { db } = await import('../firebase');
  const fs = await import('firebase/firestore');
  return { fs, db };
}

interface CloudList<T> {
  items: T[];
  stamps: Record<string, number>;
  deleted: Record<string, number>;
}

/**
 * Two copies of a list, item by item.
 *
 * Union by id; where both hold an item, the newer stamp wins, and the cloud's
 * on a tie (both unstamped means both are the copy from before syncing, and
 * either is right). A deletion takes an item out only if it is at least as new
 * as the copy that would otherwise be kept — so an edit after a delete on
 * another device brings the item back, as an edit after a delete of a play
 * does.
 */
export function mergeList<T extends { id: string }>(
  mine: T[],
  myMeta: ListMeta,
  theirs: CloudList<T> | null,
): { items: T[]; meta: ListMeta } {
  const t = theirs ?? { items: [], stamps: {}, deleted: {} };
  const stamps: Record<string, number> = {};
  const deleted: Record<string, number> = { ...t.deleted };
  for (const [id, at] of Object.entries(myMeta.deleted)) deleted[id] = Math.max(deleted[id] ?? 0, at);

  const pick = new Map<string, T>();
  for (const x of t.items) {
    if (!x?.id) continue;
    pick.set(x.id, x);
    stamps[x.id] = t.stamps[x.id] ?? 0;
  }
  for (const x of mine) {
    if (!x?.id) continue;
    const at = myMeta.stamps[x.id] ?? 0;
    if (!pick.has(x.id) || at > (stamps[x.id] ?? 0)) {
      pick.set(x.id, x);
      stamps[x.id] = at;
    }
  }
  const items: T[] = [];
  for (const [id, x] of pick) {
    if ((deleted[id] ?? -1) >= stamps[id]) {
      delete stamps[id];
      continue;
    }
    delete deleted[id];
    items.push(x);
  }
  return { items, meta: { stamps, deleted } };
}

const same = (a: unknown, b: unknown) => JSON.stringify(a) === JSON.stringify(b);

type ListSpec<T> = { read: () => T[]; write: (all: T[]) => void };

const LISTS: Record<KitList, ListSpec<{ id: string }>> = {
  roster: { read: readRoster, write: (all) => writeRoster(all as ReturnType<typeof readRoster>) },
  formations: {
    read: () => readFormations().filter((f) => !f.builtIn),
    // Built-ins are code, never stored; writeFormations drops them anyway.
    write: (all) => writeFormations(all as Formation[]),
  },
  routes: { read: readCustomRoutes, write: (all) => writeCustomRoutes(all as ReturnType<typeof readCustomRoutes>) },
};

/** The rules as one object, and how sure this device is of them. */
function localRules() {
  const s = getSettings();
  return Object.fromEntries(RULE_KEYS.map((k) => [k, s[k]])) as Record<(typeof RULE_KEYS)[number], unknown>;
}

/**
 * A whole item's stamp on this device. Edits from before the kit synced have
 * none, so anything that is not the default counts as edited at some point
 * (1), and the default counts as never (-1): a fresh tablet's defaults must
 * lose to a real device's rules even when neither has a stamp.
 */
function localAt(item: 'rules' | 'depth', isDefault: boolean): number {
  return readKitMeta().at[item] ?? (isDefault ? -1 : 1);
}

/** Bring the kit and the team's cloud copy into line. Push only what moved. */
export async function syncKit(teamId: string): Promise<SyncState> {
  try {
    const { fs, db } = await open();
    const kit = fs.collection(fs.doc(db, 'teams', teamId), 'kit');
    const meta = readKitMeta();
    const now = Date.now();

    for (const item of Object.keys(LISTS) as KitList[]) {
      const spec = LISTS[item];
      const ref = fs.doc(kit, item);
      const snap = await fs.getDoc(ref);
      const cloud = snap.exists() ? (snap.data() as CloudList<{ id: string }>) : null;
      const local = spec.read();
      const merged = mergeList(local, meta[item], cloud);
      if (!same(merged.items, local)) quietly(() => spec.write(merged.items));
      meta[item] = merged.meta;
      const out = { items: merged.items, stamps: merged.meta.stamps, deleted: merged.meta.deleted };
      if (!cloud || !same(out, { items: cloud.items, stamps: cloud.stamps, deleted: cloud.deleted })) {
        await fs.setDoc(ref, { ...out, updatedAt: now });
      }
    }

    // The league rules: one object, newer edit wins.
    {
      const ref = fs.doc(kit, 'rules');
      const snap = await fs.getDoc(ref);
      const cloud = snap.exists() ? (snap.data() as { value: Record<string, unknown>; at: number }) : null;
      const mine = localRules();
      const isDefault = RULE_KEYS.every((k) => mine[k] === (DEFAULT_SETTINGS as unknown as Record<string, unknown>)[k]);
      const at = localAt('rules', isDefault);
      if (cloud && cloud.at > at) {
        if (!same(cloud.value, mine)) quietly(() => setSettings(cloud.value as Partial<ReturnType<typeof getSettings>>));
        meta.at.rules = cloud.at;
      } else if (!cloud || !same(cloud.value, mine) || cloud.at !== at) {
        await fs.setDoc(ref, { value: mine, at, updatedAt: now });
      }
    }

    // The depth chart, base and per set together: one object, newer edit wins.
    {
      const ref = fs.doc(kit, 'depth');
      const snap = await fs.getDoc(ref);
      const cloud = snap.exists()
        ? (snap.data() as { value: { base: Record<string, number[]>; sets: Record<string, Record<string, number[]>> }; at: number })
        : null;
      const mine = { base: readDepth(), sets: readSetCharts() };
      const at = localAt('depth', !Object.keys(mine.base).length && !Object.keys(mine.sets).length);
      if (cloud && cloud.at > at) {
        if (!same(cloud.value, mine)) {
          quietly(() => {
            writeDepth(cloud.value.base ?? {});
            writeSetCharts(cloud.value.sets ?? {});
          });
        }
        meta.at.depth = cloud.at;
      } else if (!cloud || !same(cloud.value, mine) || cloud.at !== at) {
        await fs.setDoc(ref, { value: mine, at, updatedAt: now });
      }
    }

    // Merged with what is on disk now, not written over it: an edit made while
    // this was in the air has stamped the store's meta, and that stamp is newer.
    const fresh = readKitMeta();
    for (const item of Object.keys(LISTS) as KitList[]) {
      for (const key of ['stamps', 'deleted'] as const) {
        for (const [id, t] of Object.entries(fresh[item][key])) {
          if (t > (meta[item][key][id] ?? -Infinity)) meta[item][key][id] = t;
        }
      }
    }
    for (const k of ['rules', 'depth'] as const) {
      if ((fresh.at[k] ?? -Infinity) > (meta.at[k] ?? -Infinity)) meta.at[k] = fresh.at[k];
    }
    writeKitMeta(meta);
    return 'synced';
  } catch (err) {
    return explain(err);
  }
}
