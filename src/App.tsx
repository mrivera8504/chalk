import { useCallback, useEffect } from 'react';
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

export function App() {
  const book = usePlaybook();
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

  // The back gesture goes where the `‹` button goes: to the playbook, not out
  // of the app. Every screen that is not the playbook is one step in from it.
  useBackLayer(route.screen !== 'book', home);

  const startNew = useCallback(
    (unit: Side = 'offense') => {
      const play = blankPlay(UNFILED_SECTION, unit, book.bookId);
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

  return (
    <>
      <DialogHost />
      <ToastHost />
      <UpdateBar />
      <AppShell screen={route.screen === 'play' ? 'book' : route.screen}>
        {route.screen === 'team' ? (
          <TeamPage />
        ) : route.screen === 'print' ? (
          <PrintPage
            plays={book.plays}
            sections={book.sections}
            onJson={exportBook}
            onRestore={book.importJson}
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
            onMovePlay={book.movePlay}
            onSetStatus={book.setPlayStatus}
            books={book.books}
            bookId={book.bookId}
            onSelectBook={book.selectBook}
            onAddBook={(name) => {
              book.addBook(name);
              toast(`Added ${name}`);
            }}
            onRenameBook={book.renameBook}
            onDeleteBook={book.deleteBook}
          />
        )}
      </AppShell>
    </>
  );
}
