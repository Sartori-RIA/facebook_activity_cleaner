import type { DeletionProgress } from '../deletion/deletion-engine.js';

export function formatDuration(ms: number): string {
  const totalSeconds = Math.max(0, Math.round(ms / 1000));
  const hours = Math.floor(totalSeconds / 3600);
  const minutes = Math.floor((totalSeconds % 3600) / 60);
  const seconds = totalSeconds % 60;
  const pad = (value: number) => String(value).padStart(2, '0');
  if (hours > 0) {
    return `${hours}:${pad(minutes)}:${pad(seconds)}`;
  }
  return `${minutes}:${pad(seconds)}`;
}

export function formatDeletionProgress(event: DeletionProgress): string {
  const step = `${event.index}/${event.total}`;
  const elapsed = `Elapsed ${formatDuration(event.elapsedMs)}.`;
  if (event.phase === 'opening') {
    return `${step} opening. ${elapsed}`;
  }
  const outcome = event.outcome === 'requires_review' ? 'needs review' : (event.outcome ?? 'done');
  const left =
    event.remainingMs && event.remainingMs > 0
      ? ` About ${formatDuration(event.remainingMs)} left.`
      : '';
  return `${step} ${outcome}. ${elapsed}${left}`;
}
