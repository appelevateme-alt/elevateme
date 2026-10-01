import { get, post } from '../../lib/api';
import type { CommentBankEntry, CommentBankScope } from './types';

export async function listCommentBank(criterionKey?: string): Promise<CommentBankEntry[]> {
  const qs = criterionKey ? `?criterionKey=${encodeURIComponent(criterionKey)}` : '';
  const res = await get<CommentBankEntry[] | { items: CommentBankEntry[] }>(`/comment-bank${qs}`);
  if (Array.isArray(res)) return res;
  return res.items ?? [];
}

export async function createCommentBankEntry(input: {
  scope: CommentBankScope;
  criterionKey?: string | null;
  text: string;
}): Promise<CommentBankEntry> {
  return post<CommentBankEntry>('/comment-bank', {
    scope: input.scope,
    criterionKey: input.criterionKey ?? null,
    text: input.text,
  });
}
