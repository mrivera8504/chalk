import { useCallback, useEffect } from 'react';
import { PlayEditor } from './editor/PlayEditor';
import { UNFILED_SECTION, type Side } from './domain/types';
import { PlaybookList } from './playbook/PlaybookList';
import { blankPlay, usePlaybook } from './store/usePlaybook';
import { DialogHost } from './ui/DialogHost';
import { UpdateBar } from './ui/UpdateBar';
import { useBackLayer } from './ui/backstack';
import { askConfirm } from './ui/dialog';
import { go, useRoute } from './ui/route';
import { AppShell } from './shell/AppShell';
import { PrintPage, SettingsPage, TeamPage } from './shell/pages';

export function App() {
  const book = usePlaybook();
  const route = useRoute();
  const home = useCallback(() => go({ screen: 'book' }), []);

  const open =
    route.screen === 'play' ? (book.plays.find((p) => p.id === route.id) ?? null) : null;

  /*
   * An address for a play that is not in this book — a stale link, or one
   * followed on a device the play has not reached — lands on the playbook
   * rather than on nothing.
   */
  useEffect(() => {
    if (route.screen === 'play' && !open) home();
  }, [route, open, home]);

  // The back gesture goes where the `‹` button goes: to the playbook, not out
  // of the app. Every screen that is not the playbook is one step in from it.
  useBackLayer(route.screen !== 'book', home);

  const startNew = useCallback(
    (unit: Side = 'offense') => {
      const play = blankPlay(UNFILED_SECTION, unit);
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
            onRestorePlay={book.restorePlay}
            onEmptyTrash={book.emptyTrash}
            onOpen={(id) => go({ screen: 'play', id })}
            onNew={startNew}
            onDuplicate={book.duplicatePlay}
            onDelete={async (id) => {
              const play = book.plays.find((p) => p.id === id);
              const name = play?.name || play?.suggestedName || 'this play';
              if (
                await askConfirm(`Delete ${name}?`, {
                  // No longer the truth it used to tell: the play goes to the
                  // trash at the foot of the playbook and stays there until it
                  // is emptied.
                  body: 'It moves to Deleted, at the bottom of the playbook.',
                  confirmLabel: 'Delete',
                  danger: true,
                })
              ) {
                book.deletePlay(id);
              }
            }}
            onAddSection={book.addSection}
            onRenameSection={book.renameSection}
            onDeleteSection={book.deleteSection}
            onSetSection={book.setPlaySection}
            onMovePlay={book.movePlay}
          />
        )}
      </AppShell>
    </>
  );
}
