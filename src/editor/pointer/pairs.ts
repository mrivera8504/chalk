import type { EditorCtx } from './context';
import { makeBlock } from '../../domain/presets/blocks';
import { makeCover, makeStunt } from '../../domain/presets/links';
import { makePass, makeScreen } from '../../domain/presets/hoops';
import { isBesideRoute, isBlockKind, type PlayerSlot } from '../../domain/types';
import { isPairTool, tapBlock, tapCover, tapStunt, tapTeammate } from '../BlockTool';

/** The two-tap tools: a block, man coverage, a stunt. */

export function createPairs(ed: EditorCtx) {
  const {
    byId,
    pending,
    remember,
    setAssignments,
    setPending,
    setSel,
    tool,
  } = ed;

  /**
   * Tap-tap assignment, for every tool that draws a line between two men.
   *
   * One function for blocks, man coverage and line games, because they are the
   * same gesture: tap who does it, tap who it is done to, and the tool stays
   * armed so the next pair is two taps away. What differs is only which side
   * each tap has to land on, which is the little tap function's business.
   */
  function handlePairTap(player: PlayerSlot) {
    if (!isPairTool(tool)) return;

    const step =
      tool === 'cover'
        ? tapCover(pending, player)
        : tool === 'stunt'
          ? tapStunt(pending, player)
          : tool === 'pass' || tool === 'screen'
            ? tapTeammate(pending, player)
            : tapBlock(tool, pending, player);

    if (step.type === 'none') return;
    if (step.type === 'pending') {
      setPending(step.pending);
      return;
    }

    const first = byId(step.blockerId);
    const target = byId(step.targetId);
    const climbTo = byId(step.climbToId);
    setPending(null);
    setSel(null);
    if (!first || !target) return;

    remember();

    if (tool === 'cover') {
      setAssignments((prev) => [
        // One man per defender. Re-tapping him moves the coverage rather than
        // drawing a second rope off the same player.
        ...prev.filter((a) => !(a.playerId === first.id && a.kind === 'cover')),
        makeCover(first, target),
      ]);
      return;
    }

    if (tool === 'pass') {
      setAssignments((prev) => {
        // One pass a man: the ball only leaves his hands once in a step.
        const rest = prev.filter((a) => !(a.playerId === first.id && a.kind === 'pass'));
        return [...rest, makePass(first, target, rest)];
      });
      return;
    }

    if (tool === 'screen') {
      setAssignments((prev) => [
        // Setting a screen is where he goes, so it takes the place of his cut.
        ...prev.filter(
          (a) => !(a.playerId === first.id && !isBlockKind(a.kind) && !isBesideRoute(a.kind)),
        ),
        makeScreen(first, target),
      ]);
      return;
    }

    if (tool === 'stunt') {
      const pair = makeStunt(first, target);
      setAssignments((prev) => [
        // A stunt is two lines, so both men have to be cleared of any stunt they
        // were already in — otherwise the end loops behind two different people.
        ...prev.filter(
          (a) => !(a.kind === 'stunt' && (a.playerId === first.id || a.playerId === target.id)),
        ),
        ...pair,
      ]);
      return;
    }

    const next = makeBlock(tool, first, target, climbTo ?? undefined);
    setAssignments((prev) => [
      // One block per man. Re-tapping a blocker corrects him instead of stacking.
      ...prev.filter((a) => !(a.playerId === first.id && isBlockKind(a.kind))),
      next,
    ]);
  }

  return { handlePairTap };
}

export type Pairs = ReturnType<typeof createPairs>;
