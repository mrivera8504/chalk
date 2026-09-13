import type { BlockKind, PlayerSlot } from '../domain/types';

export type Tool = 'select' | BlockKind;

const TOOLS: { id: Tool; label: string }[] = [
  { id: 'select', label: 'Select' },
  { id: 'block', label: 'Block' },
  { id: 'pull', label: 'Pull' },
  { id: 'combo', label: 'Combo' },
];

/** A blocker is picked; combo waits on a second defender before it commits. */
export interface Pending {
  blockerId: string;
  targetId?: string;
}

export type BlockTap =
  | { type: 'pending'; pending: Pending }
  | { type: 'commit'; blockerId: string; targetId: string; climbToId?: string }
  | { type: 'none' };

/**
 * Tap the blocker, tap the defender, done, and the tool stays armed for the
 * next man. Combo takes one extra tap for the climb. Tapping another offensive
 * player at any point restarts on him, which is how a mis-tap gets corrected
 * without a cancel button.
 */
export function tapBlock(
  tool: BlockKind,
  pending: Pending | null,
  tapped: PlayerSlot,
): BlockTap {
  if (tapped.side === 'offense') {
    return { type: 'pending', pending: { blockerId: tapped.id } };
  }
  if (!pending) return { type: 'none' };

  if (tool === 'combo') {
    if (!pending.targetId) {
      return { type: 'pending', pending: { ...pending, targetId: tapped.id } };
    }
    // Climbing to the man you are already on is not a combo.
    if (pending.targetId === tapped.id) return { type: 'none' };
    return {
      type: 'commit',
      blockerId: pending.blockerId,
      targetId: pending.targetId,
      climbToId: tapped.id,
    };
  }

  return { type: 'commit', blockerId: pending.blockerId, targetId: tapped.id };
}

interface Props {
  tool: Tool;
  onTool: (t: Tool) => void;
  /** What to tap next. Empty in select mode. */
  hint: string;
  blockCount: number;
  onClear: () => void;
}

export function BlockTool({ tool, onTool, hint, blockCount, onClear }: Props) {
  return (
    <div className="blocktool">
      <div className="tools">
        {TOOLS.map((t) => (
          <button key={t.id} aria-pressed={tool === t.id} onClick={() => onTool(t.id)}>
            {t.label}
          </button>
        ))}
        {blockCount > 0 && (
          <button className="quiet" onClick={onClear}>
            Clear {blockCount}
          </button>
        )}
      </div>
      {hint && <div className="hint">{hint}</div>}
    </div>
  );
}
