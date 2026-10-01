export interface TargetPreview { count: number; deduped: number; pinned: string[]; }
export const PIN_MAX = 3;
export function dedupe(ids: string[]): string[] { return [...new Set(ids)]; }
