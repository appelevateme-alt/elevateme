// Typed /api/v1 client. JWT attach, error mapping, Idempotency-Key header.
// Same-origin: uses VITE_API_BASE (default /api/v1) with credentials:include for guest cookies.

import { getAccessToken } from './supabase';

export interface FieldError { field: string; message: string }
export interface ApiErrorShape { code: string; message: string; fieldErrors?: FieldError[]; requestId?: string }

export class ApiError extends Error {
  status: number;
  code: string;
  fieldErrors: FieldError[];
  requestId?: string;
  constructor(status: number, shape: ApiErrorShape) {
    super(shape.message);
    this.status = status;
    this.code = shape.code;
    this.fieldErrors = shape.fieldErrors ?? [];
    this.requestId = shape.requestId;
  }
}

const BASE = (import.meta.env.VITE_API_BASE as string | undefined) ?? '/api/v1';

async function getToken(): Promise<string | null> {
  try { return await getAccessToken(); } catch { return null; }
}

function getViewModeHeader(): Record<string, string> {
  try {
    const v = localStorage.getItem('em:view-preference');
    if (v === 'parent' || v === 'student') {
      // Informational only — server ignores it for authorization (ScopeGuard).
      return { 'X-View-Mode': v };
    }
  } catch { /* noop */ }
  return {};
}

export interface RequestOpts extends RequestInit {
  idempotencyKey?: string;
}

/**
 * Phase 1c error mapping (used by router guards + pages):
 *  401 => re-auth (redirect /sign-in?next=<returnUrl>)
 *  403 => PermissionDenied state (or ACCOUNT_PENDING => /account/pending)
 *  404 => NotFound state (cross-student reads use 404 to avoid enumeration)
 */
export type ApiErrorState = 'reauth' | 'pending' | 'denied' | 'notfound' | 'other';

export function toErrorState(status: number, code?: string): ApiErrorState {
  if (status === 401) return 'reauth';
  if (status === 403 && code === 'ACCOUNT_PENDING') return 'pending';
  if (status === 403) return 'denied';
  if (status === 404) return 'notfound';
  return 'other';
}

export function toErrorStateFrom(error: unknown): ApiErrorState {
  if (error instanceof ApiError) return toErrorState(error.status, error.code);
  return 'other';
}

export async function api<T>(path: string, opts: RequestOpts = {}): Promise<T> {
  const token = await getToken();
  const headers: Record<string, string> = {
    'Content-Type': 'application/json',
    ...getViewModeHeader(),
    ...((opts.headers as Record<string, string> | undefined) ?? {})
  };
  if (token) headers['Authorization'] = `Bearer ${token}`;
  // Backend reads `@RequestHeader("Idempotency-Key")` — exact casing matters.
  if (opts.idempotencyKey) headers['Idempotency-Key'] = opts.idempotencyKey;

  const res = await fetch(`${BASE}${path}`, {
    ...opts,
    headers,
    credentials: 'include'
  });

  if (res.status === 204) return undefined as unknown as T;
  const body = await res.json().catch(() => ({}));

  if (!res.ok) {
    const map: Record<number, string> = {
      401: 'UNAUTHENTICATED', 403: 'FORBIDDEN', 404: 'NOT_FOUND',
      409: 'CONFLICT', 422: 'VALIDATION', 429: 'RATE_LIMITED'
    };
    throw new ApiError(res.status, {
      code: (body as ApiErrorShape).code ?? map[res.status] ?? 'UNKNOWN',
      message: (body as ApiErrorShape).message ?? `Request failed (${res.status})`,
      fieldErrors: (body as ApiErrorShape).fieldErrors,
      requestId: (body as ApiErrorShape).requestId ?? res.headers.get('x-request-id') ?? undefined
    });
  }
  return body as T;
}

export const get = <T,>(p: string, o?: RequestOpts) => api<T>(p, { ...o, method: 'GET' });
export const post = <T,>(p: string, data?: unknown, o?: RequestOpts) =>
  api<T>(p, { ...o, method: 'POST', body: data === undefined ? undefined : JSON.stringify(data) });
export const patch = <T,>(p: string, data?: unknown, o?: RequestOpts) =>
  api<T>(p, { ...o, method: 'PATCH', body: data === undefined ? undefined : JSON.stringify(data) });
export const del = <T,>(p: string, o?: RequestOpts) => api<T>(p, { ...o, method: 'DELETE' });
