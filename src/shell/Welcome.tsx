import { useState } from 'react';
import { SPORTS, football } from '../sports';

const KEY = 'chalk.welcomed.v1';

/** Whether this device has been through the first screen, or never needed it. */
export function wasWelcomed(): boolean {
  try {
    return localStorage.getItem(KEY) !== null;
  } catch {
    // Storage blocked: asking again on every launch would be worse than never.
    return true;
  }
}

export function markWelcomed(): void {
  try {
    localStorage.setItem(KEY, String(Date.now()));
  } catch {
    /* storage blocked; the session keeps working */
  }
}

interface Props {
  /** The kind of football chosen. Seven-man is the app as it has always been. */
  onStart: (variant: string) => void;
  /** A coach who already has a book somewhere: straight to the account. */
  onSignIn: () => void;
}

/**
 * The first screen of a device that has never held a play.
 *
 * One question, because it is the one thing the app cannot work out and the
 * one that decides what the first play looks like: how many are on the field.
 * It is asked once and can be changed per playbook afterwards. A device that
 * already has a book never sees this — there is nothing to ask a coach whose
 * plays are on the screen behind it.
 */
export function Welcome({ onStart, onSignIn }: Props) {
  const [sport, setSport] = useState(football);
  const [picked, setPicked] = useState(football.defaultVariant);

  return (
    <div className="welcome">
      <div className="welcome-card">
        <h1>Chalk</h1>
        <p className="welcome-lede">Draw it, save it, print it. What are you coaching?</p>

        <div className="welcome-sports" role="group" aria-label="Sport">
          {SPORTS.map((s) => (
            <button
              key={s.id}
              aria-pressed={sport === s}
              onClick={() => {
                setSport(s);
                setPicked(s.defaultVariant);
              }}
            >
              {s.name}
            </button>
          ))}
        </div>

        <div className="welcome-kinds" role="radiogroup" aria-label={`Kind of ${sport.name.toLowerCase()}`}>
          {sport.variants.map((v) => (
            <button
              key={v.id}
              role="radio"
              aria-checked={picked === v.id}
              onClick={() => setPicked(v.id)}
            >
              <strong>{v.name}</strong>
              <span>{v.blurb}</span>
            </button>
          ))}
        </div>

        <button className="primary welcome-go" onClick={() => onStart(picked)}>
          Start my playbook
        </button>
        <button className="quiet" onClick={onSignIn}>
          I already have one — sign in
        </button>
      </div>
    </div>
  );
}
