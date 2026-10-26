import { useEffect, useRef, useState, type ReactNode } from 'react';

export function Dropdown({
  button,
  children,
  align = 'left',
  className = '',
}: {
  button: ReactNode;
  children: (close: () => void) => ReactNode;
  align?: 'left' | 'right';
  className?: string;
}) {
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);
  useEffect(() => {
    if (!open) return;
    const on = (e: MouseEvent) => ref.current && !ref.current.contains(e.target as Node) && setOpen(false);
    const onKey = (e: KeyboardEvent) => e.key === 'Escape' && setOpen(false);
    document.addEventListener('mousedown', on);
    document.addEventListener('keydown', onKey);
    return () => {
      document.removeEventListener('mousedown', on);
      document.removeEventListener('keydown', onKey);
    };
  }, [open]);
  return (
    <div className={`relative flex ${className}`} ref={ref}>
      <button type="button" className="flex" onClick={() => setOpen((o) => !o)}>
        {button}
      </button>
      {open && (
        <div
          className={`card absolute top-full z-40 mt-2 min-w-[200px] overflow-hidden p-1 ${align === 'right' ? 'right-0' : 'left-0'}`}
        >
          {children(() => setOpen(false))}
        </div>
      )}
    </div>
  );
}

export function itemCls(active: boolean) {
  return `flex w-full items-center gap-2 rounded-lg px-3 py-2 text-left text-sm hover:bg-stone-100 ${
    active ? 'font-medium text-ink' : 'text-stone-600'
  }`;
}

export const Chevron = () => (
  <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" className="text-stone-400" aria-hidden="true">
    <path d="m6 9 6 6 6-6" />
  </svg>
);
