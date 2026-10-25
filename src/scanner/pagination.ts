export interface ScrollState {
  pages: number;
  stagnation: number;
  lastSignature: string | null;
}

export interface ScrollLimits {
  maxStagnation: number;
  maxPages: number;
}

export interface ScrollDecision {
  state: ScrollState;
  stop: boolean;
  reason: 'end' | 'stagnation' | 'max_pages' | null;
}

export function initialScrollState(): ScrollState {
  return { pages: 0, stagnation: 0, lastSignature: null };
}

export function pageSignature(fingerprints: readonly string[]): string {
  return fingerprints.join('\n');
}

export function nextScrollState(
  state: ScrollState,
  page: { signature: string; inserted: number; endReached: boolean },
  limits: ScrollLimits,
): ScrollDecision {
  const repeated = state.lastSignature !== null && state.lastSignature === page.signature;
  const noProgress = page.inserted === 0 || repeated;
  const next: ScrollState = {
    pages: state.pages + 1,
    stagnation: noProgress ? state.stagnation + 1 : 0,
    lastSignature: page.signature,
  };
  if (page.endReached) {
    return { state: next, stop: true, reason: 'end' };
  }
  if (next.stagnation >= limits.maxStagnation) {
    return { state: next, stop: true, reason: 'stagnation' };
  }
  if (next.pages >= limits.maxPages) {
    return { state: next, stop: true, reason: 'max_pages' };
  }
  return { state: next, stop: false, reason: null };
}
