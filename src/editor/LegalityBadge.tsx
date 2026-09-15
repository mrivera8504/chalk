import type { Issue, Side } from '../domain/types';

interface Props {
  onLine: number;
  minOnLine: number;
  issues: Issue[];
  /** Which unit this play is about, which decides what the badge is counting. */
  unit: Side;
  /** Men on the defensive side, and how many of them are on the ball. */
  defenders: number;
  onBall: number;
}

/**
 * The one number in the header.
 *
 * On an offensive play it is the rule that can actually be broken: how many men
 * are on the line, and whether that is legal. On a defensive play it was
 * counting the *offense* — "4 on line, legal, 4 required" — which is a fact
 * about the scout look and nothing to do with the play being drawn, sitting in
 * the most prominent place on the screen answering a question nobody asked.
 *
 * A defense has no such rule to break at this level, so it reports its shape
 * instead: how many are up on the ball, out of how many are on the field. That
 * is the number a coach checks when he changes a front.
 */
export function LegalityBadge({ onLine, minOnLine, issues, unit, defenders, onBall }: Props) {
  if (unit === 'defense') {
    return (
      <div className="legality good">
        <span className="count">{onBall}</span>
        <span className="of">on the ball</span>
        <span className="msg">{defenders} on the field</span>
      </div>
    );
  }

  const bad = issues.some((i) => i.level === 'error');

  return (
    <div className={`legality ${bad ? 'bad' : 'good'}`}>
      <span className="count">{onLine}</span>
      <span className="of">on line</span>
      {bad ? (
        <span className="msg">{issues.find((i) => i.level === 'error')!.text}</span>
      ) : (
        <span className="msg">legal, {minOnLine} required</span>
      )}
    </div>
  );
}
