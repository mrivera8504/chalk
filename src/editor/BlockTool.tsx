import type { BlockKind, LinkKind, PlayerSlot, Side } from '../domain/types';

export type Tool = 'select' | 'routes' | 'draw' | 'erase' | BlockKind | LinkKind;

/** The tap-tap tools: two men and a line between them, whichever unit it is. */
export const PAIR_TOOLS: Tool[] = ['block', 'pull', 'combo', 'cover', 'stunt', 'pass', 'screen'];

/** A type guard, so the tap handler narrows to the tools that take two men. */
export function isPairTool(tool: Tool): tool is BlockKind | LinkKind {
  return PAIR_TOOLS.includes(tool);
}

/*
 * Freehand is not in this row. It lives on the pencil over the board, because
 * it is a thing you reach for in the middle of drawing a play rather than a
 * mode you set out in.
 *
 * The row is different for the two units and not merely relabeled. A defensive
 * play has no pull and no combo, and an offensive one has no stunt; offering all
 * eight to both would be six buttons that do nothing wherever you happen to be,
 * which is what made the old sixteen-pill drawer unreadable.
 */
export function toolsFor(
  unit: Side,
  blocking = true,
  hoops = false,
): { id: Tool; label: string }[] {
  /*
   * A court's row. Pass and Screen are the two things drawn between two
   * players, so they are the two-tap tools here, as Block and Man are on a
   * field; everything one man does alone is in his own list.
   */
  if (hoops) {
    return [
      { id: 'select', label: 'Move' },
      { id: 'routes', label: 'Actions' },
      { id: 'erase', label: 'Erase' },
      { id: 'pass', label: 'Pass' },
      { id: 'screen', label: 'Screen' },
    ];
  }

  const common: { id: Tool; label: string }[] = [
    { id: 'select', label: 'Move' },
    { id: 'routes', label: unit === 'defense' ? 'Jobs' : 'Routes' },
    { id: 'erase', label: 'Erase' },
  ];

  /*
   * Where nobody may block, the row is the three tools and Man. Flag has no
   * line to run a game on either, so the stunt goes with the blocks: a button
   * for a thing the rules forbid is worse than a shorter row.
   */
  if (!blocking) return unit === 'defense' ? [...common, { id: 'cover', label: 'Man' }] : common;

  return unit === 'defense'
    ? [...common, { id: 'cover', label: 'Man' }, { id: 'stunt', label: 'Stunt' }]
    : [
        ...common,
        { id: 'block', label: 'Block' },
        { id: 'pull', label: 'Pull' },
        { id: 'combo', label: 'Combo' },
      ];
}

/** Every label, for the dock handle, which has to name a tool from either row. */
const ALL_LABELS: Record<string, string> = {
  select: 'Move',
  routes: 'Routes',
  erase: 'Erase',
  block: 'Block',
  pull: 'Pull',
  combo: 'Combo',
  cover: 'Man',
  stunt: 'Stunt',
  pass: 'Pass',
  screen: 'Screen',
};

/**
 * The first man is picked; the tool waits on the second. `blockerId` is whoever
 * was tapped first — the blocker, the covering defender, or the man who crashes
 * — and combo alone waits on a third.
 */
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

/**
 * Tap the defender, tap the man he has. The same grammar as a block, and
 * deliberately so: two taps, the tool stays armed, and tapping another defender
 * restarts on him rather than needing a cancel.
 */
export function tapCover(pending: Pending | null, tapped: PlayerSlot): BlockTap {
  if (tapped.side === 'defense') {
    return { type: 'pending', pending: { blockerId: tapped.id } };
  }
  if (!pending) return { type: 'none' };
  return { type: 'commit', blockerId: pending.blockerId, targetId: tapped.id };
}

/**
 * Tap the man who crashes, then the man who loops behind him. Both are
 * defenders, so the restart rule cannot be "tapping your own side starts over"
 * — a second tap on the man already picked is what cancels it instead.
 */
export function tapStunt(pending: Pending | null, tapped: PlayerSlot): BlockTap {
  if (tapped.side !== 'defense') return { type: 'none' };
  if (!pending) return { type: 'pending', pending: { blockerId: tapped.id } };
  if (pending.blockerId === tapped.id) return { type: 'none' };
  return { type: 'commit', blockerId: pending.blockerId, targetId: tapped.id };
}

/**
 * Tap one man, then another: who passes and who catches, who screens and who
 * it is for. Either side of the ball, because a screen is set for a teammate
 * and a defense passes nothing. A second tap on the first man lets go of him.
 */
export function tapTeammate(pending: Pending | null, tapped: PlayerSlot): BlockTap {
  if (!pending) return { type: 'pending', pending: { blockerId: tapped.id } };
  if (pending.blockerId === tapped.id) return { type: 'none' };
  return { type: 'commit', blockerId: pending.blockerId, targetId: tapped.id };
}

/** For the dock handle, which names the current mode when nothing is pending. */
export function toolLabel(tool: Tool): string {
  if (tool === 'draw') return 'Freehand';
  return ALL_LABELS[tool] ?? 'Move';
}

interface Props {
  tool: Tool;
  unit: Side;
  /** False for a kind of football with no blocking: flag. */
  blocking?: boolean;
  /** A court's row instead of a field's. */
  hoops?: boolean;
  onTool: (t: Tool) => void;
}

/*
 * The hint that used to live here now rides on the dock handle, so it is still
 * there when the tools are folded away. That is the line telling you whose
 * block you are halfway through assigning, and it is worth more than the
 * buttons when the board is what you want to see.
 */
export function BlockTool({ tool, unit, blocking = true, hoops = false, onTool }: Props) {
  return (
    <div className="tools">
      {toolsFor(unit, blocking, hoops).map((t) => (
        <button key={t.id} aria-pressed={tool === t.id} onClick={() => onTool(t.id)}>
          {t.label}
        </button>
      ))}
    </div>
  );
}
