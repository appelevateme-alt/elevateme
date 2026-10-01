// UTC store, Asia/Colombo display. Custom inclusive -> half-open UTC.
// Half-open: [startUTC, endUTC) where end = inclusiveEnd + 1 day at 00:00 Colombo.

const COLOMBO = 'Asia/Colombo';

export function toColomboDisplay(isoUTC: string): string {
  const d = new Date(isoUTC);
  return new Intl.DateTimeFormat('en-GB', {
    timeZone: COLOMBO, year: 'numeric', month: 'short', day: '2-digit'
  }).format(d);
}

export function toColomboDateTime(isoUTC: string): string {
  const d = new Date(isoUTC);
  return new Intl.DateTimeFormat('en-GB', {
    timeZone: COLOMBO, year: 'numeric', month: 'short', day: '2-digit',
    hour: '2-digit', minute: '2-digit', hour12: false
  }).format(d);
}

/** Convert inclusive YYYY-MM-DD range (Colombo) to half-open UTC ISO pair. */
export function inclusiveToHalfOpenUTC(startInclusive: string, endInclusive: string): { startUTC: string; endUTC: string } {
  // Interpret midnight Colombo as +05:30 offset (no DST).
  const startUTC = new Date(`${startInclusive}T00:00:00+05:30`).toISOString();
  const endDate = new Date(`${endInclusive}T00:00:00+05:30`);
  endDate.setDate(endDate.getDate() + 1);
  return { startUTC, endUTC: endDate.toISOString() };
}

export type PeriodKey = 'last4w' | '3m' | 'all' | 'custom';

export function periodToRange(period: PeriodKey, custom?: { start: string; end: string }, now = new Date()): { startUTC: string; endUTC: string } | null {
  if (period === 'all') return null;
  if (period === 'custom' && custom) return inclusiveToHalfOpenUTC(custom.start, custom.end);
  const days = period === 'last4w' ? 28 : 90;
  const endUTC = now.toISOString();
  const startUTC = new Date(now.getTime() - days * 86400000).toISOString();
  return { startUTC, endUTC };
}
