import { useCallback, useState } from 'react';
import { PlayEditor } from './editor/PlayEditor';
import { UNFILED_SECTION, type Side } from './domain/types';
import { PlaybookList } from './playbook/PlaybookList';
import { blankPlay, usePlaybook } from './store/usePlaybook';
import { DialogHost } from './ui/DialogHost';
import { askConfirm } from './ui/dialog';

export function App() {
  const book = usePlaybook();
  const [openId, setOpenId] = useState<string | null>(null);

  const open = book.plays.find((p) => p.id === openId) ?? null;

  const startNew = useCallback(
    (unit: Side = 'offense') => {
      const play = blankPlay(UNFILED_SECTION, unit);
      book.savePlay(play);
      setOpenId(play.id);
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
        <PlayEditor
          key={open.id}
          play={open}
          /* The rest of the book, so a defensive play can be set against one. */
          library={book.plays}
          onChange={book.savePlay}
          onSave={book.saveNow}
          onClose={() => setOpenId(null)}
        />
      </>
    );
  }

  return (
    <>
      <DialogHost />
      <PlaybookList
        plays={book.plays}
        sections={book.sections}
        sync={book.sync}
        onOpen={setOpenId}
        onNew={startNew}
        onDuplicate={book.duplicatePlay}
        onDelete={async (id) => {
          const play = book.plays.find((p) => p.id === id);
          const name = play?.name || play?.suggestedName || 'this play';
          if (
            await askConfirm(`Delete ${name}?`, {
              body: 'It goes for good. A backup file is the only way back.',
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
        onExport={exportBook}
        onRestore={book.importJson}
        onSaveNow={book.saveNow}
      />
    </>
  );
}
