import { get } from '../../lib/api';

export interface StudentProfile {
  id: string;
  elevateMeId?: string | null;
  displayName?: string | null;
  email?: string | null;
  instituteId?: string | null;
  institute?: string | null;
  photoKey?: string | null;
  photo?: string | null;
  roles?: string[];
  status?: string | null;
}

export interface StudentHistoryItem {
  id: string;
  programName?: string | null;
  sessionName?: string | null;
  status?: string | null;
  completedAt?: string | null;
  total?: number | null;
}

function normalizeProfile(raw: Record<string, unknown>, fallbackId: string): StudentProfile {
  return {
    id: String(raw['id'] ?? fallbackId),
    elevateMeId: (raw['elevateMeId'] as string | null | undefined) ?? (raw['elevate_me_id'] as string | null | undefined) ?? null,
    displayName: (raw['displayName'] as string | null | undefined) ?? (raw['display_name'] as string | null | undefined) ?? null,
    email: (raw['email'] as string | null | undefined) ?? null,
    instituteId: (raw['instituteId'] as string | null | undefined) ?? (raw['institute_id'] as string | null | undefined) ?? null,
    institute: (raw['institute'] as string | null | undefined) ?? null,
    photoKey: (raw['photoKey'] as string | null | undefined) ?? null,
    photo: (raw['photo'] as string | null | undefined) ?? null,
    roles: (raw['roles'] as string[] | undefined) ?? undefined,
    status: (raw['status'] as string | null | undefined) ?? null,
  };
}

/**
 * Student lookup (staff + admin).
 *
 * Tries scoped roster-backed endpoints first; falls back to an explicit
 * "not found / no access" null (never invents a profile). Cross-student reads
 * that the server denies surface as 404 to avoid enumeration.
 */
export async function getStudentProfile(id: string): Promise<StudentProfile | null> {
  const attempts = [`/students/${encodeURIComponent(id)}`, `/admin/users/${encodeURIComponent(id)}`];
  for (const path of attempts) {
    try {
      const raw = await get<Record<string, unknown>>(path);
      if (raw && (raw['id'] || raw['displayName'] || raw['display_name'])) {
        return normalizeProfile(raw, id);
      }
    } catch {
      continue;
    }
  }
  return null;
}

/** Released reports visible to staff for this student (best-effort, empty when unavailable). */
export async function listStudentReports(studentId: string): Promise<Array<Record<string, unknown>>> {
  const attempts = [
    `/students/${encodeURIComponent(studentId)}/reports`,
    `/admin/users/${encodeURIComponent(studentId)}/reports`,
  ];
  for (const path of attempts) {
    try {
      const res = await get<Array<Record<string, unknown>> | { items?: Array<Record<string, unknown>> }>(path);
      return Array.isArray(res) ? res : (res.items ?? []);
    } catch {
      continue;
    }
  }
  return [];
}

/** Completion history (programs attended) — best-effort, empty when unavailable. */
export async function listStudentHistory(studentId: string): Promise<StudentHistoryItem[]> {
  const attempts = [
    `/students/${encodeURIComponent(studentId)}/history`,
    `/students/${encodeURIComponent(studentId)}/programs`,
  ];
  for (const path of attempts) {
    try {
      const res = await get<StudentHistoryItem[] | { items?: StudentHistoryItem[] }>(path);
      return Array.isArray(res) ? res : (res.items ?? []);
    } catch {
      continue;
    }
  }
  return [];
}

/** Searchable lookup for the recommendation composer (roster-backed, server-scoped). */
export async function searchStudents(q: string, limit = 8): Promise<StudentProfile[]> {
  const query = q.trim();
  if (!query) return [];
  const attempts = [
    `/students?q=${encodeURIComponent(query)}&limit=${limit}`,
    `/admin/users?q=${encodeURIComponent(query)}&limit=${limit}`,
  ];
  for (const path of attempts) {
    try {
      const res = await get<StudentProfile[] | { items?: StudentProfile[] }>(path);
      const items = Array.isArray(res) ? res : (res.items ?? []);
      if (items.length > 0) return items.slice(0, limit);
    } catch {
      continue;
    }
  }
  return [];
}
