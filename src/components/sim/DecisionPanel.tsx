'use client';

import { useState } from 'react';

interface Option {
  id: 'A' | 'B' | 'C' | 'D';
  text: string;
  risk: 'low' | 'medium' | 'high';
  tags: string[];
}

interface DecisionPanelProps {
  options: Option[];
  onSubmit: (decision: { optionId?: 'A' | 'B' | 'C' | 'D'; freeText?: string }) => Promise<void>;
  loading: boolean;
  disabled?: boolean;
}

const RISK_META = {
  low: { label: 'Low Risk', color: 'text-accent-green', dot: 'bg-accent-green' },
  medium: { label: 'Medium Risk', color: 'text-accent-yellow', dot: 'bg-accent-yellow' },
  high: { label: 'High Risk', color: 'text-accent-red', dot: 'bg-accent-red' },
};

const OPTION_COLORS: Record<string, { base: string; selected: string }> = {
  A: {
    base: 'border-bg-border hover:border-accent-green/50 hover:bg-green-950/10',
    selected: 'border-accent-green bg-green-950/25',
  },
  B: {
    base: 'border-bg-border hover:border-accent-blue/50 hover:bg-blue-950/10',
    selected: 'border-accent-blue bg-blue-950/25',
  },
  C: {
    base: 'border-bg-border hover:border-accent-orange/50 hover:bg-orange-950/10',
    selected: 'border-accent-orange bg-orange-950/25',
  },
  D: {
    base: 'border-bg-border hover:border-accent-purple/50 hover:bg-purple-950/10',
    selected: 'border-accent-purple bg-purple-950/25',
  },
};

const OPTION_ID_COLORS: Record<string, string> = {
  A: 'text-accent-green bg-green-950/50 border-accent-green/40',
  B: 'text-accent-blue bg-blue-950/50 border-accent-blue/40',
  C: 'text-accent-orange bg-orange-950/50 border-accent-orange/40',
  D: 'text-accent-purple bg-purple-950/50 border-accent-purple/40',
};

export function DecisionPanel({ options, onSubmit, loading, disabled }: DecisionPanelProps) {
  const [selectedOption, setSelectedOption] = useState<'A' | 'B' | 'C' | 'D' | null>(null);
  const [freeText, setFreeText] = useState('');
  const [mode, setMode] = useState<'options' | 'freetext'>('options');

  const canSubmit =
    !loading &&
    !disabled &&
    (mode === 'options' ? selectedOption !== null : freeText.trim().length >= 10);

  async function handleSubmit() {
    if (!canSubmit) return;
    if (mode === 'options' && selectedOption) {
      await onSubmit({ optionId: selectedOption });
    } else if (mode === 'freetext') {
      await onSubmit({ freeText: freeText.trim() });
    }
    setSelectedOption(null);
    setFreeText('');
  }

  return (
    <div className="space-y-4">
      <div>
        <h3 className="text-base font-semibold text-text-primary">Your Decision</h3>
        <p className="text-xs text-text-muted mt-0.5">Choose an option or write your own strategy</p>
      </div>

      {/* Mode toggle */}
      <div className="flex rounded-lg overflow-hidden border border-bg-border">
        <button
          onClick={() => setMode('options')}
          className={`flex-1 text-sm py-2 transition-all ${
            mode === 'options'
              ? 'bg-accent-blue text-white font-medium'
              : 'bg-bg-secondary text-text-secondary hover:text-text-primary'
          }`}
        >
          Choose Option
        </button>
        <button
          onClick={() => setMode('freetext')}
          className={`flex-1 text-sm py-2 transition-all ${
            mode === 'freetext'
              ? 'bg-accent-blue text-white font-medium'
              : 'bg-bg-secondary text-text-secondary hover:text-text-primary'
          }`}
        >
          Free Decision
        </button>
      </div>

      {/* Options mode */}
      {mode === 'options' && (
        <div className="space-y-2">
          {options.map((option) => {
            const isSelected = selectedOption === option.id;
            const colors = OPTION_COLORS[option.id];
            const risk = RISK_META[option.risk];

            return (
              <button
                key={option.id}
                onClick={() => !disabled && setSelectedOption(option.id)}
                disabled={disabled}
                className={`w-full text-left rounded-lg border p-4 transition-all duration-150 ${
                  isSelected ? colors.selected : colors.base
                } ${disabled ? 'opacity-50 cursor-not-allowed' : 'cursor-pointer'}`}
              >
                <div className="flex items-start gap-3">
                  {/* Option letter */}
                  <span
                    className={`flex-shrink-0 w-7 h-7 rounded border text-xs font-bold flex items-center justify-center ${OPTION_ID_COLORS[option.id]}`}
                  >
                    {option.id}
                  </span>

                  <div className="flex-1 min-w-0">
                    <p className="text-sm text-text-primary leading-snug">{option.text}</p>

                    <div className="mt-2 flex flex-wrap items-center gap-2">
                      {/* Risk level */}
                      <span className={`flex items-center gap-1 text-xs ${risk.color}`}>
                        <span className={`w-1.5 h-1.5 rounded-full ${risk.dot}`} />
                        {risk.label}
                      </span>

                      {/* Tags */}
                      {option.tags.slice(0, 3).map((tag) => (
                        <span key={tag} className="tag-badge">
                          {tag.replace(/_/g, ' ')}
                        </span>
                      ))}
                    </div>
                  </div>
                </div>
              </button>
            );
          })}
        </div>
      )}

      {/* Free text mode */}
      {mode === 'freetext' && (
        <div className="space-y-2">
          <textarea
            value={freeText}
            onChange={(e) => setFreeText(e.target.value)}
            disabled={disabled}
            className="input-field min-h-[140px] resize-none text-sm leading-relaxed"
            placeholder="Describe your decision in detail. E.g. 'I want to negotiate with our supplier for better terms while investing in a small marketing push to hold market share...'"
          />
          <p className="text-xs text-text-muted">
            The AI will analyze your text and extract decision tags automatically.{' '}
            {freeText.length >= 10 ? (
              <span className="text-accent-green">Ready to submit</span>
            ) : (
              <span>Min 10 characters ({freeText.length}/10)</span>
            )}
          </p>
        </div>
      )}

      {/* Submit */}
      <button
        onClick={handleSubmit}
        disabled={!canSubmit}
        className="btn-primary w-full py-3 rounded-xl text-sm font-semibold"
      >
        {loading ? (
          <span className="flex items-center justify-center gap-2">
            <svg className="animate-spin h-4 w-4" viewBox="0 0 24 24" fill="none">
              <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
              <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8v8H4z" />
            </svg>
            Processing decision…
          </span>
        ) : (
          'Submit Decision →'
        )}
      </button>

      {disabled && (
        <p className="text-xs text-text-muted text-center">
          Decision already submitted for this turn
        </p>
      )}
    </div>
  );
}
