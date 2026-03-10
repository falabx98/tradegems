import type { CSSProperties } from 'react';
import { useAuthStore } from '../stores/authStore';
import { theme } from '../styles/theme';

export function SettingsPage() {
  const { userId, username, role, logout } = useAuthStore();
  const apiUrl = import.meta.env.VITE_API_URL || 'http://localhost:3000';

  return (
    <div style={styles.page}>
      <div style={styles.section}>
        <h4 style={styles.sectionTitle}>Admin Account</h4>
        <div style={styles.card}>
          <DetailRow label="Username" value={username || '—'} />
          <DetailRow label="User ID" value={userId || '—'} mono />
          <DetailRow label="Role" value={role || '—'} />
        </div>
      </div>

      <div style={styles.section}>
        <h4 style={styles.sectionTitle}>API Configuration</h4>
        <div style={styles.card}>
          <DetailRow label="API URL" value={apiUrl} mono />
          <DetailRow label="Version" value="v1" />
        </div>
      </div>

      <div style={styles.section}>
        <h4 style={styles.sectionTitle}>Session</h4>
        <div style={styles.card}>
          <DetailRow label="Status" value="Active" />
          <DetailRow label="Token Storage" value="admin_accessToken (localStorage)" />
        </div>
        <button style={styles.logoutBtn} onClick={logout}>
          Sign Out
        </button>
      </div>
    </div>
  );
}

function DetailRow({ label, value, mono }: { label: string; value: string; mono?: boolean }) {
  return (
    <div style={{ display: 'flex', justifyContent: 'space-between', padding: '6px 0' }}>
      <span style={{ color: theme.text.secondary, fontSize: theme.fontSize.sm }}>{label}</span>
      <span style={{
        color: theme.text.primary, fontSize: theme.fontSize.sm,
        fontFamily: mono ? 'monospace' : 'inherit',
        maxWidth: '300px', overflow: 'hidden', textOverflow: 'ellipsis',
      }}>{value}</span>
    </div>
  );
}

const styles: Record<string, CSSProperties> = {
  page: { display: 'flex', flexDirection: 'column', gap: '28px' },
  title: { fontSize: theme.fontSize.lg, fontWeight: 600, color: theme.text.primary, margin: 0 },
  section: { display: 'flex', flexDirection: 'column', gap: '10px' },
  sectionTitle: { fontSize: theme.fontSize.base, fontWeight: 600, color: theme.text.primary, margin: 0 },
  card: {
    background: theme.bg.card, border: `1px solid ${theme.border.subtle}`,
    borderRadius: theme.radius.lg, padding: '16px 20px',
    display: 'flex', flexDirection: 'column', gap: '2px',
  },
  logoutBtn: {
    padding: '10px 20px', background: 'transparent', border: `1px solid ${theme.danger}`,
    borderRadius: theme.radius.md, color: theme.danger, fontWeight: 600,
    fontSize: theme.fontSize.sm, cursor: 'pointer', width: 'fit-content',
  },
};
