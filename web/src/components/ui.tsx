import {
  forwardRef, useEffect, useRef, useState, type ButtonHTMLAttributes, type InputHTMLAttributes, type ReactNode,
  type SelectHTMLAttributes, type TextareaHTMLAttributes,
} from 'react';
import { createPortal } from 'react-dom';
import { AnimatePresence, motion } from 'framer-motion';
import { Check, Loader2, Search, X } from 'lucide-react';
import { cn } from '../lib/utils';
import { Mascot } from './Mascot';

// ---------------------------------------------------------------------------
// Buttons & inputs
// ---------------------------------------------------------------------------

type Variant = 'primary' | 'secondary' | 'ghost' | 'danger';
const VARIANTS: Record<Variant, string> = {
  primary: 'bg-brand-500 text-white hover:bg-brand-600 shadow-sm shadow-brand-500/30 active:translate-y-px',
  secondary: 'bg-surface border border-line hover:bg-surface-2 text-ink',
  ghost: 'hover:bg-surface-2 text-ink',
  danger: 'bg-red-500 text-white hover:bg-red-600',
};

export const Button = forwardRef<
  HTMLButtonElement,
  ButtonHTMLAttributes<HTMLButtonElement> & { variant?: Variant; size?: 'sm' | 'md'; loading?: boolean; icon?: ReactNode }
>(function Button({ variant = 'secondary', size = 'md', loading, icon, className, children, disabled, ...rest }, ref) {
  return (
    <button
      ref={ref}
      disabled={disabled || loading}
      className={cn(
        'inline-flex items-center justify-center gap-1.5 rounded-xl font-medium transition disabled:opacity-50 disabled:pointer-events-none',
        'focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-brand-500',
        size === 'sm' ? 'h-8 px-2.5 text-[13px]' : 'h-9 px-3.5 text-sm',
        VARIANTS[variant],
        className,
      )}
      {...rest}
    >
      {loading ? <Loader2 className="size-4 animate-spin" /> : icon}
      {children}
    </button>
  );
});

export const Input = forwardRef<HTMLInputElement, InputHTMLAttributes<HTMLInputElement>>(function Input({ className, ...rest }, ref) {
  return (
    <input
      ref={ref}
      className={cn(
        'h-9 w-full rounded-xl border border-line bg-surface px-3 text-sm outline-none transition placeholder:text-muted',
        'focus:border-brand-400 focus:ring-3 focus:ring-brand-500/15',
        className,
      )}
      {...rest}
    />
  );
});

export const Textarea = forwardRef<HTMLTextAreaElement, TextareaHTMLAttributes<HTMLTextAreaElement>>(function Textarea(
  { className, ...rest },
  ref,
) {
  return (
    <textarea
      ref={ref}
      className={cn(
        'w-full rounded-xl border border-line bg-surface px-3 py-2 text-sm outline-none transition placeholder:text-muted',
        'focus:border-brand-400 focus:ring-3 focus:ring-brand-500/15',
        className,
      )}
      {...rest}
    />
  );
});

export function Select({ className, children, ...rest }: SelectHTMLAttributes<HTMLSelectElement>) {
  return (
    <select
      className={cn(
        'h-9 rounded-xl border border-line bg-surface px-2.5 text-sm outline-none focus:border-brand-400 focus:ring-3 focus:ring-brand-500/15',
        className,
      )}
      {...rest}
    >
      {children}
    </select>
  );
}

export function Field({ label, hint, children }: { label: string; hint?: ReactNode; children: ReactNode }) {
  return (
    <label className="block space-y-1.5">
      <span className="text-[13px] font-medium">{label}</span>
      {children}
      {hint && <span className="block text-xs text-muted">{hint}</span>}
    </label>
  );
}

export function Switch({ checked, onChange, label }: { checked: boolean; onChange: (v: boolean) => void; label?: string }) {
  return (
    <button
      type="button"
      role="switch"
      aria-checked={checked}
      aria-label={label}
      onClick={() => onChange(!checked)}
      className={cn(
        'relative inline-flex h-6 w-10 shrink-0 items-center rounded-full transition',
        checked ? 'bg-brand-500' : 'bg-line',
      )}
    >
      <motion.span
        layout
        transition={{ type: 'spring', stiffness: 600, damping: 30 }}
        className={cn('size-5 rounded-full bg-white shadow', checked ? 'ml-[18px]' : 'ml-0.5')}
      />
    </button>
  );
}

// ---------------------------------------------------------------------------
// Display
// ---------------------------------------------------------------------------

export function Card({ className, children }: { className?: string; children: ReactNode }) {
  return <div className={cn('rounded-2xl border border-line bg-surface', className)}>{children}</div>;
}

export function Badge({ children, color, className }: { children: ReactNode; color?: string; className?: string }) {
  return (
    <span
      className={cn('inline-flex items-center gap-1 rounded-full border border-line px-2 py-0.5 text-xs font-medium', className)}
      style={color ? { background: `${color}1f`, borderColor: `${color}55`, color } : undefined}
    >
      {children}
    </span>
  );
}

export function Avatar({ name, src, size = 22 }: { name?: string | null; src?: string | null; size?: number }) {
  const initials = (name ?? '?').split(/\s+/).map((s) => s[0]).join('').slice(0, 2).toUpperCase();
  if (src) return <img src={src} alt={name ?? ''} title={name ?? ''} className="rounded-full object-cover" style={{ width: size, height: size }} />;
  // Stable pastel from the name
  const hue = [...(name ?? '')].reduce((h, c) => (h * 31 + c.charCodeAt(0)) % 360, 140);
  return (
    <span
      title={name ?? ''}
      className="inline-flex shrink-0 items-center justify-center rounded-full font-semibold text-white"
      style={{ width: size, height: size, fontSize: size * 0.42, background: `hsl(${hue} 55% 45%)` }}
    >
      {initials}
    </span>
  );
}

export function Kbd({ children }: { children: ReactNode }) {
  return (
    <kbd className="rounded-md border border-line bg-surface-2 px-1.5 py-0.5 font-sans text-[11px] text-muted">{children}</kbd>
  );
}

export function Spinner({ className }: { className?: string }) {
  return <Loader2 className={cn('size-5 animate-spin text-brand-500', className)} />;
}

export function PageLoader() {
  return (
    <div className="flex h-full items-center justify-center p-12">
      <Spinner />
    </div>
  );
}

export function Empty({ title, children, action }: { title: string; children?: ReactNode; action?: ReactNode }) {
  return (
    <div className="flex flex-col items-center justify-center gap-3 px-6 py-16 text-center">
      <Mascot className="size-24 hover-wiggle" />
      <h3 className="font-display text-lg font-bold">{title}</h3>
      {children && <p className="max-w-sm text-sm text-muted">{children}</p>}
      {action}
    </div>
  );
}

export function Progress({ value, color = 'var(--accent)', className }: { value: number; color?: string; className?: string }) {
  return (
    <div className={cn('h-1.5 w-full overflow-hidden rounded-full bg-surface-2', className)}>
      <motion.div
        className="h-full rounded-full"
        style={{ background: color }}
        initial={{ width: 0 }}
        animate={{ width: `${Math.max(0, Math.min(100, value))}%` }}
        transition={{ type: 'spring', stiffness: 120, damping: 20 }}
      />
    </div>
  );
}

export function Tabs<T extends string>({ value, onChange, tabs }: { value: T; onChange: (v: T) => void; tabs: { value: T; label: ReactNode }[] }) {
  return (
    <div className="flex gap-1 overflow-x-auto rounded-xl bg-surface-2 p-1">
      {tabs.map((t) => (
        <button
          key={t.value}
          onClick={() => onChange(t.value)}
          className={cn(
            'relative whitespace-nowrap rounded-lg px-3 py-1.5 text-[13px] font-medium transition',
            value === t.value ? 'text-ink' : 'text-muted hover:text-ink',
          )}
        >
          {value === t.value && (
            <motion.span layoutId={`tab-${tabs.map((x) => x.value).join()}`} className="absolute inset-0 rounded-lg bg-surface shadow-sm" />
          )}
          <span className="relative">{t.label}</span>
        </button>
      ))}
    </div>
  );
}

// ---------------------------------------------------------------------------
// Modal
// ---------------------------------------------------------------------------

export function Modal({
  open, onClose, title, children, wide,
}: { open: boolean; onClose: () => void; title?: ReactNode; children: ReactNode; wide?: boolean }) {
  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => e.key === 'Escape' && onClose();
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [open, onClose]);

  return createPortal(
    <AnimatePresence>
      {open && (
        <div className="fixed inset-0 z-50 flex items-start justify-center overflow-y-auto p-4 pt-[10vh]">
          <motion.div
            className="fixed inset-0 bg-brand-950/40 backdrop-blur-[2px]"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            onClick={onClose}
          />
          <motion.div
            role="dialog"
            aria-modal="true"
            className={cn('relative w-full rounded-2xl border border-line bg-surface shadow-2xl', wide ? 'max-w-3xl' : 'max-w-lg')}
            initial={{ opacity: 0, y: 16, scale: 0.97 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            exit={{ opacity: 0, y: 8, scale: 0.98 }}
            transition={{ type: 'spring', stiffness: 400, damping: 30 }}
          >
            {title && (
              <div className="flex items-center justify-between border-b border-line px-5 py-3.5">
                <h2 className="font-display text-lg font-bold">{title}</h2>
                <button onClick={onClose} className="rounded-lg p-1 text-muted hover:bg-surface-2" aria-label="Close">
                  <X className="size-4" />
                </button>
              </div>
            )}
            {children}
          </motion.div>
        </div>
      )}
    </AnimatePresence>,
    document.body,
  );
}

// ---------------------------------------------------------------------------
// Popover picker (used for issue properties)
// ---------------------------------------------------------------------------

export interface PickerOption {
  value: string;
  label: string;
  icon?: ReactNode;
  hint?: string;
}

export function Picker({
  trigger, options, value, onChange, multiple, placeholder = 'Search…', align = 'left',
}: {
  trigger: ReactNode;
  options: PickerOption[];
  value: string | string[] | null;
  onChange: (v: string | null, all?: string[]) => void;
  multiple?: boolean;
  placeholder?: string;
  align?: 'left' | 'right';
}) {
  const [open, setOpen] = useState(false);
  const [q, setQ] = useState('');
  const [active, setActive] = useState(0);
  const ref = useRef<HTMLDivElement>(null);
  const selected = new Set(Array.isArray(value) ? value : value ? [value] : []);
  const filtered = options.filter((o) => o.label.toLowerCase().includes(q.toLowerCase()));

  useEffect(() => {
    if (!open) return;
    const onDown = (e: MouseEvent) => !ref.current?.contains(e.target as Node) && setOpen(false);
    document.addEventListener('mousedown', onDown);
    return () => document.removeEventListener('mousedown', onDown);
  }, [open]);

  const choose = (o: PickerOption) => {
    if (multiple) {
      const next = new Set(selected);
      if (next.has(o.value)) next.delete(o.value);
      else next.add(o.value);
      onChange(o.value, [...next]);
    } else {
      onChange(o.value === '' ? null : o.value);
      setOpen(false);
    }
  };

  return (
    <div ref={ref} className="relative">
      <div
        role="button"
        tabIndex={0}
        onClick={() => { setOpen((v) => !v); setQ(''); setActive(0); }}
        onKeyDown={(e) => (e.key === 'Enter' || e.key === ' ') && (e.preventDefault(), setOpen((v) => !v))}
      >
        {trigger}
      </div>
      <AnimatePresence>
        {open && (
          <motion.div
            initial={{ opacity: 0, y: -4, scale: 0.98 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            exit={{ opacity: 0, y: -4 }}
            transition={{ duration: 0.12 }}
            className={cn(
              'absolute z-40 mt-1 w-60 overflow-hidden rounded-xl border border-line bg-surface shadow-xl',
              align === 'right' ? 'right-0' : 'left-0',
            )}
          >
            <div className="flex items-center gap-2 border-b border-line px-3">
              <Search className="size-3.5 text-muted" />
              <input
                autoFocus
                value={q}
                onChange={(e) => { setQ(e.target.value); setActive(0); }}
                onKeyDown={(e) => {
                  if (e.key === 'ArrowDown') { e.preventDefault(); setActive((a) => Math.min(a + 1, filtered.length - 1)); }
                  if (e.key === 'ArrowUp') { e.preventDefault(); setActive((a) => Math.max(a - 1, 0)); }
                  if (e.key === 'Enter' && filtered[active]) { e.preventDefault(); choose(filtered[active]); }
                  if (e.key === 'Escape') setOpen(false);
                }}
                placeholder={placeholder}
                className="h-9 w-full bg-transparent text-sm outline-none placeholder:text-muted"
              />
            </div>
            <div className="max-h-64 overflow-y-auto p-1">
              {filtered.length === 0 && <div className="px-2 py-3 text-center text-xs text-muted">Nothing found</div>}
              {filtered.map((o, idx) => (
                <button
                  key={o.value}
                  onMouseEnter={() => setActive(idx)}
                  onClick={() => choose(o)}
                  className={cn(
                    'flex w-full items-center gap-2 rounded-lg px-2 py-1.5 text-left text-sm',
                    idx === active && 'bg-surface-2',
                  )}
                >
                  {o.icon}
                  <span className="flex-1 truncate">{o.label}</span>
                  {o.hint && <span className="text-xs text-muted">{o.hint}</span>}
                  {selected.has(o.value) && <Check className="size-3.5 text-brand-500" />}
                </button>
              ))}
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}
