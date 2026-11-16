import { useEffect, useState } from 'react';
import { askConfirm } from '../ui/dialog';
import { toast } from '../ui/toast';
import { useSettings } from '../store/settings';
import {
  INVITE_DAYS,
  createInvite,
  inviteUrl,
  listMembers,
  removeMember,
  type JoinedTeam,
  type Member,
} from '../store/teams';
import type { OpenTeam } from '../store/useTeams';

interface Props {
  uid: string | null;
  /** The team on screen; null is the coach's own. */
  open: OpenTeam | null;
  joined: JoinedTeam[];
  onOpen: (team: OpenTeam | null) => void;
  onLeave: (teamId: string) => Promise<{ ok: boolean; reason?: string }>;
  sendLink: (url: string, title: string) => Promise<void>;
}

/**
 * Who coaches on this playbook, and which playbook this device is showing.
 *
 * The owner invites with a link, the same way a play is shared, and takes a
 * coach off from here. A coach on somebody else's team sees who else is on it
 * and can leave. Switching teams is here rather than in the playbook's own
 * menu, because it is a much bigger step than switching playbooks: it changes
 * whose book every screen is showing.
 */
export function CoachesPanel({ uid, open, joined, onOpen, onLeave, sendLink }: Props) {
  const settings = useSettings();
  const teamId = open?.teamId ?? uid;
  const mine = !open;
  const [members, setMembers] = useState<Member[] | null>(null);
  const [problem, setProblem] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    let alive = true;
    setMembers(null);
    setProblem(null);
    if (!teamId) return;
    void listMembers(teamId).then((got) => {
      if (!alive) return;
      if (got.ok) setMembers(got.value);
      else setProblem(got.reason);
    });
    return () => {
      alive = false;
    };
  }, [teamId]);

  async function invite() {
    if (!uid || busy) return;
    setBusy(true);
    const made = await createInvite(uid, settings.teamName);
    setBusy(false);
    if (!made.ok) {
      setProblem(made.reason);
      return;
    }
    await sendLink(inviteUrl(made.value.code), `Coach with ${made.value.teamName} on Chalk`);
  }

  async function remove(m: Member) {
    if (!teamId) return;
    const ok = await askConfirm(`Take ${m.name} off the team?`, {
      body: 'They stop seeing this playbook straight away. Anything they drew on it stays in it.',
      confirmLabel: 'Take off',
      danger: true,
    });
    if (!ok) return;
    const done = await removeMember(teamId, m.uid);
    if (!done.ok) {
      setProblem(done.reason);
      return;
    }
    setMembers((prev) => prev?.filter((x) => x.uid !== m.uid) ?? null);
    toast(`${m.name} is off the team`);
  }

  async function leave(team: OpenTeam) {
    const ok = await askConfirm(`Leave ${team.name}?`, {
      body: 'Their playbook goes off this device. Your own playbook is not touched.',
      confirmLabel: 'Leave',
      danger: true,
    });
    if (!ok) return;
    const done = await onLeave(team.teamId);
    if (!done.ok) setProblem(done.reason ?? 'Could not leave the team.');
    else toast(`Left ${team.name}`);
  }

  if (!uid) {
    return (
      <div className="picker coaches-panel">
        <p className="picker-note">Waiting for the account. Coaching with others needs a connection the first time.</p>
      </div>
    );
  }

  const coaches = members?.filter((m) => m.role !== 'owner') ?? [];

  return (
    <div className="picker coaches-panel">
      <div className="picker-group">
        <h3>Showing</h3>
        <div className="coach-teams">
          <button aria-pressed={mine} onClick={() => onOpen(null)}>
            Your own playbook
          </button>
          {joined.map((t) => (
            <button
              key={t.teamId}
              aria-pressed={open?.teamId === t.teamId}
              onClick={() => onOpen({ teamId: t.teamId, name: t.name })}
            >
              {t.name}
            </button>
          ))}
        </div>
      </div>

      <div className="picker-group">
        <h3>{mine ? 'Coaches on your team' : `Coaches on ${open?.name}`}</h3>
        {members === null && !problem && <p className="picker-note">Asking the cloud…</p>}
        {members !== null && (
          <ul className="coach-list">
            {members.map((m) => (
              <li key={m.uid} className="coach-row">
                <span className="coach-name">
                  {m.uid === uid ? 'You' : m.name}
                  {m.role === 'owner' && <span className="coach-role">head coach</span>}
                </span>
                {mine && m.role !== 'owner' && (
                  <button className="quiet danger" onClick={() => void remove(m)}>
                    Take off
                  </button>
                )}
              </li>
            ))}
            {mine && coaches.length === 0 && <li className="picker-note">Nobody else yet.</li>}
          </ul>
        )}
        {mine ? (
          <>
            <button className="primary" disabled={busy} onClick={() => void invite()}>
              Invite a coach
            </button>
            <p className="picker-note">
              The link lets whoever opens it edit this playbook, for {INVITE_DAYS} days. Players do not
              need one — share a play with them instead.
            </p>
          </>
        ) : (
          open && (
            <button className="danger" onClick={() => void leave(open)}>
              Leave {open.name}
            </button>
          )
        )}
        {problem && <p className="picker-note bad">{problem}</p>}
      </div>
    </div>
  );
}
