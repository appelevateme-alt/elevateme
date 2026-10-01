import type { DevelopmentItem, PaymentRecord } from './types';

/** Reservation hold window in hours (matches 48h registration convention). */
export const HOLD_HOURS = 48;

export function isFree(item: Pick<DevelopmentItem, 'price' | 'free'>): boolean {
  if (item.free === true) return true;
  if (item.free === false) return false;
  return (item.price ?? 0) <= 0;
}

export function priceLabel(item: Pick<DevelopmentItem, 'price' | 'currency' | 'free'>): string {
  if (isFree(item)) return 'Free';
  const cur = item.currency ?? 'LKR';
  return `${cur} ${(item.price ?? 0).toLocaleString('en-LK')}`;
}

export function heldUntilOf(item: DevelopmentItem): string | null {
  return item.reservationHeldUntil ?? item.reservation_held_until ?? null;
}

/** Hours since creation — payment hold / pending age math. */
export function pendingAgeHours(createdAt: string | null | undefined, now: Date = new Date()): number {
  if (!createdAt) return 0;
  const t = Date.parse(String(createdAt));
  if (Number.isNaN(t)) return 0;
  return Math.max(0, (now.getTime() - t) / 3600000);
}

export function pendingAgeLabel(createdAt: string | null | undefined, now: Date = new Date()): string {
  const h = pendingAgeHours(createdAt, now);
  if (h < 1) return `${Math.max(0, Math.round(h * 60))}m pending`;
  if (h < 24) return `${Math.floor(h)}h pending`;
  const d = Math.floor(h / 24);
  return `${d}d ${Math.floor(h % 24)}h pending`;
}

/** Reservation expiry = created + hold window (or explicit held-until when present). */
export function reservationExpiry(
  createdAt: string | null | undefined,
  holdHours = HOLD_HOURS,
  explicitHeldUntil?: string | null,
): Date | null {
  if (explicitHeldUntil) {
    const t = Date.parse(String(explicitHeldUntil));
    return Number.isNaN(t) ? null : new Date(t);
  }
  if (!createdAt) return null;
  const t = Date.parse(String(createdAt));
  if (Number.isNaN(t)) return null;
  return new Date(t + holdHours * 3600000);
}

export function isReservationExpired(
  createdAt: string | null | undefined,
  now: Date = new Date(),
  holdHours = HOLD_HOURS,
  explicitHeldUntil?: string | null,
): boolean {
  const exp = reservationExpiry(createdAt, holdHours, explicitHeldUntil);
  if (!exp) return false;
  return now.getTime() > exp.getTime();
}

export function holdRemainingLabel(
  createdAt: string | null | undefined,
  now: Date = new Date(),
  holdHours = HOLD_HOURS,
  explicitHeldUntil?: string | null,
): string | null {
  const exp = reservationExpiry(createdAt, holdHours, explicitHeldUntil);
  if (!exp) return null;
  const ms = exp.getTime() - now.getTime();
  if (ms <= 0) return 'Reservation expired — contact the office to re-reserve.';
  const h = Math.floor(ms / 3600000);
  if (h < 24) return `Reservation held for ${h}h more (expires in under a day).`;
  return `Reservation held for ${Math.floor(h / 24)}d ${h % 24}h more.`;
}

export function externalPaymentLink(item: DevelopmentItem): string | null {
  return item.paymentLink ?? item.payment_link ?? null;
}

export function paymentPendingAge(p: PaymentRecord, now: Date = new Date()): string {
  return pendingAgeLabel(p.createdAt ?? p.created_at ?? null, now);
}
