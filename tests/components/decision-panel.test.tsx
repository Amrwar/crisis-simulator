// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';

import { DecisionPanel } from '@/components/sim/DecisionPanel';

afterEach(cleanup);

const OPTIONS = [
  { id: 'A' as const, text: 'Renegotiate the supplier contract', risk: 'low' as const, tags: ['negotiate_supplier'] },
  { id: 'B' as const, text: 'Switch to a domestic supplier', risk: 'medium' as const, tags: ['switch_supplier'] },
  { id: 'C' as const, text: 'Take a bridging loan', risk: 'high' as const, tags: ['take_loan'] },
  { id: 'D' as const, text: 'Cut costs across the board', risk: 'medium' as const, tags: ['cut_costs', 'layoffs'] },
];

function show(props: Partial<Parameters<typeof DecisionPanel>[0]> = {}) {
  const onSubmit = props.onSubmit ?? vi.fn().mockResolvedValue(undefined);
  render(
    <DecisionPanel
      options={OPTIONS}
      onSubmit={onSubmit}
      loading={props.loading ?? false}
      disabled={props.disabled}
    />
  );
  return { onSubmit };
}

const submitButton = () => screen.getByRole('button', { name: /submit decision/i });

describe('DecisionPanel — presenting the options', () => {
  it('lists every option with its letter and wording', () => {
    show();
    for (const option of OPTIONS) {
      expect(screen.getByText(option.text), option.id).toBeTruthy();
      expect(screen.getByText(option.id), option.id).toBeTruthy();
    }
  });

  it('labels the risk of each option', () => {
    show();
    expect(screen.getByText('Low Risk')).toBeTruthy();
    expect(screen.getAllByText('Medium Risk')).toHaveLength(2);
    expect(screen.getByText('High Risk')).toBeTruthy();
  });

  it('shows the decision tags with readable spacing', () => {
    show();
    expect(screen.getByText('negotiate supplier')).toBeTruthy();
    expect(screen.getByText('cut costs')).toBeTruthy();
  });

  it('starts on the option chooser', () => {
    show();
    expect(screen.getByText('Choose Option')).toBeTruthy();
    expect(screen.queryByRole('textbox')).toBeNull();
  });
});

describe('DecisionPanel — choosing an option', () => {
  it('will not submit until an option is chosen', () => {
    const { onSubmit } = show();
    expect((submitButton() as HTMLButtonElement).disabled).toBe(true);

    fireEvent.click(submitButton());
    expect(onSubmit).not.toHaveBeenCalled();
  });

  it('submits the chosen option', async () => {
    const { onSubmit } = show();
    fireEvent.click(screen.getByText('Take a bridging loan'));

    expect((submitButton() as HTMLButtonElement).disabled).toBe(false);
    fireEvent.click(submitButton());

    await vi.waitFor(() => expect(onSubmit).toHaveBeenCalledWith({ optionId: 'C' }));
  });

  it('lets the player change their mind before submitting', async () => {
    const { onSubmit } = show();
    fireEvent.click(screen.getByText('Take a bridging loan'));
    fireEvent.click(screen.getByText('Renegotiate the supplier contract'));
    fireEvent.click(submitButton());

    await vi.waitFor(() => expect(onSubmit).toHaveBeenCalledWith({ optionId: 'A' }));
    expect(onSubmit).toHaveBeenCalledTimes(1);
  });

  it('clears the selection after a submission', async () => {
    const { onSubmit } = show();
    fireEvent.click(screen.getByText('Take a bridging loan'));
    fireEvent.click(submitButton());

    await vi.waitFor(() => expect(onSubmit).toHaveBeenCalledTimes(1));
    await vi.waitFor(() => expect((submitButton() as HTMLButtonElement).disabled).toBe(true));
  });
});

describe('DecisionPanel — writing a decision', () => {
  function switchToFreeText() {
    fireEvent.click(screen.getByText('Free Decision'));
  }

  it('offers a text area and a character counter', () => {
    show();
    switchToFreeText();
    expect(screen.getByRole('textbox')).toBeTruthy();
    expect(screen.getByText('Min 10 characters (0/10)')).toBeTruthy();
  });

  it('keeps submission closed below ten characters', () => {
    const { onSubmit } = show();
    switchToFreeText();
    fireEvent.change(screen.getByRole('textbox'), { target: { value: 'too short' } });

    expect(screen.getByText('Min 10 characters (9/10)')).toBeTruthy();
    expect((submitButton() as HTMLButtonElement).disabled).toBe(true);
    fireEvent.click(submitButton());
    expect(onSubmit).not.toHaveBeenCalled();
  });

  it('opens submission at ten characters', () => {
    show();
    switchToFreeText();
    fireEvent.change(screen.getByRole('textbox'), { target: { value: 'ten chars.' } });

    expect(screen.getByText('Ready to submit')).toBeTruthy();
    expect((submitButton() as HTMLButtonElement).disabled).toBe(false);
  });

  it('submits the trimmed wording', async () => {
    const { onSubmit } = show();
    switchToFreeText();
    fireEvent.change(screen.getByRole('textbox'), {
      target: { value: '   Renegotiate every supplier contract   ' },
    });
    fireEvent.click(submitButton());

    await vi.waitFor(() =>
      expect(onSubmit).toHaveBeenCalledWith({ freeText: 'Renegotiate every supplier contract' })
    );
  });

  it('treats whitespace-only text as empty', () => {
    show();
    switchToFreeText();
    fireEvent.change(screen.getByRole('textbox'), { target: { value: '              ' } });
    expect((submitButton() as HTMLButtonElement).disabled).toBe(true);
  });

  it('clears the text area after a submission', async () => {
    const { onSubmit } = show();
    switchToFreeText();
    fireEvent.change(screen.getByRole('textbox'), { target: { value: 'Renegotiate everything' } });
    fireEvent.click(submitButton());

    await vi.waitFor(() => expect(onSubmit).toHaveBeenCalledTimes(1));
    await vi.waitFor(() =>
      expect((screen.getByRole('textbox') as HTMLTextAreaElement).value).toBe('')
    );
  });

  it('returns to the option chooser on demand', () => {
    show();
    switchToFreeText();
    expect(screen.getByRole('textbox')).toBeTruthy();

    fireEvent.click(screen.getByText('Choose Option'));
    expect(screen.queryByRole('textbox')).toBeNull();
    expect(screen.getByText('Take a bridging loan')).toBeTruthy();
  });
});

describe('DecisionPanel — busy and locked states', () => {
  it('shows progress and blocks submission while a decision is in flight', () => {
    const { onSubmit } = show({ loading: true });
    fireEvent.click(screen.getByText('Take a bridging loan'));

    expect(screen.getByText('Processing decision…')).toBeTruthy();
    const button = screen.getByRole('button', { name: /processing decision/i }) as HTMLButtonElement;
    expect(button.disabled).toBe(true);
    fireEvent.click(button);
    expect(onSubmit).not.toHaveBeenCalled();
  });

  it('explains itself and accepts nothing once the turn is decided', () => {
    const { onSubmit } = show({ disabled: true });
    expect(screen.getByText('Decision already submitted for this turn')).toBeTruthy();

    fireEvent.click(screen.getByText('Take a bridging loan'));
    expect((submitButton() as HTMLButtonElement).disabled).toBe(true);
    fireEvent.click(submitButton());
    expect(onSubmit).not.toHaveBeenCalled();
  });
});
