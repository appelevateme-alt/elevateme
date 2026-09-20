import { useCallback, useEffect, useState } from 'react';
import { supabase } from './supabaseClient.js';

function normalizeError(err) {
  if (!err) return null;
  const rawCode = err.code ?? err.status ?? err.name ?? 'unknown';
  const code = String(rawCode);
  const rawMessage = typeof err.message === 'string' ? err.message : 'Something went wrong.';

  if (code === 'PGRST116') {
    return { code: 'not_found', message: 'Record not found.' };
  }
  if (code === '23505') {
    return { code: 'duplicate', message: 'This record already exists.' };
  }
  if (code === '42501') {
    return { code: 'access_denied', message: 'You do not have permission to perform this action.' };
  }
  if (
    err instanceof TypeError ||
    /failed to fetch|fetch failed|networkerror|network request failed|load failed/i.test(rawMessage)
  ) {
    return { code: 'network', message: 'Network error. Check your connection and try again.' };
  }
  return { code, message: rawMessage };
}

export function useSupabaseList({
  table,
  select = '*',
  filters = {},
  contains = null,
  search = null,
  order = null,
  page = 1,
  pageSize = 6,
} = {}) {
  const [data, setData] = useState([]);
  const [count, setCount] = useState(0);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [nonce, setNonce] = useState(0);

  const refetch = useCallback(() => setNonce((n) => n + 1), []);

  const filtersKey = JSON.stringify(filters ?? {});
  const containsKey = JSON.stringify(contains ?? null);
  const searchKey = JSON.stringify(search ?? null);
  const orderKey = JSON.stringify(order ?? null);

  useEffect(() => {
    let cancelled = false;

    async function fetchList() {
      if (!table) {
        if (!cancelled) {
          setData([]);
          setCount(0);
          setError({ code: 'invalid_arguments', message: 'Missing table name.' });
          setLoading(false);
        }
        return;
      }
      setLoading(true);
      setError(null);
      try {
        const safePage = Number.isFinite(Number(page)) && Number(page) >= 1 ? Math.floor(Number(page)) : 1;
        const safePageSize =
          Number.isFinite(Number(pageSize)) && Number(pageSize) >= 1 ? Math.floor(Number(pageSize)) : 6;
        const from = (safePage - 1) * safePageSize;
        const to = from + safePageSize - 1;

        let query = supabase.from(table).select(select, { count: 'exact' });

        const parsedFilters = JSON.parse(filtersKey);
        for (const [col, value] of Object.entries(parsedFilters || {})) {
          if (value === undefined || value === null || value === '') continue;
          if (Array.isArray(value)) {
            if (value.length === 0) continue;
            query = query.in(col, value);
          } else {
            query = query.eq(col, value);
          }
        }

        // Array-column contains, e.g. { col: 'roles', values: ['student'] }.
        const parsedContains = JSON.parse(containsKey);
        if (parsedContains && parsedContains.col && Array.isArray(parsedContains.values) && parsedContains.values.length > 0) {
          query = query.contains(parsedContains.col, parsedContains.values);
        }

        const parsedSearch = JSON.parse(searchKey);
        if (parsedSearch && parsedSearch.col && parsedSearch.term) {
          query = query.ilike(parsedSearch.col, `%${parsedSearch.term}%`);
        }

        const parsedOrder = JSON.parse(orderKey);
        if (parsedOrder && parsedOrder.col) {
          query = query.order(parsedOrder.col, { ascending: parsedOrder.ascending !== false });
        }

        query = query.range(from, to);

        const { data: rows, count: total, error: queryError } = await query;
        if (cancelled) return;
        if (queryError) {
          setData([]);
          setCount(0);
          setError(normalizeError(queryError));
        } else {
          setData(rows ?? []);
          setCount(typeof total === 'number' ? total : 0);
          setError(null);
        }
      } catch (err) {
        if (!cancelled) {
          setData([]);
          setCount(0);
          setError(normalizeError(err));
        }
      } finally {
        if (!cancelled) setLoading(false);
      }
    }

    fetchList();
    return () => {
      cancelled = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [table, select, filtersKey, containsKey, searchKey, orderKey, page, pageSize, nonce]);

  const safeSize = Number.isFinite(Number(pageSize)) && Number(pageSize) >= 1 ? Math.floor(Number(pageSize)) : 6;
  const safeCount = Number.isFinite(Number(count)) && Number(count) >= 0 ? Number(count) : 0;
  const totalPages = safeCount > 0 ? Math.ceil(safeCount / safeSize) : 0;

  return { data, count: safeCount, loading, error, totalPages, refetch };
}

export function useSupabaseRecord({ table, id, select = '*' } = {}) {
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [nonce, setNonce] = useState(0);

  const refetch = useCallback(() => setNonce((n) => n + 1), []);

  useEffect(() => {
    let cancelled = false;

    async function fetchRecord() {
      if (!table) {
        if (!cancelled) {
          setData(null);
          setError({ code: 'invalid_arguments', message: 'Missing table name.' });
          setLoading(false);
        }
        return;
      }
      if (id === undefined || id === null || id === '') {
        if (!cancelled) {
          setData(null);
          setError(null);
          setLoading(false);
        }
        return;
      }
      setLoading(true);
      setError(null);
      try {
        const { data: row, error: queryError } = await supabase
          .from(table)
          .select(select)
          .eq('id', id)
          .maybeSingle();
        if (cancelled) return;
        if (queryError) {
          setData(null);
          setError(normalizeError(queryError));
        } else {
          setData(row ?? null);
          setError(null);
        }
      } catch (err) {
        if (!cancelled) {
          setData(null);
          setError(normalizeError(err));
        }
      } finally {
        if (!cancelled) setLoading(false);
      }
    }

    fetchRecord();
    return () => {
      cancelled = true;
    };
  }, [table, id, select, nonce]);

  return { data, loading, error, refetch };
}

export function useSupabaseMutation({ table } = {}) {
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState(null);

  const create = useCallback(
    async (payload) => {
      if (!table) {
        const err = { code: 'invalid_arguments', message: 'Missing table name.' };
        setError(err);
        return { data: null, error: err };
      }
      setSaving(true);
      setError(null);
      try {
        const { data, error: queryError } = await supabase.from(table).insert(payload).select();
        if (queryError) {
          const normalized = normalizeError(queryError);
          setError(normalized);
          return { data: null, error: normalized };
        }
        setError(null);
        return { data: data ?? null, error: null };
      } catch (err) {
        const normalized = normalizeError(err);
        setError(normalized);
        return { data: null, error: normalized };
      } finally {
        setSaving(false);
      }
    },
    [table],
  );

  const update = useCallback(
    async (id, patch) => {
      if (!table) {
        const err = { code: 'invalid_arguments', message: 'Missing table name.' };
        setError(err);
        return { data: null, error: err };
      }
      if (id === undefined || id === null || id === '') {
        const err = { code: 'invalid_arguments', message: 'Missing record id.' };
        setError(err);
        return { data: null, error: err };
      }
      setSaving(true);
      setError(null);
      try {
        const { data, error: queryError } = await supabase
          .from(table)
          .update(patch)
          .eq('id', id)
          .select()
          .maybeSingle();
        if (queryError) {
          const normalized = normalizeError(queryError);
          setError(normalized);
          return { data: null, error: normalized };
        }
        setError(null);
        return { data: data ?? null, error: null };
      } catch (err) {
        const normalized = normalizeError(err);
        setError(normalized);
        return { data: null, error: normalized };
      } finally {
        setSaving(false);
      }
    },
    [table],
  );

  return { create, update, saving, error };
}

export function useSupabaseUpsert({ table } = {}) {
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState(null);

  // Upsert for tables with composite primary keys (e.g. evaluation_scores),
  // which have no single `id` column for update().
  const upsert = useCallback(
    async (payload, { onConflict } = {}) => {
      if (!table) {
        const err = { code: 'invalid_arguments', message: 'Missing table name.' };
        setError(err);
        return { data: null, error: err };
      }
      setSaving(true);
      setError(null);
      try {
        let query = supabase.from(table).upsert(payload, onConflict ? { onConflict } : undefined);
        const { data, error: queryError } = await query.select();
        if (queryError) {
          const normalized = normalizeError(queryError);
          setError(normalized);
          return { data: null, error: normalized };
        }
        setError(null);
        return { data: data ?? null, error: null };
      } catch (err) {
        const normalized = normalizeError(err);
        setError(normalized);
        return { data: null, error: normalized };
      } finally {
        setSaving(false);
      }
    },
    [table],
  );

  return { upsert, saving, error };
}
