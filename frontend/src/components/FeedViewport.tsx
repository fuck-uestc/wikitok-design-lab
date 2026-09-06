import { forwardRef, useEffect, useImperativeHandle, useLayoutEffect, useRef, useState, type ReactNode } from 'react';
import type { ArtifactSummary, Theme } from '../../../shared/types';
export interface FeedHandle { jump: (index: number, instant?: boolean) => void }
interface Props { theme: Theme; items: ArtifactSummary[]; active: number; onActive: (index: number) => void; renderCard: (item: ArtifactSummary, index: number) => ReactNode; empty: ReactNode }
// Native, variable-height snap flow. A long quote is never cut off or trapped in a nested scroller.
// Offsets belong to actual cards, NOT index * viewportHeight.
export const FeedViewport = forwardRef<FeedHandle, Props>(function FeedViewport({ theme, items, active, onActive, renderCard, empty }, handle) {
  const feed = useRef<HTMLElement>(null);
  const activeRef = useRef(active); activeRef.current = active;
  const [height, setHeight] = useState(0);
  const frame = useRef(0);
  const firstId = items[0]?.id;
  useLayoutEffect(() => {
    const node = feed.current!;
    const resize = new ResizeObserver(() => setHeight(node.clientHeight));
    resize.observe(node); return () => resize.disconnect();
  }, []);
  useLayoutEffect(() => {
    const node = feed.current;
    const card = node?.querySelector<HTMLElement>(`[data-index="${activeRef.current}"]`);
    if (node && card) node.scrollTo({ top: card.offsetTop, behavior: 'instant' });
  }, [height, theme]);
  useLayoutEffect(() => { feed.current?.scrollTo({ top: 0, behavior: 'instant' }); }, [firstId]);
  useImperativeHandle(handle, () => ({ jump(index, instant = false) {
    const node = feed.current; if (!node || !items.length) return;
    const target = Math.max(0, Math.min(index, items.length - 1));
    const card = node.querySelector<HTMLElement>(`[data-index="${target}"]`);
    if (card) node.scrollTo({ top: card.offsetTop, behavior: instant || matchMedia('(prefers-reduced-motion: reduce)').matches ? 'instant' : 'smooth' });
    if (instant) onActive(target);
  } }), [items.length, onActive]);
  useEffect(() => () => cancelAnimationFrame(frame.current), []);
  const track = () => {
    cancelAnimationFrame(frame.current);
    frame.current = requestAnimationFrame(() => {
      const node = feed.current; if (!node || !items.length) return;
      const cards = node.querySelectorAll<HTMLElement>('[data-index]');
      const line = node.scrollTop + node.clientHeight * .45;
      let lo = 0, hi = cards.length - 1;
      while (lo < hi) { const mid = Math.ceil((lo + hi) / 2); if (cards[mid].offsetTop <= line) lo = mid; else hi = mid - 1; }
      onActive(lo);
    });
  };
  return <main id="feed" ref={feed} className="reading-feed" tabIndex={-1} aria-label="信息流，向下滑动浏览" onScroll={track} style={{ '--feed-height': `${height || 500}px` } as React.CSSProperties}>
    {!items.length ? empty : items.map((item, index) => <article key={item.id} data-index={index} data-artifact-id={item.id} className={`reading-slide ${item.format}`} inert={index !== active} aria-hidden={index !== active} aria-label={item.title}>{renderCard(item, index)}</article>)}
  </main>;
});
