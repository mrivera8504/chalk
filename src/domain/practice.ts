/**
 * A practice: a start time and a run of timed blocks, each with the drills
 * and plays it works on.
 *
 * Kept on the device beside the roster, and for the same reason: it describes
 * this team's week rather than any play, and the backup carries it out whole.
 * A block names its plays by id and never copies them, so a drill reworked on
 * Wednesday is the drill Thursday's sheet prints; a play deleted since is
 * simply left off.
 */
export interface PracticeBlock {
  id: string;
  title: string;
  minutes: number;
  playIds: string[];
}

export interface Practice {
  id: string;
  name: string;
  /** 24-hour "HH:MM", the clock the first block starts on. */
  startsAt: string;
  blocks: PracticeBlock[];
  updatedAt: number;
}

const KEY = 'chalk.practices.v1';

let counter = 0;
export const practiceId = (p: string) => `${p}${Date.now().toString(36)}${(counter++).toString(36)}`;

/** What a new practice opens with: the shape most youth practices take. */
export function newPractice(name = 'Practice'): Practice {
  const block = (title: string, minutes: number): PracticeBlock => ({
    id: practiceId('k'),
    title,
    minutes,
    playIds: [],
  });
  return {
    id: practiceId('pr'),
    name,
    startsAt: '17:30',
    blocks: [
      block('Warm-up', 10),
      block('Individual', 15),
      block('Group', 15),
      block('Team', 20),
      block('Conditioning', 5),
    ],
    updatedAt: Date.now(),
  };
}

export function readPractices(): Practice[] {
  try {
    const raw = localStorage.getItem(KEY);
    const all = raw ? (JSON.parse(raw) as Practice[]) : [];
    return Array.isArray(all) ? all.filter((p) => p && Array.isArray(p.blocks)) : [];
  } catch {
    return [];
  }
}

export function writePractices(all: Practice[]): void {
  try {
    localStorage.setItem(KEY, JSON.stringify(all));
  } catch {
    /* storage blocked; the session keeps working */
  }
}

function toMinutes(clock: string): number {
  const m = /^(\d{1,2}):(\d{2})$/.exec(clock);
  return m ? Number(m[1]) * 60 + Number(m[2]) : 0;
}

/** "5:45 PM" — how a time is written on a sheet taped to a clipboard. */
export function clockLabel(total: number): string {
  const day = ((total % 1440) + 1440) % 1440;
  const h = Math.floor(day / 60);
  const m = day % 60;
  return `${((h + 11) % 12) + 1}:${String(m).padStart(2, '0')} ${h < 12 ? 'AM' : 'PM'}`;
}

/** Each block with the clock it starts and ends on, in order. */
export function schedule(p: Practice): { block: PracticeBlock; start: string; end: string }[] {
  let at = toMinutes(p.startsAt);
  return p.blocks.map((block) => {
    const start = at;
    at += Math.max(0, block.minutes);
    return { block, start: clockLabel(start), end: clockLabel(at) };
  });
}

export function totalMinutes(p: Practice): number {
  return p.blocks.reduce((sum, b) => sum + Math.max(0, b.minutes), 0);
}
