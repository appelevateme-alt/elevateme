export interface GuestExchange { token: string; }
export function extractFragmentToken(hash: string): string | null {
  const m = hash.match(/t=([^&]+)/);
  return m ? decodeURIComponent(m[1]) : null;
}

/** Full fragment string expected by POST /guest/exchange (never logged). */
export function buildExchangeFragment(hash: string): string | null {
  if (!hash) return null;
  const token = extractFragmentToken(hash);
  if (!token) return null;
  return hash.startsWith('#') ? hash : `#${hash}`;
}

/** Strip the token from the URL without leaking it (history.replaceState cleanup). */
export function cleanedGuestUrl(href: string): string {
  const u = new URL(href);
  u.hash = '';
  return u.toString();
}

export function isExpiredOrRevoked(status: number, code?: string): boolean {
  if (status === 401 || status === 410) return true;
  const c = (code ?? '').toUpperCase();
  return c.includes('EXPIRED') || c.includes('REVOKED') || c.includes('INVALID');
}
