export type CommentBankScope = 'ADMIN_SHARED' | 'TEACHER_PRIVATE';

export interface CommentBankEntry {
  id: string;
  scope: CommentBankScope | string;
  criterionKey?: string | null;
  text: string;
  ownerId?: string;
  createdAt?: string;
}

export function isSharedScope(scope: string): boolean {
  return scope.toUpperCase() === 'ADMIN_SHARED' || scope.toLowerCase() === 'shared' || scope.toLowerCase() === 'admin';
}
