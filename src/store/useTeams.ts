import { useCallback, useEffect, useState } from 'react';
import { forgetTeam, leaveTeam, listJoined, type JoinedTeam, type Result } from './teams';
import { dropTeamCopy } from './useTeamBook';

/**
 * Which team's playbook this device is showing, and which teams there are.
 *
 * `null` is the coach's own, which is what every device showed before teams
 * existed and what it shows until somebody joins one. Kept on the device, like
 * which playbook is open: the phone can be on the head coach's book while the
 * tablet is on the coach's own.
 *
 * The joined list is kept on the device too, per account, so the switcher
 * still names the teams with no signal. The cloud copy under the coach's uid
 * is the truth and replaces it whenever it can be read.
 */

const CURRENT_KEY = 'chalk.team.current.v1';
const joinedKey = (uid: string) => `chalk.teams.joined.${uid}`;

export interface OpenTeam {
  teamId: string;
  name: string;
}

function read<T>(key: string, fallback: T): T {
  try {
    const raw = localStorage.getItem(key);
    return raw ? (JSON.parse(raw) as T) : fallback;
  } catch {
    return fallback;
  }
}

function write(key: string, value: unknown): void {
  try {
    if (value === null) localStorage.removeItem(key);
    else localStorage.setItem(key, JSON.stringify(value));
  } catch {
    /* storage blocked; this session still knows */
  }
}

export function useTeams(uid: string | null) {
  const [open, setOpen] = useState<OpenTeam | null>(() => read<OpenTeam | null>(CURRENT_KEY, null));
  const [joined, setJoined] = useState<JoinedTeam[]>([]);

  const refresh = useCallback(async () => {
    if (!uid) return;
    const got: Result<JoinedTeam[]> = await listJoined(uid);
    if (!got.ok) return;
    setJoined(got.value);
    write(joinedKey(uid), got.value);
  }, [uid]);

  useEffect(() => {
    if (!uid) {
      setJoined([]);
      return;
    }
    setJoined(read<JoinedTeam[]>(joinedKey(uid), []));
    void refresh();
  }, [uid, refresh]);

  const openTeam = useCallback((team: OpenTeam | null) => {
    setOpen(team);
    write(CURRENT_KEY, team);
  }, []);

  /** After a join: on the list, and open. */
  const joinedOne = useCallback(
    (team: JoinedTeam) => {
      setJoined((prev) => [...prev.filter((t) => t.teamId !== team.teamId), team]);
      openTeam({ teamId: team.teamId, name: team.name });
      void refresh();
    },
    [openTeam, refresh],
  );

  const leave = useCallback(
    async (teamId: string): Promise<Result<null>> => {
      if (!uid) return { ok: false, reason: 'Sign in first.' };
      const done = await leaveTeam(uid, teamId);
      if (!done.ok) return done;
      if (open?.teamId === teamId) openTeam(null);
      setJoined((prev) => prev.filter((t) => t.teamId !== teamId));
      write(joinedKey(uid), joined.filter((t) => t.teamId !== teamId));
      dropTeamCopy(uid, teamId);
      return done;
    },
    [uid, open, openTeam, joined],
  );

  /**
   * The owner took this coach off, or the team is gone. Back to the coach's
   * own book. The device keeps its copy of the team's — anything drawn on it
   * and not yet sent is still there if they are let back on — but the team is
   * no longer offered.
   */
  const removed = useCallback(
    (teamId: string) => {
      if (open?.teamId === teamId) openTeam(null);
      setJoined((prev) => prev.filter((t) => t.teamId !== teamId));
      if (uid) void forgetTeam(uid, teamId);
    },
    [uid, open, openTeam],
  );

  return { open, joined, openTeam, joinedOne, leave, removed, refresh };
}
