import { useCallback, useEffect, useRef, useState } from 'react';

export interface Query<T> {
  data: T | null;
  loading: boolean;
  error: string | null;
  reload: () => void;
}

/**
 * Run an async fetch and track loading/error/data, re-running whenever `signature`
 * (a serialized view of the query params) changes or reload() is called. Passing a
 * string signature keeps the effect's dep array a literal — so it's exhaustive-deps
 * clean while `run` is read through a ref (the latest closure, never a stale one).
 */
export function useAdminQuery<T>(run: () => Promise<T>, signature: string): Query<T> {
  const [state, setState] = useState<{ data: T | null; loading: boolean; error: string | null }>({
    data: null,
    loading: true,
    error: null,
  });
  const [nonce, setNonce] = useState(0);
  const runRef = useRef(run);
  runRef.current = run;

  useEffect(() => {
    let cancelled = false;
    setState((s) => ({ ...s, loading: true, error: null }));
    runRef
      .current()
      .then((d) => {
        if (!cancelled) setState({ data: d, loading: false, error: null });
      })
      .catch((e) => {
        if (!cancelled)
          setState({ data: null, loading: false, error: e instanceof Error ? e.message : String(e) });
      });
    return () => {
      cancelled = true;
    };
  }, [signature, nonce]);

  const reload = useCallback(() => setNonce((n) => n + 1), []);
  return { ...state, reload };
}

/** Debounce a fast-changing value (e.g. a search box) before it drives a query. */
export function useDebounced<T>(value: T, ms = 300): T {
  const [v, setV] = useState(value);
  useEffect(() => {
    const id = setTimeout(() => setV(value), ms);
    return () => clearTimeout(id);
  }, [value, ms]);
  return v;
}
