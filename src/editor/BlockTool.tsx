import type { BlockKind, PlayerSlot } from '../domain/types';

export type Tool = 'select' | 'draw' | 'erase' | BlockKind;

export const TOOLS: { id: Tool; label: string }[] = [
  { id: 'select', label: 'Select' },
  { id: 'draw', label: 'Draw' },
  { id: 'erase', label: 'Erase' },
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

/** For the dock handle, which names the current mode when nothing is pending. */
export function toolLabel(tool: Tool): string {
  return TOOLS.find((t) => t.id === tool)?.label ?? 'Select';
}

interface Props {
  tool: Tool;
  onTool: (t: Tool) => void;
}

/*
 * The hint that used to live here now rides on the dock handle, so it is still
 * there when the tools are folded away. That is the line telling you whose
 * block you are halfway through assigning, and it is worth more than the
 * buttons when the board is what you want to see.
 */
export function BlockTool({ tool, onTool }: Props) {
  return (
    <div className="tools">
      {TOOLS.map((t) => (
        <button key={t.id} aria-pressed={tool === t.id} onClick={() => onTool(t.id)}>
          {t.label}
        </button>
      ))}
    </div>
  );
}
