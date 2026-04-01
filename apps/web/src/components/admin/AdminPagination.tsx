import type { CSSProperties } from 'react';
import { theme } from '../../styles/theme';

interface AdminPaginationProps {
  total: number;
  page: number;
  limit: number;
  onPageChange: (page: number) => void;
  onLimitChange: (limit: number) => void;
}

export function AdminPagination({ total, page, limit, onPageChange, onLimitChange }: AdminPaginationProps) {
  const start = page * limit + 1;
  const end = Math.min((page + 1) * limit, total);
  const totalPages = Math.ceil(total / limit);
  const hasPrev = page > 0;
  const hasNext = page < totalPages - 1;

  return (
    <div style={bar}>
      <span style={info}>
        Showing {total > 0 ? start : 0}–{end} of {total}
      </span>
      <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
        <select value={limit} onChange={e => { onLimitChange(Number(e.target.value)); onPageChange(0); }} style={select}>
          {[10, 25, 50, 100].map(n => <option key={n} value={n}>{n} / page</option>)}
        </select>
        <button onClick={() => onPageChange(page - 1)} disabled={!hasPrev} style={{ ...btn, opacity: hasPrev ? 1 : 0.3 }}>← Prev</button>
        <span style={{ fontSize: 12, color: theme.text.muted }}>{page + 1}/{totalPages || 1}</span>
        <button onClick={() => onPageChange(page + 1)} disabled={!hasNext} style={{ ...btn, opacity: hasNext ? 1 : 0.3 }}>Next →</button>
      </div>
    </div>
  );
}

const bar: CSSProperties = { display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '10px 12px', borderTop: `1px solid ${theme.border.subtle}`, background: theme.bg.tertiary, borderRadius: '0 0 8px 8px' };
const info: CSSProperties = { fontSize: 12, color: theme.text.muted };
const select: CSSProperties = { background: theme.bg.primary, border: `1px solid ${theme.border.subtle}`, borderRadius: 6, padding: '4px 8px', fontSize: 11, color: theme.text.muted, cursor: 'pointer', fontFamily: 'inherit' };
const btn: CSSProperties = { padding: '4px 10px', fontSize: 11, fontWeight: 600, background: 'rgba(255,255,255,0.04)', border: `1px solid ${theme.border.subtle}`, borderRadius: 6, color: theme.text.secondary, cursor: 'pointer', fontFamily: 'inherit' };
