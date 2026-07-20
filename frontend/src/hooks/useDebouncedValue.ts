import { useEffect, useState } from 'react';

/** Devolve `value` só depois que ele ficar `delayMs` sem mudar — evita disparar uma busca a cada tecla. */
export function useDebouncedValue<T>(value: T, delayMs: number): T {
  const [debounced, setDebounced] = useState(value);

  useEffect(() => {
    const timer = setTimeout(() => setDebounced(value), delayMs);
    return () => clearTimeout(timer);
  }, [value, delayMs]);

  return debounced;
}
