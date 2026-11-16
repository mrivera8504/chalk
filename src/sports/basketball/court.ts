/**
 * A half court, in yards.
 *
 * Yards and not feet, and that is a decision. Every constant the board is made
 * of — the size of a mark, the weight of a line, the grid a drag snaps to, how
 * near a tap has to land — is a number of yards, and a half court is sixteen
 * and two thirds of them by fifteen and two thirds: the same order of size as
 * the patch of a football field the board has always shown. Measured in feet,
 * every one of those constants would need a second value and every place that
 * reads one a second branch. A coach never sees the unit; the lines are where
 * the paint is.
 *
 * Origin at the middle of the baseline, `+y` toward half court. So the basket
 * is at the top of the board and the offense comes up from the bottom, the way
 * a football offense does.
 *
 * High-school paint: a 12-foot lane and a 19'9" arc. The college and pro arcs
 * are a foot or three further out, which on a play diagram is the width of the
 * line.
 */
const FT = 1 / 3;

export const COURT = {
  halfWidth: 25 * FT,
  length: 47 * FT,
  /** Center of the rim, out from the baseline. */
  rim: { x: 0, y: 5.25 * FT },
  rimRadius: 0.75 * FT,
  backboard: { y: 4 * FT, half: 3 * FT },
  lane: { half: 6 * FT, length: 19 * FT },
  circle: 6 * FT,
  arc: 19.75 * FT,
};

/** The board's window on it: the court and a little floor all round. */
export const COURT_VIEW = {
  halfWidth: COURT.halfWidth + 1.1,
  downfield: 1.3,
  behind: COURT.length + 1.3,
};
