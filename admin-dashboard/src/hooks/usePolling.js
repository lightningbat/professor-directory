import { useEffect, useState } from 'react';

/**
 * Calls fetcher(signal) now and then every intervalMs. Pauses while the tab is hidden and
 * refreshes immediately when it comes back. Keeps the last good data if a refresh fails.
 */
export function usePolling(fetcher, intervalMs, deps = []) {
  const [state, setState] = useState({ data: null, error: null, loading: true, updatedAt: null });

  useEffect(() => {
    let cancelled = false;
    let controller = new AbortController();
    let timer;

    const run = async () => {
      controller.abort();
      controller = new AbortController();
      try {
        const data = await fetcher(controller.signal);
        if (!cancelled) setState({ data, error: null, loading: false, updatedAt: Date.now() });
      } catch (error) {
        if (cancelled || error.name === 'AbortError') return;
        setState((s) => ({ ...s, error, loading: false }));
      }
    };

    const onVisible = () => document.visibilityState === 'visible' && run();

    setState((s) => ({ ...s, loading: true }));
    run();
    timer = setInterval(onVisible, intervalMs);
    document.addEventListener('visibilitychange', onVisible);

    return () => {
      cancelled = true;
      controller.abort();
      clearInterval(timer);
      document.removeEventListener('visibilitychange', onVisible);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, deps);

  return state;
}
