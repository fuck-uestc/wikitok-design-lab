import { forwardRef, useEffect, useImperativeHandle, useLayoutEffect, useRef, useState, type ReactNode } from 'react';
import type { ArtifactSummary, Theme } from '../../../shared/types';
export interface FeedHandle { jump: (index: number, instant?: boolean) => void }
interface Props { theme: Theme; items: ArtifactSummary[]; active: number; onActive: (index: number) => void; renderCard: (item: ArtifactSummary, index: number) => ReactNode; empty: ReactNode }
export const FeedViewport = forwardRef<FeedHandle, Props>(function FeedViewport({ theme, items, active, onActive, renderCard, empty }, handle) {
  const feed = useRef<HTMLElement>(null);
  const activeRef = useRef(active);
  activeRef.current = active;
  const [height, setHeight] = useState(0);
  const frame = useRef(0);
  const start = Math.max(0, active - 2);
  const end = Math.min(items.length, active + 4);
  const firstId = items[0]?.id;
  useLayoutEffect(() => {
    const node = feed.current!;
    const resize = new ResizeObserver(() => setHeight(node.clientHeight));
    resize.observe(node);
    return () => resize.disconnect();
  }, [theme]);
  useLayoutEffect(() => { if (height) feed.current?.scrollTo({ top: activeRef.current * height, behavior: 'instant' }); }, [height, theme]);
  useLayoutEffect(() => { feed.current?.scrollTo({ top: 0, behavior: 'instant' }); }, [firstId]);
  useImperativeHandle(handle, () => ({ jump(index, instant = false) {
    const node = feed.current;
    if (!node) return;
    const target = Math.max(0, Math.min(index, items.length - 1));
    node.scrollTo({ top: target * node.clientHeight, behavior: instant || window.matchMedia('(prefers-reduced-motion: reduce)').matches ? 'instant' : 'smooth' });
    if (instant) onActive(target);
  } }), [items.length, onActive]);
  useEffect(() => {
    const node = feed.current;
    if (!node || !height) return;
    const observer = new IntersectionObserver(entries => {
      const candidate = entries.filter(entry => entry.isIntersecting && entry.intersectionRatio >= 0.6).sort((a, b) => b.intersectionRatio - a.intersectionRatio)[0];
      if (candidate) onActive(Number((candidate.target as HTMLElement).dataset.index));
    }, { root: node, threshold: [0.6, 0.85] });
    node.querySelectorAll('.slide').forEach(slide => observer.observe(slide));
    return () => observer.disconnect();
  }, [height, start, end, items, onActive]);
  useEffect(() => () => cancelAnimationFrame(frame.current), []);
  return <main id="feed" ref={feed} className="reading-feed feed" tabIndex={-1} aria-label="信息流，向下滑动浏览" onScroll={() => {
    cancelAnimationFrame(frame.current);
    frame.current = requestAnimationFrame(() => {
      const node = feed.current;
      if (node && items.length && node.clientHeight) onActive(Math.min(items.length - 1, Math.max(0, Math.round(node.scrollTop / node.clientHeight))));
    });
  }}>
    {!items.length ? empty : <>
      <div aria-hidden="true" style={{ height: start * height }} />
      {items.slice(start, end).map((item, offset) => <article key={item.id} data-index={start + offset} data-artifact-id={item.id} className={`reading-slide slide ${item.format}`} style={{ height: height || '100%' }} inert={start + offset !== active} aria-hidden={start + offset !== active} aria-label={item.title}>{renderCard(item, start + offset)}</article>)}
      <div aria-hidden="true" style={{ height: (items.length - end) * height }} />
    </>}
  </main>;
});
