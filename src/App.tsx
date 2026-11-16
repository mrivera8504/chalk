import { useCallback, useEffect, useState } from 'react';
import { PlayEditor } from './editor/PlayEditor';
import { UNFILED_SECTION, bookOf, type Side } from './domain/types';
import { PlaybookList } from './playbook/PlaybookList';
import { blankPlay, usePlaybook } from './store/usePlaybook';
import { DialogHost } from './ui/DialogHost';
import { UpdateBar } from './ui/UpdateBar';
import { useBackLayer } from './ui/backstack';
import { toast } from './ui/toast';
import { ToastHost } from './ui/ToastHost';
import { go, useRoute } from './ui/route';
import { AppShell } from './shell/AppShell';
import { PrintPage, SettingsPage, TeamPage } from './shell/pages';
import { Welcome, markWelcomed, wasWelcomed } from './shell/Welcome';
import { GameDay } from './shell/GameDay';
import { Home } from './shell/Home';
import { publishShare, revokeShare, shareUrl, takeHandOver } from './store/share';
import { newId } from './store/usePlaybook';
import { starterPlays } from './store/starters';
import { joinTeam, readInvite, takeParkedInvite } from './store/teams';
import { useTeamBook } from './store/useTeamBook';
import { useTeams } from './store/useTeams';
import { askConfirm, askText } from './ui/dialog';
import type { Book, Play } from './domain/types';

export function App() {
  const own = usePlaybook();
  const teams = useTeams(own.uid);
  const { removed: teamRemoved } = teams;
  const onTeamRemoved = useCallback(
    (teamId: string) => {
      const name = teams.joined.find((t) => t.teamId === teamId)?.name ?? teams.open?.name ?? 'that team';
      teamRemoved(teamId);
      toast(`You are no longer on ${name}. Showing your own playbook.`);
    },
    [teamRemoved, teams.joined, teams.open],
  );
  const viewing = teams.open?.role === 'viewer';
  const teamBook = useTeamBook(teams.open?.teamId ?? null, own.uid, onTeamRemoved, viewing);
  /*
   * Whose playbook every screen shows. The coach's own unless a team they
   * coach on is open — and the two are kept apart all the way down, so
   * switching never merges one into the other. See store/useTeamBook.ts.
   */
  const book: typeof own = teams.open ? teamBook : own;
  const route = useRoute();
  const home = useCallback(() => go({ screen: 'book' }), []);

  /** What a play is called in a sentence about it. */
  const titleOf = (id: string) => {
    const play = book.plays.find((p) => p.id === id);
    return play?.name || play?.suggestedName || 'the play';
  };

  // Across every playbook: an address names a play, not the book it is in.
  const open =
    route.screen === 'play' ? (book.everyPlay.find((p) => p.id === route.id) ?? null) : null;

  /*
   * An address for a play that is not in this book — a stale link, or one
   * followed on a device the play has not reached — lands on the playbook
   * rather than on nothing.
   */
  useEffect(() => {
    if (route.screen === 'play' && !open) home();
  }, [route, open, home]);

  /*
   * A play opened by its address brings its playbook with it, so the way back
   * out of the play lands on the list the play is actually in.
   */
  const openBook = open ? bookOf(open, book.books) : null;
  const { bookId, selectBook } = book;
  useEffect(() => {
    if (openBook && openBook !== bookId) selectBook(openBook);
  }, [openBook, bookId, selectBook]);

  /*
   * Asked once, of a device with nothing on it. A book with a single play in
   * it has answered already, and is marked so without being shown anything —
   * including the plays in the trash, which are still somebody's playbook.
   */
  const [welcomed, setWelcomed] = useState(wasWelcomed);
  const hasBook = book.everyPlay.length > 0 || book.trashed.length > 0;
  useEffect(() => {
    if (!welcomed && hasBook) {
      markWelcomed();
      setWelcomed(true);
    }
  }, [welcomed, hasBook]);
  const greet = (variant?: string) => {
    if (variant) book.setBookVariant(book.bookId, variant);
    markWelcomed();
    setWelcomed(true);
  };

  /*
   * Plays handed over by the shared viewer's "Save a copy". New ids, filed
   * as unfiled in whichever playbook is open, and never carrying the link
   * they came from: this copy is the coach's own now.
   */
  const { savePlay } = book;
  useEffect(() => {
    const taken = takeHandOver();
    if (!taken.length) return;
    const now = Date.now();
    for (const p of taken) {
      const { shareToken: _t, ...rest } = p;
      savePlay({
        ...rest,
        id: newId('p'),
        sectionId: UNFILED_SECTION,
        ...(book.bookId === 'main' ? {} : { bookId: book.bookId }),
        createdAt: now,
        updatedAt: now,
      });
    }
    toast(taken.length === 1 ? 'Saved a copy to your playbook' : `Saved ${taken.length} plays to your playbook`);
    // Once, on the first render that has the book.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  /*
   * An invite link, parked by main.tsx until there is an account to join with.
   * Asked rather than acted on: joining puts somebody else's playbook on this
   * device, and a link in a group chat can be tapped by accident.
   */
  const { joined, joinedOne, openTeam } = teams;
  useEffect(() => {
    if (!own.uid) return;
    const code = takeParkedInvite();
    if (!code) return;
    const uid = own.uid;
    void (async () => {
      const inv = await readInvite(code);
      if (!inv.ok) {
        toast(inv.reason);
        return;
      }
      const team = inv.value;
      if (team.teamId === uid) {
        toast('That is an invite to your own team.');
        return;
      }
      if (joined.some((t) => t.teamId === team.teamId)) {
        openTeam({ teamId: team.teamId, name: team.teamName, role: team.role });
        toast(`Showing ${team.teamName}`);
        return;
      }
      const { auth } = await import('./firebase');
      const ok = await askConfirm(team.role === 'viewer' ? `Follow ${team.teamName}?` : `Coach on ${team.teamName}?`, {
        body:
          (team.role === 'viewer'
            ? 'You will see their playbook, always the newest, and can study every play. You cannot change it.'
            : 'You will see and edit their playbook.') +
          ' Your own playbook stays exactly as it is, and the Coaches view on the Team page switches between them.' +
          (auth.currentUser?.isAnonymous
            ? ' This device has no email on its account yet — add one under Settings to reach the team from another device.'
            : ''),
        confirmLabel: 'Join',
      });
      if (!ok) return;
      const name = await askText('Your name', {
        body: 'So the coach can see who joined.',
        placeholder: 'Coach Smith',
        confirmLabel: 'Join',
      });
      if (name === null) return;
      const done = await joinTeam(uid, team, name);
      if (!done.ok) {
        toast(done.reason);
        return;
      }
      joinedOne(done.value);
      toast(team.role === 'viewer' ? `Following ${done.value.name}` : `You are coaching on ${done.value.name}`);
      go({ screen: 'book' });
    })();
    // When the account is known, and not again for the same one.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [own.uid]);

  /** Hand a link to whatever the device shares with, or copy it. */
  const sendLink = useCallback(async (url: string, title: string) => {
    try {
      if (navigator.share) {
        await navigator.share({ title, url });
        return;
      }
    } catch (err) {
      // The coach closed the share sheet: the link exists, and that is fine.
      if ((err as { name?: string })?.name === 'AbortError') return;
    }
    try {
      await navigator.clipboard.writeText(url);
      toast('Link copied');
    } catch {
      toast(url);
    }
  }, []);

  const sharePlay = useCallback(
    async (play: Play) => {
      const title = play.name || play.suggestedName || 'A play';
      const done = await publishShare('play', title, [play], play.shareToken);
      if (!done.ok) {
        toast(done.reason);
        return;
      }
      if (done.token !== play.shareToken) book.savePlay({ ...play, shareToken: done.token });
      await sendLink(shareUrl(done.token), title);
    },
    [book, sendLink],
  );

  const unsharePlay = useCallback(
    async (play: Play) => {
      if (!play.shareToken) return;
      if (!(await revokeShare(play.shareToken))) {
        toast('Could not reach the cloud to take the link down.');
        return;
      }
      const { shareToken: _t, ...rest } = play;
      book.savePlay(rest);
      toast('That link no longer works');
    },
    [book],
  );

  const shareBook = useCallback(
    async (b: Book, plays: Play[]) => {
      const done = await publishShare('book', b.name, plays, b.shareToken);
      if (!done.ok) {
        toast(done.reason);
        return;
      }
      if (done.token !== b.shareToken) book.setBookShare(b.id, done.token);
      await sendLink(shareUrl(done.token), b.name);
    },
    [book, sendLink],
  );

  const unshareBook = useCallback(
    async (b: Book) => {
      if (!b.shareToken) return;
      if (!(await revokeShare(b.shareToken))) {
        toast('Could not reach the cloud to take the link down.');
        return;
      }
      book.setBookShare(b.id, undefined);
      toast('That link no longer works');
    },
    [book],
  );

  // The back gesture goes where the `‹` button goes: to the playbook, not out
  // of the app. Every screen that is not the playbook is one step in from it.
  useBackLayer(route.screen !== 'book', home);

  const startNew = useCallback(
    (unit: Side | 'drill' = 'offense') => {
      // A new play is the kind of football its playbook is.
      const kind = book.books.find((b) => b.id === book.bookId)?.variant;
      const play =
        unit === 'drill'
          ? blankPlay(UNFILED_SECTION, 'offense', book.bookId, kind, true)
          : blankPlay(UNFILED_SECTION, unit, book.bookId, kind);
      book.savePlay(play);
      go({ screen: 'play', id: play.id });
    },
    [book],
  );

  /**
   * Backup writes a file rather than a share sheet, because the point of it is
   * the anonymous account being tied to this browser's storage: clearing site
   * data would otherwise orphan the playbook with nothing to restore from.
   */
  const exportBook = useCallback(() => {
    const blob = new Blob([book.exportJson()], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `chalk-playbook-${new Date().toISOString().slice(0, 10)}.json`;
    a.click();
    URL.revokeObjectURL(url);
  }, [book]);

  /*
   * A player or a parent on a team: the team's playbook to read and study,
   * and nothing that edits. Game day is exactly that screen already, so it is
   * the whole app for a viewer — with the way back to their own playbook.
   */
  if (viewing && teams.open) {
    return (
      <>
        <DialogHost />
        <ToastHost />
        <UpdateBar />
        <GameDay
          plays={book.plays}
          sections={book.sections}
          title={teams.open.name}
          exitLabel="My playbook"
          books={book.books}
          bookId={book.bookId}
          onSelectBook={book.selectBook}
          onExit={() => teams.openTeam(null)}
        />
      </>
    );
  }

  if (open) {
    return (
      <>
        <DialogHost />
        <ToastHost />
        <UpdateBar />
        <PlayEditor
          key={open.id}
          play={open}
          /* The rest of the book, so a defensive play can be set against one. */
          library={book.plays}
          onChange={book.savePlay}
          onSave={book.saveNow}
          onClose={home}
        />
      </>
    );
  }

  if (!welcomed && !hasBook && route.screen === 'book') {
    return (
      <>
        <DialogHost />
        <Welcome
          onStart={greet}
          onSignIn={() => {
            greet();
            go({ screen: 'settings' });
          }}
        />
      </>
    );
  }

  // The sideline: full screen, outside the shell, with nothing that edits.
  if (route.screen === 'gameday') {
    return (
      <>
        <DialogHost />
        <GameDay plays={book.plays} sections={book.sections} onExit={home} />
      </>
    );
  }

  return (
    <>
      <DialogHost />
      <ToastHost />
      <UpdateBar />
      <AppShell screen={route.screen === 'play' ? 'book' : route.screen}>
        {route.screen === 'home' ? (
          <Home
            books={book.books}
            everyPlay={book.everyPlay}
            bookOf={(p) => bookOf(p, book.books)}
            onOpenBook={book.selectBook}
            team={teams.open}
            joined={teams.joined}
            onOpenTeam={(t) => {
              teams.openTeam(t);
              toast(t ? `Showing ${t.name}` : 'Showing your own playbook');
            }}
            sync={book.sync}
            lastBackupAt={book.lastBackupAt}
          />
        ) : route.screen === 'team' ? (
          <TeamPage
            plays={book.plays}
            coaches={{
              uid: own.uid,
              open: teams.open,
              joined: teams.joined,
              onOpen: (t) => {
                teams.openTeam(t);
                toast(t ? `Showing ${t.name}` : 'Showing your own playbook');
              },
              onLeave: teams.leave,
              sendLink,
            }}
          />
        ) : route.screen === 'print' ? (
          <PrintPage
            plays={book.plays}
            sections={book.sections}
            onJson={exportBook}
            onRestore={book.importJson}
            history={
              own.uid
                ? {
                    have: new Set([...book.everyPlay, ...book.trashed].map((p) => p.id)),
                    load: book.bookHistory,
                    onBringBack: book.bringBack,
                  }
                : undefined
            }
          />
        ) : route.screen === 'settings' ? (
          <SettingsPage onSaveNow={book.saveNow} />
        ) : (
          <PlaybookList
            plays={book.plays}
            trashed={book.trashed}
            sections={book.sections}
            sync={book.sync}
            lastBackupAt={book.lastBackupAt}
            onRestorePlay={(id) => {
              const play = book.trashed.find((p) => p.id === id);
              book.restorePlay(id);
              toast(`Put back ${play?.name || play?.suggestedName || 'the play'}`);
            }}
            onEmptyTrash={book.emptyTrash}
            onOpen={(id) => go({ screen: 'play', id })}
            onNew={startNew}
            onDuplicate={(id) => {
              book.duplicatePlay(id);
              toast(`Duplicated ${titleOf(id)}`);
            }}
            /*
             * No question first. Deleting moves the play to the trash at the
             * foot of the playbook, so asking "are you sure?" every time was
             * guarding a mistake that was already recoverable — and now there
             * are two ways back from it, this Undo and the trash.
             */
            onDelete={(id) => {
              const name = titleOf(id);
              book.deletePlay(id);
              toast(`Deleted ${name}`, { undo: () => book.restorePlay(id) });
            }}
            onAddSection={book.addSection}
            onRenameSection={book.renameSection}
            onDeleteSection={book.deleteSection}
            onSetSection={(id, sectionId) => {
              const was = book.plays.find((p) => p.id === id)?.sectionId;
              if (was === sectionId) return;
              book.setPlaySection(id, sectionId);
              const folder = book.sections.find((sec) => sec.id === sectionId)?.name ?? 'Unfiled';
              toast(`Moved to ${folder}`, {
                undo: was === undefined ? undefined : () => book.setPlaySection(id, was),
              });
            }}
            onMoveMany={(ids, sectionId) => {
              const was = new Map(ids.map((id) => [id, book.plays.find((p) => p.id === id)?.sectionId]));
              for (const id of ids) book.setPlaySection(id, sectionId);
              const folder = book.sections.find((sec) => sec.id === sectionId)?.name ?? 'Unfiled';
              toast(`Moved ${ids.length} ${ids.length === 1 ? 'play' : 'plays'} to ${folder}`, {
                undo: () => {
                  for (const [id, from] of was) if (from !== undefined) book.setPlaySection(id, from);
                },
              });
            }}
            onDeleteMany={(ids) => {
              // To the trash, like one: so no question first, and one Undo for the lot.
              for (const id of ids) book.deletePlay(id);
              toast(`Deleted ${ids.length} ${ids.length === 1 ? 'play' : 'plays'}`, {
                undo: () => {
                  for (const id of ids) book.restorePlay(id);
                },
              });
            }}
            onMovePlay={book.movePlay}
            onSetStatus={book.setPlayStatus}
            onRevisions={book.revisions}
            onRestoreRevision={(old) => {
              const now = book.everyPlay.find((p) => p.id === old.id);
              // A save like any other, so what is on screen now is kept as the
              // newest revision and this can be taken back.
              book.savePlay({ ...old, deletedAt: undefined });
              toast(`Restored ${old.name || old.suggestedName || 'the play'}`, {
                undo: now ? () => book.savePlay(now) : undefined,
              });
            }}
            books={book.books}
            bookId={book.bookId}
            onSelectBook={book.selectBook}
            onSetBookVariant={book.setBookVariant}
            onAddStarters={() => {
              const kind = book.books.find((b) => b.id === book.bookId)?.variant;
              const plays = starterPlays(kind);
              const folder = book.addSection('Starters');
              for (const p of plays) {
                book.savePlay({
                  ...p,
                  sectionId: folder.id,
                  ...(book.bookId === 'main' ? {} : { bookId: book.bookId }),
                });
              }
              toast(`Added ${plays.length} starter plays`);
            }}
            onSharePlay={(p) => void sharePlay(p)}
            onUnsharePlay={(p) => void unsharePlay(p)}
            onShareBook={(b, ps) => void shareBook(b, ps)}
            onUnshareBook={(b) => void unshareBook(b)}
            onAddBook={(name, variant) => {
              book.addBook(name, variant);
              toast(`Added ${name}`);
            }}
            onRenameBook={book.renameBook}
            onDeleteBook={book.deleteBook}
            team={teams.open?.name}
            onOwnBook={() => teams.openTeam(null)}
          />
        )}
      </AppShell>
    </>
  );
}
