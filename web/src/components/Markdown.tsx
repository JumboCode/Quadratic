import { useState } from 'react';
import ReactMarkdown from 'react-markdown';
import remarkGfm from 'remark-gfm';
import { Eye, Pencil } from 'lucide-react';
import { cn } from '../lib/utils';
import { Textarea } from './ui';

export function Markdown({ children, className }: { children: string; className?: string }) {
  return (
    <div className={cn('prose-q text-sm', className)}>
      <ReactMarkdown
        remarkPlugins={[remarkGfm]}
        components={{ a: (props) => <a {...props} target="_blank" rel="noreferrer" /> }}
      >
        {children}
      </ReactMarkdown>
    </div>
  );
}

/**
 * Markdown editor with a write/preview toggle. Markdown is the storage format, which keeps
 * descriptions identical to what devs see in GitHub.
 */
export function MarkdownEditor({
  value, onChange, onBlur, placeholder, minRows = 6, startInPreview = false, className,
}: {
  value: string;
  onChange: (v: string) => void;
  onBlur?: () => void;
  placeholder?: string;
  minRows?: number;
  startInPreview?: boolean;
  className?: string;
}) {
  const [preview, setPreview] = useState(startInPreview && !!value);

  return (
    <div className={cn('group relative', className)}>
      <div className="absolute right-2 top-2 z-10 flex gap-0.5 rounded-lg border border-line bg-surface p-0.5 opacity-70 transition group-hover:opacity-100">
        <button
          type="button"
          onClick={() => setPreview(false)}
          className={cn('rounded-md p-1', !preview ? 'bg-surface-2 text-ink' : 'text-muted')}
          aria-label="Edit"
        >
          <Pencil className="size-3.5" />
        </button>
        <button
          type="button"
          onClick={() => setPreview(true)}
          className={cn('rounded-md p-1', preview ? 'bg-surface-2 text-ink' : 'text-muted')}
          aria-label="Preview"
        >
          <Eye className="size-3.5" />
        </button>
      </div>
      {preview ? (
        <div
          className="min-h-24 cursor-text rounded-xl px-1 py-1"
          onDoubleClick={() => setPreview(false)}
          title="Double-click to edit"
        >
          {value.trim() ? <Markdown>{value}</Markdown> : <p className="text-sm text-muted">{placeholder}</p>}
        </div>
      ) : (
        <Textarea
          value={value}
          onChange={(e) => onChange(e.target.value)}
          onBlur={onBlur}
          placeholder={placeholder}
          rows={Math.max(minRows, value.split('\n').length + 1)}
          className="resize-y font-mono text-[13px] leading-relaxed"
        />
      )}
    </div>
  );
}
