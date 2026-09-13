import { useEffect, useState } from 'react';
import { clearTrace, onTrace, traceLines, traceText } from './trace';

/**
 * Shown only under ?trace. Deliberately dumb: a running log and a way to get the
 * text off the device. The textarea is the fallback that always works, because
 * clipboard writes are blocked in plenty of Android contexts.
 */
export function TracePanel() {
  const [, bump] = useState(0);
  const [copied, setCopied] = useState(false);
  const [showAll, setShowAll] = useState(false);

  useEffect(() => onTrace(() => bump((n) => n + 1)), []);

  const lines = traceLines();
  const tail = lines.slice(-14);

  async function copy() {
    try {
      await navigator.clipboard.writeText(traceText());
      setCopied(true);
      setTimeout(() => setCopied(false), 1500);
    } catch {
      setShowAll(true);
    }
  }

  return (
    <div className="trace">
      <div className="trace-bar">
        <strong>trace</strong>
        <span>{lines.length} events</span>
        <button onClick={copy}>{copied ? 'Copied' : 'Copy'}</button>
        <button onClick={() => setShowAll((v) => !v)}>{showAll ? 'Hide' : 'Text'}</button>
        <button className="quiet" onClick={clearTrace}>
          Clear
        </button>
      </div>

      {showAll ? (
        <textarea
          className="trace-out"
          readOnly
          spellCheck={false}
          value={traceText()}
          onFocus={(e) => e.currentTarget.select()}
        />
      ) : (
        <pre className="trace-log">{tail.join('\n') || 'touch the board with the pen'}</pre>
      )}
    </div>
  );
}
