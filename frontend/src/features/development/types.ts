export type DevelopmentStatus = 'Assigned' | 'Confirmed' | 'Awaiting verification' | 'Paid' | string;

export interface DevelopmentItem {
  id: string;
  title?: string | null;
  skill?: string | null;
  reason: string;
  assignedAt?: string | null;
  assigned_at?: string | null;
  price?: number | null;
  currency?: string | null;
  free?: boolean | null;
  eligibility?: string | null;
  availability?: string | null;
  status?: DevelopmentStatus | null;
  paymentLink?: string | null;
  payment_link?: string | null;
  reservationHeldUntil?: string | null;
  reservation_held_until?: string | null;
  paidReference?: string | null;
  note?: string | null;
  /** Returned by POST /me/development/{id}/register (FREE + PAID). */
  registrationId?: string | null;
}

export interface PaymentRecord {
  id: string;
  developmentId?: string | null;
  studentName?: string | null;
  amount?: number | null;
  currency?: string | null;
  reference?: string | null;
  status?: 'Pending' | 'Verified' | 'Rejected' | string;
  createdAt?: string | null;
  created_at?: string | null;
}
