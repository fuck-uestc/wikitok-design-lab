import { useEffect, useState } from 'react';
import { api, isAbort, messageOf } from '../api';
export function useResource<T>(path: string | null) {
  const [data, setData] = useState<T | null>(null);
  const [loading, setLoading] = useState(!!path);
  const [error, setError] = useState('');
  const [version, setVersion] = useState(0);
  useEffect(() => {
    if (!path) { setLoading(false); return; }
    const controller = new AbortController();
    setLoading(true); setError('');
    api<T>(path, { signal: controller.signal }).then(setData).catch(failure => { if (!isAbort(failure)) setError(messageOf(failure)); }).finally(() => { if (!controller.signal.aborted) setLoading(false); });
    return () => controller.abort();
  }, [path, version]);
  return { data, setData, loading, error, reload: () => setVersion(n => n + 1) };
}
