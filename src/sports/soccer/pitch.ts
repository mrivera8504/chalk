/**
 * A soccer pitch, whole, at the board's scale.
 *
 * Not to scale with the men on it, and that is the decision. A pitch is 70
 * yards across; the board's marks, lines and grid are sized for a window of
 * about 22. Drawn at true size a player's mark would be a speck, and drawn at
 * true size with bigger marks every constant on the board would need a second
 * value. So the pitch is drawn 22 board yards wide — about one to 3.2 — with
 * every line in proportion to every other, which is what a tactics board has
 * always been: the boxes are where the boxes are, and a man is big enough to
 * read. `yardsPerUnit` on the sport says so for anything that needs the truth.
 *
 * Whole rather than a half, unlike the court: a team's shape runs from its
 * keeper to its striker, and a phone is tall.
 *
 * Origin at the center spot. The goal being attacked is at the top, the
 * team's own at the bottom, as a football offense drives up the board.
 */
export const SCALE = 22 / 70;
const yd = (n: number) => n * SCALE;

export const PITCH = {
  halfWidth: yd(35),
  halfLength: yd(55),
  box: { half: yd(22), depth: yd(18) },
  six: { half: yd(10), depth: yd(6) },
  spot: yd(12),
  circle: yd(10),
  goal: { half: yd(4), depth: 0.55 },
};

/** The middle of the goal being attacked: where a shot ends. */
export const GOAL = { x: 0, y: -PITCH.halfLength };

export const PITCH_VIEW = {
  halfWidth: PITCH.halfWidth + 1.1,
  downfield: PITCH.halfLength + 1.3,
  behind: PITCH.halfLength + 1.3,
};
