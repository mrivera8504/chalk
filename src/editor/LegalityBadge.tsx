import type { Issue } from '../domain/types';

interface Props {
  onLine: number;
  minOnLine: number;
  issues: Issue[];
}

export function LegalityBadge({ onLine, minOnLine, issues }: Props) {
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
