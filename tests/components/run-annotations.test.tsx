// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { RunAnnotations } from '@/components/sim/RunAnnotations';
import { MAX_LABELS_PER_RUN } from '@/lib/annotations';

afterEach(cleanup);

/**
 * The component talks to the API, so `fetch` is replaced per test. The suite's
 * network guard makes a real request throw, so an un-stubbed call fails loudly
 * rather than reaching anything.
 */
function stubFetch(handler: (url: string, init?: RequestInit) => unknown) {
  const spy = vi.fn(async (url: string, init?: RequestInit) => {
    return {
      ok: true,
      status: 200,
      json: async () => ({ success: true, data: handler(url, init) }),
    } as unknown as Response;
  });

  globalThis.fetch = spy as unknown as typeof fetch;
  return spy;
}

function stubFailure(error: string, status = 400) {
  const spy = vi.fn(async () => {
    return {
      ok: false,
      status,
      json: async () => ({ success: false, error }),
    } as unknown as Response;
  });

  globalThis.fetch = spy as unknown as typeof fetch;
  return spy;
}

function show(notes = '', tags: string[] = []) {
  return render(<RunAnnotations simulationId="sim-1" initialNotes={notes} initialTags={tags} />);
}

beforeEach(() => {
  stubFetch(() => ({ notes: '', tags: [] }));
});

describe('RunAnnotations — the note', () => {
  it('shows the note the run already carries', () => {
    show('Cut costs earlier.');
    expect((screen.getByLabelText('Notes on this run') as HTMLTextAreaElement).value).toBe(
      'Cut costs earlier.'
    );
  });

  it('starts with the save button disabled, since nothing has changed', () => {
    show('Existing note');
    expect((screen.getByRole('button', { name: 'Save note' }) as HTMLButtonElement).disabled).toBe(
      true
    );
  });

  it('enables saving once the note is edited', () => {
    show('Existing note');
    fireEvent.change(screen.getByLabelText('Notes on this run'), { target: { value: 'Changed' } });

    expect((screen.getByRole('button', { name: 'Save note' }) as HTMLButtonElement).disabled).toBe(
      false
    );
  });

  it('sends the note to the run own endpoint', async () => {
    const spy = stubFetch(() => ({ notes: 'Changed' }));
    show('Existing');

    fireEvent.change(screen.getByLabelText('Notes on this run'), { target: { value: 'Changed' } });
    fireEvent.click(screen.getByRole('button', { name: 'Save note' }));

    await waitFor(() => expect(spy).toHaveBeenCalled());
    const [url, init] = spy.mock.calls[0];
    expect(url).toBe('/api/simulations/sim-1/notes');
    expect(init?.method).toBe('PATCH');
    expect(JSON.parse(String(init?.body))).toEqual({ note: 'Changed' });
  });

  it('adopts the value the server stored, not the one that was typed', async () => {
    stubFetch(() => ({ notes: 'trimmed' }));
    show('');

    fireEvent.change(screen.getByLabelText('Notes on this run'), {
      target: { value: '   trimmed   ' },
    });
    fireEvent.click(screen.getByRole('button', { name: 'Save note' }));

    await waitFor(() =>
      expect((screen.getByLabelText('Notes on this run') as HTMLTextAreaElement).value).toBe(
        'trimmed'
      )
    );
  });

  it('confirms the save', async () => {
    stubFetch(() => ({ notes: 'Changed' }));
    show('');

    fireEvent.change(screen.getByLabelText('Notes on this run'), { target: { value: 'Changed' } });
    fireEvent.click(screen.getByRole('button', { name: 'Save note' }));

    await waitFor(() => expect(screen.getByText('Saved')).toBeTruthy());
  });

  it('shows the character count', () => {
    show('12345');
    expect(screen.getByText(/^5 \/ /)).toBeTruthy();
  });

  it('reports a failure and keeps what was typed', async () => {
    stubFailure('Invalid input');
    show('');

    fireEvent.change(screen.getByLabelText('Notes on this run'), { target: { value: 'Attempt' } });
    fireEvent.click(screen.getByRole('button', { name: 'Save note' }));

    await waitFor(() => expect(screen.getByText('Invalid input')).toBeTruthy());
    expect((screen.getByLabelText('Notes on this run') as HTMLTextAreaElement).value).toBe(
      'Attempt'
    );
  });
});

describe('RunAnnotations — labels', () => {
  it('invites a first label when the run carries none', () => {
    show('', []);
    expect(screen.getByText(/No labels yet/)).toBeTruthy();
  });

  it('lists the labels the run carries', () => {
    show('', ['practice', 'for-class']);

    expect(screen.getByText('practice')).toBeTruthy();
    expect(screen.getByText('for-class')).toBeTruthy();
    expect(screen.queryByText(/No labels yet/)).toBeNull();
  });

  it('adds a label through the API and shows the returned list', async () => {
    const spy = stubFetch(() => ({ tags: ['practice'] }));
    show('', []);

    fireEvent.change(screen.getByLabelText('New label'), { target: { value: 'practice' } });
    fireEvent.click(screen.getByRole('button', { name: 'Add' }));

    await waitFor(() => expect(screen.getByText('practice')).toBeTruthy());
    const [url, init] = spy.mock.calls[0];
    expect(url).toBe('/api/simulations/sim-1/tags');
    expect(init?.method).toBe('POST');
  });

  it('clears the box after adding', async () => {
    stubFetch(() => ({ tags: ['practice'] }));
    show('', []);

    fireEvent.change(screen.getByLabelText('New label'), { target: { value: 'practice' } });
    fireEvent.click(screen.getByRole('button', { name: 'Add' }));

    await waitFor(() =>
      expect((screen.getByLabelText('New label') as HTMLInputElement).value).toBe('')
    );
  });

  it('does not call the API for an empty label', () => {
    const spy = stubFetch(() => ({ tags: [] }));
    show('', []);

    fireEvent.click(screen.getByRole('button', { name: 'Add' }));
    expect(spy).not.toHaveBeenCalled();
  });

  it('removes a label through the API', async () => {
    const spy = stubFetch(() => ({ tags: [] }));
    show('', ['practice']);

    fireEvent.click(screen.getByRole('button', { name: 'Remove label practice' }));

    await waitFor(() => expect(screen.queryByText('practice')).toBeNull());
    const [url, init] = spy.mock.calls[0];
    expect(url).toContain('/api/simulations/sim-1/tags?label=practice');
    expect(init?.method).toBe('DELETE');
  });

  it('hides the add box once the run is at its label limit', () => {
    show('', Array.from({ length: MAX_LABELS_PER_RUN }, (_, i) => `label-${i}`));
    expect(screen.queryByLabelText('New label')).toBeNull();
  });

  it('still offers the add box one below the limit', () => {
    show('', Array.from({ length: MAX_LABELS_PER_RUN - 1 }, (_, i) => `label-${i}`));
    expect(screen.getByLabelText('New label')).toBeTruthy();
  });

  it('reports a refused label without adding it', async () => {
    stubFailure('A label needs at least one letter or digit');
    show('', []);

    fireEvent.change(screen.getByLabelText('New label'), { target: { value: '!!!' } });
    fireEvent.click(screen.getByRole('button', { name: 'Add' }));

    await waitFor(() =>
      expect(screen.getByText('A label needs at least one letter or digit')).toBeTruthy()
    );
    expect(screen.getByText(/No labels yet/)).toBeTruthy();
  });
});
