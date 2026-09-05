'use client';

import { useState } from 'react';

import { Badge } from '@/components/ui/Badge';
import { Card, CardHeader } from '@/components/ui/Card';
import { Notice } from '@/components/ui/States';
import { MAX_LABELS_PER_RUN, MAX_NOTE_LENGTH } from '@/lib/annotations';
import { apiSend, messageFor } from '@/lib/client/api';

/**
 * The owner's own note and labels on a run, shown on the report.
 *
 * Both save straight to the API rather than through a form submit, because
 * this sits inside a page that is otherwise read-only and a "save the report"
 * button would suggest the report itself was editable.
 */

interface RunAnnotationsProps {
  simulationId: string;
  initialNotes: string;
  initialTags: string[];
}

export function RunAnnotations({ simulationId, initialNotes, initialTags }: RunAnnotationsProps) {
  const [notes, setNotes] = useState(initialNotes);
  const [savedNotes, setSavedNotes] = useState(initialNotes);
  const [tags, setTags] = useState(initialTags);
  const [draftTag, setDraftTag] = useState('');

  const [savingNotes, setSavingNotes] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [saved, setSaved] = useState(false);

  const dirty = notes !== savedNotes;

  async function saveNotes() {
    setSavingNotes(true);
    setError(null);
    setSaved(false);

    try {
      const result = await apiSend<{ notes: string }>(
        `/api/simulations/${simulationId}/notes`,
        'PATCH',
        { note: notes }
      );
      // The server trims and caps, so the saved value is what comes back.
      setNotes(result.notes);
      setSavedNotes(result.notes);
      setSaved(true);
    } catch (cause) {
      setError(messageFor(cause));
    } finally {
      setSavingNotes(false);
    }
  }

  async function addTag(event: React.FormEvent) {
    event.preventDefault();
    if (draftTag.trim() === '') return;

    setError(null);

    try {
      const result = await apiSend<{ tags: string[] }>(
        `/api/simulations/${simulationId}/tags`,
        'POST',
        { label: draftTag }
      );
      setTags(result.tags);
      setDraftTag('');
    } catch (cause) {
      setError(messageFor(cause));
    }
  }

  async function removeTag(label: string) {
    setError(null);

    try {
      const result = await apiSend<{ tags: string[] }>(
        `/api/simulations/${simulationId}/tags?label=${encodeURIComponent(label)}`,
        'DELETE'
      );
      setTags(result.tags);
    } catch (cause) {
      setError(messageFor(cause));
    }
  }

  return (
    <Card>
      <CardHeader
        title="Your notes"
        subtitle="Only you can see these. They travel with the run in an export."
      />

      <label className="block mb-3">
        <span className="sr-only">Notes on this run</span>
        <textarea
          aria-label="Notes on this run"
          className="input-field min-h-[6rem] resize-y"
          maxLength={MAX_NOTE_LENGTH}
          value={notes}
          placeholder="What would you tell yourself before playing this again?"
          onChange={(event) => {
            setNotes(event.target.value);
            setSaved(false);
          }}
        />
      </label>

      <div className="flex items-center gap-3 mb-5">
        <button
          type="button"
          className="btn-primary text-sm"
          onClick={saveNotes}
          disabled={savingNotes || !dirty}
        >
          {savingNotes ? 'Saving…' : 'Save note'}
        </button>
        <span className="text-xs text-text-muted">
          {notes.length} / {MAX_NOTE_LENGTH}
        </span>
        {saved && !dirty && <span className="text-xs text-accent-green">Saved</span>}
      </div>

      <div className="border-t border-bg-border pt-4">
        <h3 className="text-sm font-semibold text-text-secondary mb-2">Labels</h3>

        {tags.length === 0 ? (
          <p className="text-xs text-text-muted mb-3">
            No labels yet. Labels group runs together and can be filtered on the dashboard.
          </p>
        ) : (
          <ul className="flex flex-wrap gap-2 mb-3">
            {tags.map((tag) => (
              <li key={tag}>
                <Badge tone="info">
                  {tag}
                  <button
                    type="button"
                    onClick={() => removeTag(tag)}
                    aria-label={`Remove label ${tag}`}
                    className="ml-1 text-text-muted hover:text-accent-red"
                  >
                    ×
                  </button>
                </Badge>
              </li>
            ))}
          </ul>
        )}

        {tags.length < MAX_LABELS_PER_RUN && (
          <form onSubmit={addTag} className="flex gap-2">
            <input
              aria-label="New label"
              className="input-field py-1.5 text-sm max-w-[14rem]"
              value={draftTag}
              placeholder="practice"
              onChange={(event) => setDraftTag(event.target.value)}
            />
            <button type="submit" className="btn-ghost text-sm py-1.5 px-3">
              Add
            </button>
          </form>
        )}
      </div>

      {error !== null && (
        <div className="mt-4">
          <Notice tone="danger">{error}</Notice>
        </div>
      )}
    </Card>
  );
}
