import { useState } from 'react';
import { useGameStore } from '../../stores/gameStore';
import { useAuthStore } from '../../stores/authStore';
import { theme } from '../../styles/theme';
import { formatSol } from '../../utils/sol';

export function SettingsScreen() {
  const profile = useGameStore((s) => s.profile);
  const setScreen = useGameStore((s) => s.setScreen);
  const { logout } = useAuthStore();
  const [loggingOut, setLoggingOut] = useState(false);

  async function handleLogout() {
    setLoggingOut(true);
    try {
      await logout();
      setScreen('landing');
    } catch {
      // ignore
    } finally {
      setLoggingOut(false);
    }
  }

  return (
    <div style={styles.container}>
      {/* Profile Card */}
      <div style={styles.card}>
        <div style={styles.cardHeader}>
          <span style={styles.cardTitle}>Profile</span>
        </div>
        <div style={styles.cardBody}>
          <div style={styles.avatar}>
            {profile.username.charAt(0).toUpperCase()}
          </div>
          <div style={styles.profileInfo}>
            <InfoRow label="Username" value={profile.username} />
            <InfoRow label="User ID" value={profile.id.slice(0, 12) + '...'} mono />
            <InfoRow label="Level" value={`${profile.level}`} />
            <InfoRow
              label="VIP tier"
              value={profile.vipTier}
              color={theme.vip[profile.vipTier as keyof typeof theme.vip] || theme.text.secondary}
            />
          </div>
        </div>
      </div>

      {/* Stats Card */}
      <div style={styles.card}>
        <div style={styles.cardHeader}>
          <span style={styles.cardTitle}>Statistics</span>
        </div>
        <div style={styles.statsGrid}>
          <StatBox label="Rounds played" value={`${profile.roundsPlayed}`} />
          <StatBox label="Total wagered" value={`${formatSol(profile.totalWagered)} SOL`} icon />
          <StatBox label="Total won" value={`${formatSol(profile.totalWon)} SOL`} color={theme.success} icon />
          <StatBox label="Win rate" value={`${(profile.winRate * 100).toFixed(1)}%`} />
          <StatBox label="Best mult" value={`${profile.bestMultiplier.toFixed(2)}x`} color="#c084fc" />
          <StatBox label="Balance" value={`${formatSol(profile.balance)} SOL`} color="#c084fc" icon />
        </div>
      </div>

      {/* Preferences Card */}
      <div style={styles.card}>
        <div style={styles.cardHeader}>
          <span style={styles.cardTitle}>Preferences</span>
        </div>
        <div style={styles.cardBody}>
          <div style={styles.prefRow}>
            <span style={styles.prefLabel}>Sound effects</span>
            <span style={styles.prefValue}>On</span>
          </div>
          <div style={styles.prefRow}>
            <span style={styles.prefLabel}>Animations</span>
            <span style={styles.prefValue}>On</span>
          </div>
          <div style={styles.prefRow}>
            <span style={styles.prefLabel}>Chart quality</span>
            <span style={styles.prefValue}>High</span>
          </div>
        </div>
      </div>

      {/* Logout */}
      <div style={styles.dangerCard}>
        <button
          onClick={handleLogout}
          disabled={loggingOut}
          style={styles.logoutBtn}
        >
          {loggingOut ? 'Logging out...' : 'Logout'}
        </button>
      </div>
    </div>
  );
}

function InfoRow({ label, value, color, mono }: { label: string; value: string; color?: string; mono?: boolean }) {
  return (
    <div style={infoStyles.row}>
      <span style={infoStyles.label}>{label}</span>
      <span
        style={{ ...infoStyles.value, color: color || theme.text.primary }}
        className={mono ? 'mono' : undefined}
      >
        {value}
      </span>
    </div>
  );
}

function StatBox({ label, value, color, icon }: { label: string; value: string; color?: string; icon?: boolean }) {
  return (
    <div style={statStyles.box}>
      <span style={statStyles.label}>{label}</span>
      <span style={{ ...statStyles.value, color: color || theme.text.primary }} className="mono">
        {icon && <img src="/sol-coin.png" alt="SOL" style={{ width: '18px', height: '18px', marginRight: '5px', verticalAlign: 'middle' }} />}
        {value}
      </span>
    </div>
  );
}

const infoStyles: Record<string, React.CSSProperties> = {
  row: {
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  label: {
    fontSize: '12px',
    fontWeight: 500,
    color: theme.text.muted,
  },
  value: {
    fontSize: '13px',
    fontWeight: 700,
  },
};

const statStyles: Record<string, React.CSSProperties> = {
  box: {
    display: 'flex',
    flexDirection: 'column',
    gap: '4px',
    padding: '12px',
    background: theme.bg.tertiary,
    borderRadius: '6px',
  },
  label: {
    fontSize: '11px',
    fontWeight: 500,
    color: theme.text.muted,
  },
  value: {
    fontSize: '16px',
    fontWeight: 700,
    display: 'flex',
    alignItems: 'center',
  },
};

const styles: Record<string, React.CSSProperties> = {
  container: {
    display: 'flex',
    flexDirection: 'column',
    gap: '12px',
    padding: '16px',
    height: '100%',
    overflow: 'auto',
  },
  card: {
    background: theme.bg.secondary,
    border: `1px solid ${theme.border.subtle}`,
    borderRadius: '8px',
    overflow: 'hidden',
  },
  cardHeader: {
    display: 'flex',
    alignItems: 'center',
    gap: '8px',
    padding: '8px 12px',
    borderBottom: `1px solid ${theme.border.subtle}`,
    background: theme.bg.tertiary,
  },
  cardTitle: {
    fontSize: '13px',
    fontWeight: 600,
    color: theme.text.secondary,
  },
  cardBody: {
    padding: '16px',
    display: 'flex',
    gap: '16px',
  },
  avatar: {
    width: '48px',
    height: '48px',
    borderRadius: '50%',
    background: theme.bg.card,
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    fontSize: '20px',
    fontWeight: 900,
    color: theme.text.primary,
    flexShrink: 0,
  },
  profileInfo: {
    flex: 1,
    display: 'flex',
    flexDirection: 'column',
    gap: '6px',
    justifyContent: 'center',
  },
  statsGrid: {
    display: 'grid',
    gridTemplateColumns: 'repeat(3, 1fr)',
    gap: '8px',
    padding: '12px',
  },
  prefRow: {
    display: 'flex',
    justifyContent: 'space-between',
    alignItems: 'center',
    width: '100%',
    padding: '6px 0',
    borderBottom: `1px solid ${theme.border.subtle}`,
  },
  prefLabel: {
    fontSize: '13px',
    color: theme.text.secondary,
    fontWeight: 500,
  },
  prefValue: {
    fontSize: '12px',
    fontWeight: 600,
    color: '#c084fc',
  },
  dangerCard: {
    padding: '16px',
  },
  logoutBtn: {
    width: '100%',
    padding: '12px',
    background: 'rgba(248, 113, 113, 0.08)',
    border: '1px solid rgba(248, 113, 113, 0.15)',
    borderRadius: '8px',
    color: theme.danger,
    fontSize: '13px',
    fontWeight: 600,
    cursor: 'pointer',
    fontFamily: 'Inter, sans-serif',
  },
};
