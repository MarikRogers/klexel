import { useEffect, useState } from 'react';

const mediaQuery = (query: string) => (typeof window.matchMedia === 'function' ? window.matchMedia(query) : null);

/** Whether the CSS media query matches; follows changes. False where matchMedia is unavailable. */
export function useMediaQuery(query: string): boolean {
  const [matches, setMatches] = useState(() => mediaQuery(query)?.matches ?? false);
  useEffect(() => {
    const mq = mediaQuery(query);
    if (!mq) return;
    const onChange = () => setMatches(mq.matches);
    onChange();
    mq.addEventListener('change', onChange);
    return () => mq.removeEventListener('change', onChange);
  }, [query]);
  return matches;
}
