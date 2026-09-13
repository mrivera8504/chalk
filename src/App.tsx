import { useCallback, useState } from 'react';
import { PlayEditor } from './editor/PlayEditor';
import { PlaybookList } from './playbook/PlaybookList';
import { blankPlay, usePlaybook } from './store/usePlaybook';

export function App() {
  const book = usePlaybook();
  const [openId, setOpenId] = useState<string | null>(null);

  const open = book.plays.find((p) => p.id === openId) ?? null;

  const startNew = useCallback(() => {
    const play = blankPlay();
    book.savePlay(play);
    setOpenId(play.id);
  }, [book]);

  /**
   * Export writes a file rather than a share sheet, because the point of it is
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
      <PlayEditor
        key={open.id}
        play={open}
        onChange={book.savePlay}
        onSave={book.saveNow}
        onClose={() => setOpenId(null)}
      />
    );
  }

  return (
    <PlaybookList
      plays={book.plays}
      sections={book.sections}
      sync={book.sync}
      onOpen={setOpenId}
      onNew={startNew}
      onDuplicate={book.duplicatePlay}
      onDelete={(id) => {
        if (confirm('Delete this play?')) book.deletePlay(id);
      }}
      onAddSection={book.addSection}
      onRenameSection={book.renameSection}
      onDeleteSection={book.deleteSection}
      onSetSection={book.setPlaySection}
      onMovePlay={book.movePlay}
      onExport={exportBook}
    />
  );
}
