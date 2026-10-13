import { useEffect, useState } from 'react';
import { getFilterOptions, getProfessors, getStats } from '../api/professors.js';

const isAbort = (err) => err?.name === 'AbortError';

// `viewerKey` changes when someone logs in or out, because profile links differ per viewer.
// Pass enabled=false until the login state is known so we don't fetch twice on page load.
export function useProfessors(filters, page, viewerKey, enabled = true, pageSize = 10) {
  const [state, setState] = useState({ rows: [], total: 0, loading: true, error: null });
  const [retryKey, setRetryKey] = useState(0);

  useEffect(() => {
    if (!enabled) return undefined;
    const controller = new AbortController();
    setState((s) => ({ ...s, loading: true, error: null }));

    getProfessors({ ...filters, page, pageSize }, { signal: controller.signal })
      .then((res) => setState({ rows: res.data, total: res.total, loading: false, error: null }))
      .catch((error) => {
        if (isAbort(error)) return;
        setState((s) => ({ ...s, loading: false, error }));
      });

    // A newer search cancels the one still in flight.
    return () => controller.abort();
  }, [filters, page, pageSize, retryKey, viewerKey, enabled]);

  return { ...state, pageSize, retry: () => setRetryKey((k) => k + 1) };
}

export function useFilterOptions() {
  const [options, setOptions] = useState({ colleges: [], departments: [], designations: [] });

  useEffect(() => {
    const controller = new AbortController();
    getFilterOptions({ signal: controller.signal })
      .then(setOptions)
      .catch(() => {}); // selects simply stay empty; the table still works
    return () => controller.abort();
  }, []);

  return options;
}

export function useStats() {
  const [stats, setStats] = useState(null);

  useEffect(() => {
    const controller = new AbortController();
    getStats({ signal: controller.signal })
      .then(setStats)
      .catch(() => {});
    return () => controller.abort();
  }, []);

  return stats;
}
