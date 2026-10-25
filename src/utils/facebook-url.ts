const SESSION_MARKERS = ['c_user=', 'xs=', 'datr=', 'sb=', 'fr=', 'password='];

export function publicFacebookUrl(raw: string | null | undefined): string | null {
  if (!raw || !raw.trim()) {
    return null;
  }
  const lower = raw.toLowerCase();
  if (SESSION_MARKERS.some((marker) => lower.includes(marker))) {
    return null;
  }
  let url: URL;
  try {
    url = new URL(raw);
  } catch {
    return null;
  }
  const host = url.hostname.toLowerCase().replace(/^www\./, '');
  const facebookHost =
    host === 'facebook.com' ||
    host.endsWith('.facebook.com') ||
    host === 'fb.com' ||
    host.endsWith('.fb.com');
  if (url.protocol !== 'https:' || !facebookHost) {
    return null;
  }
  url.searchParams.delete('fbclid');
  url.hash = '';
  return url.toString();
}
