import { describe, it, expect } from 'vitest';
import {
  applySuggestion,
  pushHistory,
  navigateHistoryUp,
  navigateHistoryDown,
  MAX_HISTORY,
  type HistoryState,
} from './palette-logic.js';

describe('applySuggestion', () => {
  it('appends a suggestion plus trailing space to an empty input', () => {
    expect(applySuggestion('', 'check')).toBe('check ');
  });

  it('appends a suggestion after a completed token', () => {
    expect(applySuggestion('check ', '--fix')).toBe('check --fix ');
  });

  it('replaces the in-progress token when there is no trailing space', () => {
    expect(applySuggestion('check --f', '--fix')).toBe('check --fix ');
  });

  it('replaces only the last token, keeping earlier ones intact', () => {
    expect(applySuggestion('check --fix --for', '--format')).toBe('check --fix --format ');
  });
});

describe('pushHistory', () => {
  it('appends a new entry', () => {
    expect(pushHistory(['a'], 'b')).toEqual(['a', 'b']);
  });

  it('caps history at MAX_HISTORY entries, dropping the oldest', () => {
    const history = Array.from({ length: MAX_HISTORY }, (_, i) => `cmd${i}`);
    const next = pushHistory(history, 'newest');
    expect(next).toHaveLength(MAX_HISTORY);
    expect(next[0]).toBe('cmd1');
    expect(next[next.length - 1]).toBe('newest');
  });
});

describe('history navigation', () => {
  const history = ['check --fix', 'drift --json', 'baseline update'];

  it('up arrow recalls the most recent command first', () => {
    const initial: HistoryState = { value: 'partial', historyIndex: null, draft: '' };
    const state = navigateHistoryUp(history, initial);
    expect(state.value).toBe('baseline update');
    expect(state.historyIndex).toBe(2);
    expect(state.draft).toBe('partial'); // saved so we can restore it later
  });

  it('repeated up arrow cycles further back through history', () => {
    let state: HistoryState = { value: '', historyIndex: null, draft: '' };
    state = navigateHistoryUp(history, state);
    state = navigateHistoryUp(history, state);
    state = navigateHistoryUp(history, state);
    expect(state.value).toBe('check --fix');
    expect(state.historyIndex).toBe(0);
  });

  it('up arrow at the oldest entry stays put', () => {
    let state: HistoryState = { value: '', historyIndex: null, draft: '' };
    for (let i = 0; i < 5; i++) state = navigateHistoryUp(history, state);
    expect(state.value).toBe('check --fix');
    expect(state.historyIndex).toBe(0);
  });

  it('down arrow cycles forward and restores the draft past the newest entry', () => {
    let state: HistoryState = { value: 'typing…', historyIndex: null, draft: '' };
    state = navigateHistoryUp(history, state); // -> baseline update, draft saved
    state = navigateHistoryDown(history, state);
    expect(state.value).toBe('typing…');
    expect(state.historyIndex).toBeNull();
  });

  it('down arrow with no active history browse is a no-op', () => {
    const initial: HistoryState = { value: 'typing…', historyIndex: null, draft: '' };
    const state = navigateHistoryDown(history, initial);
    expect(state).toEqual(initial);
  });

  it('up arrow on empty history is a no-op', () => {
    const initial: HistoryState = { value: '', historyIndex: null, draft: '' };
    const state = navigateHistoryUp([], initial);
    expect(state).toEqual(initial);
  });
});
