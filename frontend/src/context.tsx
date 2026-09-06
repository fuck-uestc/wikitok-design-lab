import { createContext, useCallback, useContext, useEffect, useRef, useState, type ReactNode } from 'react';
import type { SiteConfig } from '../../shared/types';
import { api, initialConfig, isAbort, messageOf } from './api';

interface AppContextValue { config: SiteConfig; configError: string; reloadConfig: () => void; toast: (message: string) => void }
const AppContext = createContext<AppContextValue>(null!);
export function AppProvider({ children }: { children: ReactNode }) {
  const [config, setConfig] = useState(initialConfig);
  const [configError, setError] = useState('');
  const [reload, setReload] = useState(0);
  const [notice, setNotice] = useState('');
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const toast = useCallback((message: string) => {
    if (timer.current) clearTimeout(timer.current);
    setNotice(message);
    timer.current = setTimeout(() => setNotice(''), 4000);
  }, []);
  useEffect(() => {
    const controller = new AbortController();
    api<SiteConfig>('/config', { signal: controller.signal }).then(data => {
      window.__WIKI_CONFIG__ = data; setConfig(data); setError('');
    }).catch(error => { if (!isAbort(error)) setError(messageOf(error)); });
    return () => controller.abort();
  }, [reload]);
  useEffect(() => {
    document.title = config.siteName;
    document.querySelector('meta[name="description"]')?.setAttribute('content', config.description);
  }, [config]);
  useEffect(() => () => { if (timer.current) clearTimeout(timer.current); }, []);
  return <AppContext value={{ config, configError, reloadConfig: () => setReload(n => n + 1), toast }}>
    {children}<div className={`toast ${notice ? 'show' : ''}`} role="status" aria-live="polite">{notice}</div>
  </AppContext>;
}
export const useApp = () => useContext(AppContext);
