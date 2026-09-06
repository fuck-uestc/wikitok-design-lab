import { useEffect, useRef, type ReactNode, type ButtonHTMLAttributes } from 'react';
import { X, LoaderCircle, ArrowUpRight, type LucideIcon } from 'lucide-react';
import ReactMarkdown, { defaultUrlTransform } from 'react-markdown';
import remarkGfm from 'remark-gfm';
import { createPortal } from 'react-dom';
import { mediaUrl } from '../api';

export function IconButton({ icon: Icon, label, className = '', ...props }: { icon: LucideIcon; label: string } & ButtonHTMLAttributes<HTMLButtonElement>) {
  return <button type="button" className={`icon-btn ${className}`} aria-label={label} title={label} {...props}><Icon className="ico" /></button>;
}
export function Dialog({ title, children, onClose, className = '' }: { title: string; children: ReactNode; onClose: () => void; className?: string }) {
  const ref = useRef<HTMLDialogElement>(null);
  const latestClose = useRef(onClose);
  latestClose.current = onClose;
  useEffect(() => {
    const dialog = ref.current!;
    const previous = document.activeElement as HTMLElement | null;
    dialog.showModal();
    return () => {
      dialog.close();
      if (previous?.isConnected && !previous.closest('[inert]')) previous.focus({ preventScroll: true });
      else document.querySelector<HTMLButtonElement>('[data-theme-trigger]')?.focus({ preventScroll: true });
    };
  }, []);
  return createPortal(<dialog className={`library-dialog ${className}`} ref={ref} aria-label={title} onCancel={event => { event.preventDefault(); latestClose.current(); }} onClick={event => {
    if (event.target !== event.currentTarget) return;
    const rect = event.currentTarget.getBoundingClientRect();
    if (event.clientX < rect.left || event.clientX > rect.right || event.clientY < rect.top || event.clientY > rect.bottom) onClose();
  }}>
    <div className="dialog-top"><h2>{title}</h2><IconButton icon={X} label="关闭" onClick={onClose} autoFocus /></div>
    {children}
  </dialog>, document.body);
}
export function Loading({ text = '正在载入…' }: { text?: string }) {
  return <div className="loading-state" role="status"><LoaderCircle className="ico spin" /><span>{text}</span></div>;
}
export function ErrorNotice({ message, retry }: { message: string; retry?: () => void }) {
  return <div className="error-notice" role="alert"><p>{message}</p>{retry && <button type="button" className="secondary-button" onClick={retry}>重试</button>}</div>;
}
export function Markdown({ content }: { content: string }) {
  return <div className="markdown-body"><ReactMarkdown remarkPlugins={[remarkGfm]} skipHtml urlTransform={(url, key) => {
    const safe = defaultUrlTransform(url);
    return key === 'src' ? mediaUrl(safe) : safe;
  }} components={{
    a: ({ children, href }) => <a href={href ? mediaUrl(href) : undefined} target="_blank" rel="noopener noreferrer">{children}</a>,
    img: ({ src, alt }) => typeof src === 'string' && src ? <img src={src} alt={alt || ''} loading="lazy" /> : null,
    table: ({ children }) => <div className="table-scroll"><table>{children}</table></div>
  }}>{content}</ReactMarkdown></div>;
}
export function ExternalLink({ href, children, className = '' }: { href: string; children: ReactNode; className?: string }) {
  return <a href={href} target="_blank" rel="noopener noreferrer" className={className}>{children}<ArrowUpRight className="ico" /></a>;
}
export const formatDate = (value: string | null) => value ? new Intl.DateTimeFormat('zh-CN', { year: 'numeric', month: '2-digit', day: '2-digit' }).format(new Date(value)) : '—';
