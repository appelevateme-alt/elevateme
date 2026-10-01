// Privacy-safe analytics (Phase 6).
//
// Audit 2026-09-30: repo-wide search for analytics/tracking (gtag, posthog,
// mixpanel, amplitude, trackEvent) found NO analytics calls in frontend/src.
// No bodies, scores, names, DOB, or IDs are sent to any analytics endpoint
// today (API payloads carry scores/bodies only to the first-party backend
// under auth, never to a third-party tracker).
//
// This module is the ONLY approved analytics surface going forward. It allows
// aggregate, non-identifying events only. Forbidden: message bodies, scores,
// names, DOB, student/parent IDs, ElevateMe IDs, emails, photos, payment
// references, free-text. Callers must pass counts/enums/durations only.
// The backend never logs PII message text in audit/outbox (ids only).

export type SafeAnalyticsEvent =
  | 'page_view'
  | 'filter_change'
  | 'chart_toggle'
  | 'roster_search'
  | 'pagination_next'
  | 'dialog_open'
  | 'save_state';

export interface SafeAnalyticsPayload {
  /** Route without params/IDs, e.g. "/app/performance". Never include IDs. */
  route?: string;
  /** Coarse enum value, e.g. "bar" | "line" | "all" | "custom". No free text. */
  kind?: string;
  /** Aggregate count only (e.g. result count bucket), never row contents. */
  countBucket?: '<10' | '10-50' | '50+';
}

const ALLOWLIST: SafeAnalyticsEvent[] = [
  'page_view',
  'filter_change',
  'chart_toggle',
  'roster_search',
  'pagination_next',
  'dialog_open',
  'save_state',
];

function scrub(payload: SafeAnalyticsPayload = {}): SafeAnalyticsPayload {
  // Defensive: strip anything that looks like PII/IDs even if a caller passes it.
  const out: SafeAnalyticsPayload = {};
  if (payload.route && /^\/[a-z-/]*$/.test(payload.route) && !/\d/.test(payload.route)) {
    out.route = payload.route;
  }
  if (payload.kind && /^[a-z_-]{1,32}$/.test(payload.kind)) {
    out.kind = payload.kind;
  }
  if (payload.countBucket === '<10' || payload.countBucket === '10-50' || payload.countBucket === '50+') {
    out.countBucket = payload.countBucket;
  }
  return out;
}

/** No-op sink (no third-party tracker wired). Logs at debug in dev only. */
export function trackEvent(event: SafeAnalyticsEvent, payload: SafeAnalyticsPayload = {}): void {
  if (!ALLOWLIST.includes(event)) return;
  const safe = scrub(payload);
  if (import.meta.env.DEV) {
    // eslint-disable-next-line no-console
    console.debug('[analytics]', event, safe);
  }
}
