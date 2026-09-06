import { useCallback, useEffect, useRef, useState } from 'react';
import type { ArtifactSummary, Page } from '../../../shared/types';
import { api, isAbort, messageOf } from '../api';

interface FeedState { items: ArtifactSummary[]; total: number; cursor: string | null; loading: boolean; loadingMore: boolean; error: string; moreError: string }
const initial: FeedState = { items: [], total: 0, cursor: null, loading: true, loadingMore: false, error: '', moreError: '' };
export function useFeed(category: string) {
  const [state, setState] = useState(initial);
  const [reload, setReload] = useState(0);
  const generation = useRef(0);
  const moreRequest = useRef<AbortController | null>(null);
  useEffect(() => {
    const controller = new AbortController();
    generation.current++;
    moreRequest.current?.abort(); moreRequest.current = null;
    setState(initial);
    const params = new URLSearchParams({ limit: '12', ...(category ? { category } : {}) });
    api<Page<ArtifactSummary>>(`/artifacts?${params}`, { signal: controller.signal }).then(result => setState({ ...initial, loading: false, items: result.items, total: result.total, cursor: result.nextCursor })).catch(error => {
      if (!isAbort(error)) setState({ ...initial, loading: false, error: messageOf(error) });
    });
    return () => { controller.abort(); moreRequest.current?.abort(); };
  }, [category, reload]);
  const loadMore = useCallback(async () => {
    if (!state.cursor || state.loading || moreRequest.current) return;
    const requestGeneration = generation.current;
    const controller = new AbortController();
    moreRequest.current = controller;
    setState(s => ({ ...s, loadingMore: true, moreError: '' }));
    try {
      const params = new URLSearchParams({ limit: '12', cursor: state.cursor, ...(category ? { category } : {}) });
      const result = await api<Page<ArtifactSummary>>(`/artifacts?${params}`, { signal: controller.signal });
      if (generation.current !== requestGeneration) return;
      setState(s => ({ ...s, items: [...s.items, ...result.items.filter(a => !s.items.some(old => old.id === a.id))], total: result.total, cursor: result.nextCursor, loadingMore: false }));
    } catch (error) { if (!isAbort(error) && generation.current === requestGeneration) setState(s => ({ ...s, loadingMore: false, moreError: messageOf(error) })); }
    finally { if (moreRequest.current === controller) moreRequest.current = null; }
  }, [category, state.cursor, state.loading]);
  const include = (artifact: ArtifactSummary) => setState(s => ({ ...s, items: s.items.some(a => a.id === artifact.id) ? s.items : [...s.items, artifact] }));
  return { ...state, loadMore, include, retry: () => setReload(n => n + 1) };
}
