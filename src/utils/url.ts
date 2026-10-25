export function normalizeUrl(input: string | null | undefined): string | null {
  if (!input) {
    return null;
  }
  try {
    const url = new URL(input);
    const host = url.hostname.toLowerCase().replace(/^www\./, '');
    const path = url.pathname.replace(/\/+$/, '');
    return `${host}${path}`;
  } catch {
    return null;
  }
}

export function safeUrlForLog(input: string | null | undefined): string | null {
  if (!input) {
    return null;
  }
  try {
    const url = new URL(input);
    return `${url.origin}${url.pathname}`;
  } catch {
    return '[invalid-url]';
  }
}
