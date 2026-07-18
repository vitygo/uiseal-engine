// Pure input-editing helpers for CommandPalette, split out so they're
// testable without rendering Ink (no ink-testing-library in this repo).

export function applySuggestion(value: string, suggestion: string): string {
  const endsWithSpace = value.length === 0 || /\s$/.test(value);
  if (endsWithSpace) return `${value}${suggestion} `;
  const idx = value.lastIndexOf(' ');
  const prefix = idx === -1 ? '' : value.slice(0, idx + 1);
  return `${prefix}${suggestion} `;
}

export const MAX_HISTORY = 10;

export function pushHistory(history: string[], line: string): string[] {
  return [...history, line].slice(-MAX_HISTORY);
}

export interface HistoryState {
  value: string;
  historyIndex: number | null;
  draft: string;
}

export function navigateHistoryUp(history: string[], state: HistoryState): HistoryState {
  if (history.length === 0) return state;
  if (state.historyIndex === null) {
    const index = history.length - 1;
    return { value: history[index]!, historyIndex: index, draft: state.value };
  }
  const index = Math.max(0, state.historyIndex - 1);
  return { value: history[index]!, historyIndex: index, draft: state.draft };
}

export function navigateHistoryDown(history: string[], state: HistoryState): HistoryState {
  if (state.historyIndex === null) return state;
  if (state.historyIndex >= history.length - 1) {
    return { value: state.draft, historyIndex: null, draft: state.draft };
  }
  const index = state.historyIndex + 1;
  return { value: history[index]!, historyIndex: index, draft: state.draft };
}
