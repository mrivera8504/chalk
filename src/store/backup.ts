import { readRoster, writeRoster, type RosterEntry } from '../domain/roster';
import {
  readFormations,
  readFoundationId,
  writeFormations,
  writeFoundationId,
} from '../domain/presets/formations';
import { readCustomRoutes, writeCustomRoutes, type CustomRoute } from '../domain/presets/routes';
import type { Formation, Play, Section } from '../domain/types';
import { DEFAULT_APP_SETTINGS, getSettings, setSettings, type AppSettings } from './settings';
import type { Playbook } from './sync';

/**
 * Everything this app knows, in one file.
 *
 * The anonymous account lives in this browser's storage, so clearing site data
 * orphans the playbook with nothing to sign back in as. That is the whole
 * reason this exists, and it is also why it cannot stop at the plays: the
 * formations, the routes drawn by hand, the team sheet and the league rules are
 * all in local storage too, and a backup that quietly left them behind would
 * only look like one until the day it was needed.
 */
export const BACKUP_KIND = 'chalk-backup';
export const BACKUP_VERSION = 1;

export interface Backup {
  kind: typeof BACKUP_KIND;
  version: number;
  exportedAt: number;
  plays: Play[];
  sections: Section[];
  formations: Formation[];
  routes: CustomRoute[];
  roster: RosterEntry[];
  settings: AppSettings;
  foundationId: string | null;
}

export function makeBackup(book: Playbook): Backup {
  return {
    kind: BACKUP_KIND,
    version: BACKUP_VERSION,
    exportedAt: Date.now(),
    plays: book.plays,
    sections: book.sections,
    // Built-ins are not written out: they ship with the app, and a restore onto
    // a later build should get that build's set rather than a frozen copy.
    formations: readFormations().filter((f) => !f.builtIn),
    routes: readCustomRoutes(),
    roster: readRoster(),
    settings: getSettings(),
    foundationId: readFoundationId(),
  };
}

export interface Restored {
  book: Playbook;
  counts: { plays: number; sections: number; formations: number; routes: number; roster: number };
}

/**
 * Read a backup file and put everything except the playbook straight back.
 *
 * The playbook itself is handed to the caller rather than written here, because
 * it lives in React state that a direct write to local storage would not reach
 * — the next autosave would overwrite the restored file with what was on screen
 * a moment ago.
 *
 * Throws with something a coach can read. A restore that silently did nothing,
 * on the one file standing between them and a lost season, is the worst
 * possible failure here.
 */
export function readBackup(text: string): Restored {
  let parsed: Partial<Backup>;
  try {
    parsed = JSON.parse(text) as Partial<Backup>;
  } catch {
    throw new Error('That file is not readable. It should be a .json written by Chalk.');
  }

  if (!parsed || typeof parsed !== 'object' || !Array.isArray(parsed.plays)) {
    throw new Error('That file has no plays in it. Pick the backup Chalk wrote.');
  }
  if (parsed.version !== undefined && Number(parsed.version) > BACKUP_VERSION) {
    throw new Error('That backup came from a newer Chalk than this one. Update, then restore.');
  }

  const plays = parsed.plays as Play[];
  const sections = Array.isArray(parsed.sections) ? (parsed.sections as Section[]) : [];
  const formations = Array.isArray(parsed.formations) ? (parsed.formations as Formation[]) : [];
  const routes = Array.isArray(parsed.routes) ? (parsed.routes as CustomRoute[]) : [];
  const roster = Array.isArray(parsed.roster) ? (parsed.roster as RosterEntry[]) : [];

  writeFormations(formations);
  writeCustomRoutes(routes);
  writeRoster(roster);
  writeFoundationId(typeof parsed.foundationId === 'string' ? parsed.foundationId : null);
  // Merged over the defaults, so a backup written before a setting existed
  // restores with that setting at its default rather than undefined.
  if (parsed.settings && typeof parsed.settings === 'object') {
    setSettings({ ...DEFAULT_APP_SETTINGS, ...parsed.settings });
  }

  return {
    book: { plays, sections },
    counts: {
      plays: plays.length,
      sections: sections.length,
      formations: formations.length,
      routes: routes.length,
      roster: roster.length,
    },
  };
}
