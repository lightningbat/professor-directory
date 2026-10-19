import { useEffect, useState } from 'react';

/** Re-renders every `ms` so "12s ago" labels keep ticking between polls. */
export function useNow(ms = 1000) {
  const [now, setNow] = useState(Date.now());
  useEffect(() => {
    const timer = setInterval(() => setNow(Date.now()), ms);
    return () => clearInterval(timer);
  }, [ms]);
  return now;
}
