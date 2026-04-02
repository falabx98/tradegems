import { useState, type CSSProperties, type ReactNode } from 'react';
import { theme } from '../styles/theme';

export interface Column<T> {
  key: string;
  label: string;
  width?: string;
  render?: (row: T) => ReactNode;
}

interface DataTableProps<T> {
  columns: Column<T>[];
  data: T[];
  keyField?: string;
  onRowClick?: (row: T) => void;
  emptyMessage?: string;
  // Pagination
  page?: number;
  pageSize?: number;
  total?: number;
  onPageChange?: (page: number) => void;
}

export function DataTable<T extends Record<string, any>>({
  columns,
  data,
  keyField = 'id',
  onRowClick,
  emptyMessage = 'No data',
  page = 1,
  pageSize = 20,
  total,
  onPageChange,
}: DataTableProps<T>) {
  const [hoveredRow, setHoveredRow] = useState<number | null>(null);
  const totalPages = total ? Math.ceil(total / pageSize) : undefined;

  return (
    <div style={styles.wrapper}>
      <div style={styles.tableWrap}>
        <table style={styles.table}>
          <thead>
            <tr>
              {columns.map((col) => (
                <th key={col.key} style={{ ...styles.th, width: col.width }}>
                  {col.label}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {data.length === 0 ? (
              <tr>
                <td colSpan={columns.length} style={styles.empty}>
                  {emptyMessage}
                </td>
              </tr>
            ) : (
              data.map((row, i) => (
                <tr
                  key={String(row[keyField] ?? i)}
                  style={{
                    ...styles.tr,
                    background: hoveredRow === i ? theme.bg.tertiary : 'transparent',
                    cursor: onRowClick ? 'pointer' : 'default',
                  }}
                  onClick={() => onRowClick?.(row)}
                  onMouseEnter={() => setHoveredRow(i)}
                  onMouseLeave={() => setHoveredRow(null)}
                >
                  {columns.map((col) => (
                    <td key={col.key} style={styles.td}>
                      {col.render ? col.render(row) : String(row[col.key] ?? '—')}
                    </td>
                  ))}
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>

      {totalPages && totalPages > 1 && onPageChange && (
        <div style={styles.pagination}>
          <button
            style={{ ...styles.pageBtn, opacity: page <= 1 ? 0.4 : 1 }}
            onClick={() => page > 1 && onPageChange(page - 1)}
            disabled={page <= 1}
          >
            ← Prev
          </button>
          <span style={styles.pageInfo}>
            Page {page} of {totalPages}
          </span>
          <button
            style={{ ...styles.pageBtn, opacity: page >= totalPages ? 0.4 : 1 }}
            onClick={() => page < totalPages && onPageChange(page + 1)}
            disabled={page >= totalPages}
          >
            Next →
          </button>
        </div>
      )}
    </div>
  );
}

const styles: Record<string, CSSProperties> = {
  wrapper: {
    display: 'flex',
    flexDirection: 'column',
    gap: '12px',
  },
  tableWrap: {
    overflowX: 'auto' as const,
    borderRadius: theme.radius.lg,
    border: `1px solid ${theme.border.subtle}`,
  },
  table: {
    width: '100%',
    borderCollapse: 'collapse' as const,
    fontSize: theme.fontSize.base,
  },
  th: {
    textAlign: 'left' as const,
    padding: '10px 14px',
    fontSize: theme.fontSize.xs,
    fontWeight: 600,
    color: theme.text.secondary,
    textTransform: 'uppercase' as const,
    letterSpacing: '0.5px',
    background: theme.bg.tertiary,
    borderBottom: `1px solid ${theme.border.subtle}`,
    whiteSpace: 'nowrap' as const,
  },
  tr: {
    transition: 'background 0.15s',
    borderBottom: `1px solid ${theme.border.subtle}`,
  },
  td: {
    padding: '10px 14px',
    color: theme.text.primary,
    whiteSpace: 'nowrap' as const,
    overflow: 'hidden' as const,
    textOverflow: 'ellipsis' as const,
    maxWidth: '260px',
  },
  empty: {
    textAlign: 'center' as const,
    padding: '40px 14px',
    color: theme.text.muted,
    fontSize: theme.fontSize.base,
  },
  pagination: {
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    gap: '16px',
    padding: '8px 0',
  },
  pageBtn: {
    background: theme.bg.card,
    border: `1px solid ${theme.border.subtle}`,
    borderRadius: theme.radius.sm,
    color: theme.text.primary,
    padding: '6px 14px',
    fontSize: theme.fontSize.sm,
    cursor: 'pointer',
  },
  pageInfo: {
    fontSize: theme.fontSize.sm,
    color: theme.text.secondary,
  },
};
