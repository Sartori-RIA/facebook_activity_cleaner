import type { ActivityRecord } from '../types/activity.js';
import type { ProtectionMatchRecord } from '../database/repositories/protection.repository.js';

export interface ExportRow {
  id: string;
  type: string;
  status: string;
  date: string;
  precision: string;
  ownership: string;
  text: string;
  url: string;
  author: string;
  reasons: string;
}

function csvCell(value: string): string {
  let cell = value;
  if (/^[=+\-@]/.test(cell)) {
    cell = `'${cell}`;
  }
  if (/[",\n\r]/.test(cell)) {
    return `"${cell.replaceAll('"', '""')}"`;
  }
  return cell;
}

export function exportRow(
  activity: ActivityRecord,
  matches: readonly ProtectionMatchRecord[],
): ExportRow {
  return {
    id: activity.id,
    type: activity.activityType,
    status: activity.status,
    date: activity.occurredText ?? '',
    precision: activity.datePrecision,
    ownership: activity.ownership,
    text: activity.textPreview ?? '',
    url: activity.sourceUrl ?? '',
    author: activity.authorName ?? '',
    reasons: matches.map((match) => `${match.reasonCode}: ${match.detail}`).join(' | '),
  };
}

export function toJson(rows: readonly ExportRow[]): string {
  return `${JSON.stringify(rows, null, 2)}\n`;
}

export function toCsv(rows: readonly ExportRow[]): string {
  const headers: Array<keyof ExportRow> = [
    'id',
    'type',
    'status',
    'date',
    'precision',
    'ownership',
    'text',
    'url',
    'author',
    'reasons',
  ];
  const lines = [headers.join(',')];
  for (const row of rows) {
    lines.push(headers.map((header) => csvCell(row[header])).join(','));
  }
  return `${lines.join('\n')}\n`;
}
