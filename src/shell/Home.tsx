import { playSurface, type Book, type Play } from '../domain/types';
import { viewForPlays } from '../export/view';
import { PlayPicture } from '../render/PlayPicture';
import { anyVariant, sportOf } from '../sports';
import { boardVars, useSettings } from '../store/settings';
import type { SyncState } from '../store/sync';
import type { JoinedTeam } from '../store/teams';
import type { OpenTeam } from '../store/useTeams';
import { go } from '../ui/route';
import { PageHead } from './AppShell';
import { SYNC_LABEL } from '../playbook/PlaybookList';

interface Props {
  /** The playbooks of whichever team is showing, and how many live plays each holds. */
  books: Book[];
  everyPlay: Play[];
  bookOf: (p: Play) => string;
  onOpenBook: (id: string) => void;
  /** The coach's own team, and the others they are on. */
  team: OpenTeam | null;
  joined: JoinedTeam[];
  onOpenTeam: (t: OpenTeam | null) => void;
  sync: SyncState;
  lastBackupAt: number | null;
}

const RECENT = 6;
const title = (p: Play) => p.name || p.suggestedName || 'Untitled';

/**
 * Where everything is, in one look: the playbooks, the teams, the plays
 * touched last, and whether the cloud and the backup are where they should be.
 *
 * Not where the app opens — that is still the playbook, because opening the
 * app is nearly always opening it to a play, and an installed app that starts
 * somewhere new is one a coach has to relearn. This is the tab to come to when
 * the question is "which book was that in".
 */
export function Home({
  books,
  everyPlay,
  bookOf,
  onOpenBook,
  team,
  joined,
  onOpenTeam,
  sync,
  lastBackupAt,
}: Props) {
  const settings = useSettings();
  const recent = [...everyPlay].sort((a, b) => b.updatedAt - a.updatedAt).slice(0, RECENT);
  const count = (id: string) => everyPlay.filter((p) => bookOf(p) === id).length;
  const days = lastBackupAt === null ? null : Math.floor((Date.now() - lastBackupAt) / 86_400_000);

  return (
    <div className="page home">
      <PageHead
        title={team ? team.name : 'Home'}
        sub={
          <>
            <span className="sync">{SYNC_LABEL[sync]}</span>
            {!team && (
              <span className={`backup-age${days === null || days >= 14 ? ' stale' : ''}`}>
                {days === null ? 'never backed up' : days === 0 ? 'backed up today' : `last backup ${days}d ago`}
              </span>
            )}
          </>
        }
      />

      <section className="home-group">
        <h2>Playbooks</h2>
        <div className="home-list">
          {books.map((b) => (
            <button
              key={b.id}
              className="home-row"
              onClick={() => {
                onOpenBook(b.id);
                go({ screen: 'book' });
              }}
            >
              <strong>{b.name}</strong>
              <span>
                {sportOf(b.variant).name} · {anyVariant(b.variant).name} · {count(b.id)}{' '}
                {count(b.id) === 1 ? 'play' : 'plays'}
              </span>
            </button>
          ))}
        </div>
      </section>

      {joined.length > 0 && (
        <section className="home-group">
          <h2>Teams</h2>
          <div className="home-list">
            <button className="home-row" aria-pressed={!team} onClick={() => onOpenTeam(null)}>
              <strong>Your own playbook</strong>
              <span>{team ? 'Switch back' : 'Showing'}</span>
            </button>
            {joined.map((t) => (
              <button
                key={t.teamId}
                className="home-row"
                aria-pressed={team?.teamId === t.teamId}
                onClick={() => onOpenTeam({ teamId: t.teamId, name: t.name, role: t.role })}
              >
                <strong>{t.name}</strong>
                <span>{t.role === 'viewer' ? 'Following' : 'Coaching'}</span>
              </button>
            ))}
          </div>
        </section>
      )}

      {recent.length > 0 && (
        <section className="home-group">
          <h2>Recent plays</h2>
          <div className="home-recent">
            {recent.map((p) => (
              <button key={p.id} className="home-play" onClick={() => go({ screen: 'play', id: p.id })}>
                <span className="home-thumb" style={boardVars(playSurface(p, settings.fieldSurface))}>
                  <PlayPicture play={p} view={viewForPlays([p], 4 / 3)} showDefense={settings.showDefense} />
                </span>
                <strong>{title(p)}</strong>
              </button>
            ))}
          </div>
        </section>
      )}
    </div>
  );
}
