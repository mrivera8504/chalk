import { useState } from 'react';

interface Props {
  coachingPoint: string;
  notes: string;
  tags: string[];
  onCoachingPoint: (v: string) => void;
  onNotes: (v: string) => void;
  onTags: (v: string[]) => void;
}

/**
 * What the play is for, in words.
 *
 * All three of these were in the data model, printed on the exported sheet and
 * matched by the playbook search, with nowhere to type them. The coaching point
 * is deliberately a single line: it is the one thing said to the huddle, and a
 * box that invites a paragraph gets a paragraph nobody reads on a sideline.
 */
export function NotesPanel({
  coachingPoint,
  notes,
  tags,
  onCoachingPoint,
  onNotes,
  onTags,
}: Props) {
  const [draft, setDraft] = useState('');

  function addTag() {
    const tag = draft.trim().toLowerCase();
    setDraft('');
    if (!tag || tags.includes(tag)) return;
    onTags([...tags, tag]);
  }

  return (
    <div className="picker notes-panel">
      <div className="picker-group">
        <div className="setting">
          <div className="setting-label">
            <strong>Coaching point</strong>
            <span>the one thing to say before it runs</span>
          </div>
          <input
            className="notes-line"
            value={coachingPoint}
            onChange={(e) => onCoachingPoint(e.target.value)}
            placeholder="Pull hard, don't round it off"
            spellCheck
          />
        </div>

        <div className="setting">
          <div className="setting-label">
            <strong>Notes</strong>
            <span>anything else worth keeping</span>
          </div>
          <textarea
            className="notes-body"
            value={notes}
            onChange={(e) => onNotes(e.target.value)}
            rows={3}
            placeholder="Works against a 5-2. Check the backside end."
            spellCheck
          />
        </div>

        <div className="setting">
          <div className="setting-label">
            <strong>Tags</strong>
            <span>how you will search for this later</span>
          </div>
          <div className="tag-row">
            {tags.map((t) => (
              <span key={t} className="chip">
                <button className="quiet" onClick={() => onTags(tags.filter((x) => x !== t))}>
                  {t}
                </button>
                <button
                  className="chip-x"
                  aria-label={`Remove ${t}`}
                  onClick={() => onTags(tags.filter((x) => x !== t))}
                >
                  ×
                </button>
              </span>
            ))}
          </div>
          <div className="picker-row">
            <input
              className="notes-line"
              value={draft}
              onChange={(e) => setDraft(e.target.value)}
              // Enter rather than a button alone: this is the one field likely
              // to take several entries in a row.
              onKeyDown={(e) => {
                if (e.key === 'Enter') {
                  e.preventDefault();
                  addTag();
                }
              }}
              placeholder="goal line, power, base"
              spellCheck={false}
              aria-label="New tag"
            />
            <button onClick={addTag} disabled={!draft.trim()}>
              Add
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
