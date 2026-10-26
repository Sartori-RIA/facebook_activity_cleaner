import type { ActivityCard, Overview, PreviewResult, ScanResult } from './types';

export class ApiError extends Error {
  readonly code: string | null;

  constructor(message: string, code: string | null = null) {
    super(message);
    this.code = code;
  }
}

async function request<T>(path: string, body?: unknown): Promise<T> {
  const response = await fetch(path, {
    method: body === undefined ? 'GET' : 'POST',
    headers: {
      'content-type': 'application/json',
      'x-fb-cleaner': '1',
    },
    body: body === undefined ? undefined : JSON.stringify(body),
  });
  if (response.headers.get('content-type')?.includes('application/json')) {
    const payload = (await response.json()) as T & { error?: string; code?: string };
    if (!response.ok) {
      throw new ApiError(payload.error ?? '', payload.code ?? null);
    }
    return payload;
  }
  if (!response.ok) {
    throw new ApiError('', 'generic');
  }
  return undefined as T;
}

export const api = {
  overview: () => request<Overview>('/api/overview'),
  saveAccount: (body: { name: string; profileUrl?: string }) =>
    request<{ account: { name: string; profileUrl: string | null } | null }>('/api/account', body),
  activities: (year: number) =>
    request<{ activities: ActivityCard[] }>(`/api/activities?year=${year}`),
  addPerson: (body: { name: string; relationship?: string; profileUrl?: string }) =>
    request<{ id: string; name: string }>('/api/protection/person', body),
  addKeyword: (keyword: string) => request<{ ok: boolean }>('/api/protection/keyword', { keyword }),
  scan: (body: Record<string, unknown>) => request<ScanResult>('/api/scan', body),
  resume: () =>
    request<{ recovered: { reviewed: string[]; requeued: string[] }; summary: ScanResult | null }>(
      '/api/resume',
      {},
    ),
  review: (body: {
    id: string;
    decision: 'protect' | 'approve_deletion' | 'skip';
    note?: string;
  }) => request<{ id: string; status: string; outcome: string }>('/api/review', body),
  preview: (body: Record<string, unknown>) => request<PreviewResult>('/api/delete/preview', body),
};
