import { useCallback, useRef, useState } from 'react';
import { useApp } from '../context';
const KEY = 'campus-wiki:saved:v1';
export function useSaved() {
  const { toast } = useApp();
  const storageOk = useRef(true);
  const [ids, setIds] = useState<string[]>(() => {
    try {
      const parsed: unknown = JSON.parse(localStorage.getItem(KEY) || '[]');
      return Array.isArray(parsed) ? [...new Set(parsed.filter((id): id is string => typeof id === 'string' && id.length <= 64))].slice(0, 500) : [];
    } catch { storageOk.current = false; return []; }
  });
  const toggle = useCallback((id: string) => {
    const exists = ids.includes(id);
    if (!exists && ids.length >= 500) { toast('收藏夹已满，请先移除部分条目。'); return; }
    const next = exists ? ids.filter(item => item !== id) : [...ids, id];
    setIds(next);
    try { localStorage.setItem(KEY, JSON.stringify(next)); } catch { storageOk.current = false; }
    toast(`${exists ? '已移出收藏' : '已收入收藏'}${storageOk.current ? '' : ' · 当前浏览器仅临时保存'}`);
  }, [ids, toast]);
  return { ids, toggle };
}
