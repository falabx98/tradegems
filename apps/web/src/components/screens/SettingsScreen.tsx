import { useState, useRef } from 'react';
import { useGameStore } from '../../stores/gameStore';
import { useAuthStore } from '../../stores/authStore';
import { useAppNavigate } from '../../hooks/useAppNavigate';
import { useIsMobile } from '../../hooks/useIsMobile';
import { theme } from '../../styles/theme';
import { formatSol } from '../../utils/sol';
import { isMuted, setMuted, getVolume, setVolume } from '../../utils/sounds';
import { isPhotoAvatar, getAvatarGradient, getInitials, resizeImageToBase64 } from '../../utils/avatars';
import { api } from '../../utils/api';
import { UploadIcon } from '../ui/GameIcons';
import { PageHeader } from '../ui/PageHeader';
import { StatCard } from '../ui/StatCard';

export function SettingsScreen() {
  const profile = useGameStore((s) => s.profile);
  const go = useAppNavigate();
  const isMobile = useIsMobile();
  const { logout } = useAuthStore();
  const syncProfile = useGameStore((s) => s.syncProfile);
  const [loggingOut, setLoggingOut] = useState(false);
  const [soundOn, setSoundOn] = useState(!isMuted());
  const [volume, setVol] = useState(Math.round(getVolume() * 100));
  const [uploadingAvatar, setUploadingAvatar] = useState(false);
  const [avatarError, setAvatarError] = useState<string | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  // Security: set password for wallet users
  const [secEmail, setSecEmail] = useState('');
  const [secPassword, setSecPassword] = useState('');
  const [secConfirm, setSecConfirm] = useState('');
  const [secSaving, setSecSaving] = useState(false);
  const [secMsg, setSecMsg] = useState<{ type: 'success' | 'error'; text: string } | null>(null);
  const hasEmail = !!(profile as any).email;

  async function handleSetPassword() {
    if (secPassword.length < 8) { setSecMsg({ type: 'error', text: 'Password must be at least 8 characters' }); return; }
    if (secPassword !== secConfirm) { setSecMsg({ type: 'error', text: 'Passwords do not match' }); return; }
    if (!hasEmail && !secEmail.includes('@')) { setSecMsg({ type: 'error', text: 'Enter a valid email' }); return; }

    setSecSaving(true);
    setSecMsg(null);
    try {
      await api.setPassword({
        email: !hasEmail ? secEmail : undefined,
        password: secPassword,
      });
      setSecMsg({ type: 'success', text: 'Password set! You can now login with email/username + password.' });
      setSecPassword('');
      setSecConfirm('');
      setSecEmail('');
    } catch (err: any) {
      setSecMsg({ type: 'error', text: err?.message || 'Failed to set password' });
    } finally {
      setSecSaving(false);
    }
  }

  async function handleLogout() {
    setLoggingOut(true);
    try {
      await logout();
      go('lobby');
    } catch {
      // ignore
    } finally {
      setLoggingOut(false);
    }
  }

  async function handleAvatarUpload(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file) return;

    // Validate file type
    if (!file.type.startsWith('image/')) {
      setAvatarError('Please select an image file');
      return;
    }

    // Validate file size (max 5MB before resize)
    if (file.size > 5 * 1024 * 1024) {
      setAvatarError('Image must be under 5MB');
      return;
    }

    setUploadingAvatar(true);
    setAvatarError(null);

    try {
      // Resize to 128x128 JPEG
      const base64 = await resizeImageToBase64(file, 128, 0.8);
      await api.updateMe({ avatarUrl: base64 });
      await syncProfile();
    } catch (err) {
      console.warn('Failed to upload avatar:', err);
      setAvatarError('Failed to upload. Try again.');
    } finally {
      setUploadingAvatar(false);
      // Reset file input so same file can be re-selected
      if (fileInputRef.current) fileInputRef.current.value = '';
    }
  }

  async function handleRemoveAvatar() {
    setUploadingAvatar(true);
    setAvatarError(null);
    try {
      await api.updateMe({ avatarUrl: '' });
      await syncProfile();
    } catch (err) {
      console.warn('Failed to remove avatar:', err);
    } finally {
      setUploadingAvatar(false);
    }
  }

  const hasPhoto = isPhotoAvatar(profile.avatarUrl);

  return (
    <div style={styles.container}>
      <PageHeader title="Settings" subtitle="Account, preferences & security" />

      {/* Profile Card */}
      <div style={styles.card} className="card-enter card-enter-1">
        <div style={styles.cardHeader}>
          <span style={styles.cardTitle}>Profile</span>
        </div>
        <div style={{
          ...styles.cardBody,
          ...(isMobile ? { flexDirection: 'column' as const, alignItems: 'center', textAlign: 'center' as const } : {}),
        }}>
          {hasPhoto ? (
            <img
              src={profile.avatarUrl!}
              alt={profile.username}
              style={styles.avatarImg}
            />
          ) : (
            <div style={{
              ...styles.avatar,
              background: getAvatarGradient(null, profile.username),
            }}>
              {getInitials(profile.username)}
            </div>
          )}
          <div style={styles.profileInfo}>
            <InfoRow label="Username" value={profile.username} />
            <InfoRow label="User ID" value={profile.id.slice(0, 12) + '...'} mono />
            <InfoRow label="Level" value={`${profile.level}`} />
            <div style={infoStyles.row}>
              <span style={infoStyles.label}>VIP tier</span>
              <span
                className="badge-metallic"
                style={{
                  fontSize: '13px',
                  fontWeight: 700,
                  color: theme.vip[profile.vipTier as keyof typeof theme.vip] || theme.text.secondary,
                  background: 'rgba(139, 92, 246, 0.18)',
                  padding: '2px 10px',
                  borderRadius: '10px',
                  border: '1px solid rgba(139, 92, 246, 0.2)',
                  position: 'relative' as const,
                  overflow: 'hidden',
                }}
              >
                {profile.vipTier}
              </span>
            </div>
          </div>
        </div>
      </div>

      {/* Avatar Upload */}
      <div style={styles.card} className="card-enter card-enter-2">
        <div style={styles.cardHeader}>
          <span style={styles.cardTitle}>Avatar</span>
        </div>
        <div style={{
          ...styles.avatarSection,
          ...(isMobile ? { flexDirection: 'column' as const, alignItems: 'center', textAlign: 'center' as const } : {}),
        }}>
          {/* Current avatar preview */}
          <div style={styles.avatarPreviewWrap}>
            {hasPhoto ? (
              <img
                src={profile.avatarUrl!}
                alt="Avatar"
                style={styles.avatarPreview}
              />
            ) : (
              <div style={{
                ...styles.avatarPreviewGradient,
                background: getAvatarGradient(null, profile.username),
              }}>
                {getInitials(profile.username)}
              </div>
            )}
          </div>

          {/* Upload controls */}
          <div style={styles.avatarControls}>
            <input
              ref={fileInputRef}
              type="file"
              accept="image/*"
              onChange={handleAvatarUpload}
              style={{ display: 'none' }}
            />
            <button
              onClick={() => fileInputRef.current?.click()}
              disabled={uploadingAvatar}
              style={styles.uploadBtn}
            >
              <UploadIcon size={16} color="currentColor" />
              {uploadingAvatar ? 'Uploading...' : 'Upload Photo'}
            </button>
            {hasPhoto && (
              <button
                onClick={handleRemoveAvatar}
                disabled={uploadingAvatar}
                style={styles.removeBtn}
              >
                Remove
              </button>
            )}
            <p style={styles.avatarHint}>
              {hasPhoto
                ? 'Photo uploaded! Visible in chat and profile.'
                : 'No photo set. A gradient is used as default.'}
            </p>
            {avatarError && (
              <p style={styles.avatarErrorText}>{avatarError}</p>
            )}
          </div>
        </div>
      </div>

      {/* Stats Card */}
      <div style={styles.card} className="card-enter card-enter-3">
        <div style={styles.cardHeader}>
          <span style={styles.cardTitle}>Statistics</span>
        </div>
        <div style={{
          ...styles.statsGrid,
          ...(isMobile ? { gridTemplateColumns: 'repeat(2, 1fr)' } : {}),
        }}>
          <StatCard label="Rounds Played" value={`${profile.roundsPlayed}`} />
          <StatCard label="Total Wagered" value={`${formatSol(profile.totalWagered)} SOL`} />
          <StatCard label="Total Won" value={`${formatSol(profile.totalWon)} SOL`} color={theme.success} trend="up" />
          <StatCard label="Win Rate" value={`${(profile.winRate * 100).toFixed(1)}%`} />
          <StatCard label="Best Mult" value={`${Number(profile.bestMultiplier).toFixed(2)}x`} color={theme.accent.blue} />
          <StatCard label="Balance" value={`${formatSol(profile.balance)} SOL`} color={theme.accent.blue} />
        </div>
      </div>

      {/* Preferences Card */}
      <div style={styles.card} className="card-enter card-enter-4">
        <div style={styles.cardHeader}>
          <span style={styles.cardTitle}>Preferences</span>
        </div>
        <div style={{
          ...styles.cardBody,
          ...(isMobile ? { flexDirection: 'column' as const } : {}),
        }}>
          <div style={styles.prefRow} className="table-row-hover">
            <span style={styles.prefLabel}>Sound effects</span>
            <button
              onClick={() => {
                const next = !soundOn;
                setSoundOn(next);
                setMuted(!next);
              }}
              style={{
                ...styles.prefToggle,
                background: soundOn ? `rgba(0, 220, 130, 0.12)` : `rgba(255, 71, 87, 0.1)`,
                color: soundOn ? theme.success : theme.accent.red,
                border: `1px solid ${soundOn ? 'rgba(0, 220, 130, 0.25)' : 'rgba(255, 71, 87, 0.2)'}`,
              }}
            >
              {soundOn ? 'On' : 'Off'}
            </button>
          </div>
          {soundOn && (
            <div style={styles.prefRow} className="table-row-hover">
              <span style={styles.prefLabel}>Volume</span>
              <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                <input
                  type="range"
                  min={0}
                  max={100}
                  value={volume}
                  onChange={(e) => {
                    const v = parseInt(e.target.value);
                    setVol(v);
                    setVolume(v / 100);
                  }}
                  style={{ width: '80px', accentColor: '#8b5cf6' }}
                />
                <span style={styles.prefValue} className="mono">{volume}%</span>
              </div>
            </div>
          )}
          <div style={styles.prefRow} className="table-row-hover">
            <span style={styles.prefLabel}>Animations</span>
            <span style={styles.prefValue}>On</span>
          </div>
          <div style={styles.prefRow} className="table-row-hover">
            <span style={styles.prefLabel}>Chart quality</span>
            <span style={styles.prefValue}>High</span>
          </div>
        </div>
      </div>

      {/* Security — Set password */}
      <div style={styles.card} className="card-enter card-enter-5">
        <div style={styles.cardHeader}>
          <span style={styles.cardTitle}>Security</span>
        </div>
        <div style={{ padding: '16px', display: 'flex', flexDirection: 'column' as const, gap: '12px' }}>
          <p style={{ fontSize: '13px', color: theme.text.muted, margin: 0 }}>
            Set or update your password to login with email/username + password.
          </p>
          {!hasEmail && (
            <div style={{ display: 'flex', flexDirection: 'column' as const, gap: '4px' }}>
              <label style={{ fontSize: '13px', fontWeight: 600, color: theme.text.secondary }}>Email</label>
              <input
                type="email" value={secEmail} onChange={(e) => setSecEmail(e.target.value)}
                placeholder="you@example.com"
                style={styles.secInput}
              />
            </div>
          )}
          <div style={{ display: 'flex', flexDirection: 'column' as const, gap: '4px' }}>
            <label style={{ fontSize: '13px', fontWeight: 600, color: theme.text.secondary }}>New Password</label>
            <input
              type="password" value={secPassword} onChange={(e) => setSecPassword(e.target.value)}
              placeholder="Min. 8 characters" minLength={8}
              style={styles.secInput}
            />
          </div>
          <div style={{ display: 'flex', flexDirection: 'column' as const, gap: '4px' }}>
            <label style={{ fontSize: '13px', fontWeight: 600, color: theme.text.secondary }}>Confirm Password</label>
            <input
              type="password" value={secConfirm} onChange={(e) => setSecConfirm(e.target.value)}
              placeholder="Repeat password"
              style={styles.secInput}
            />
          </div>
          {secMsg && (
            <p style={{
              fontSize: '13px', margin: 0, fontWeight: 600,
              color: secMsg.type === 'success' ? '#00E701' : '#FF3333',
            }}>
              {secMsg.text}
            </p>
          )}
          <button
            onClick={handleSetPassword}
            disabled={secSaving || !secPassword || !secConfirm}
            style={{
              ...styles.uploadBtn,
              width: '100%',
              justifyContent: 'center',
              padding: '14px 18px',
              opacity: (secSaving || !secPassword || !secConfirm) ? 0.5 : 1,
            }}
          >
            {secSaving ? 'Saving...' : 'Set Password'}
          </button>
        </div>
      </div>

      {/* ─── Responsible Gambling ─── */}
      <div style={{ ...styles.section, animationDelay: '0.5s' }} className="card-enter card-enter-5b">
        <h3 style={styles.sectionTitle}>Responsible Gambling</h3>
        <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
          <span style={{ fontSize: 13, color: theme.text.secondary }}>
            Set session reminders, self-exclude, or learn about responsible play.
          </span>
          <button
            onClick={() => go('responsible-gambling')}
            style={{
              width: '100%',
              padding: '14px 24px',
              background: 'rgba(139,92,246,0.1)',
              border: '1px solid rgba(139,92,246,0.25)',
              borderRadius: theme.radius.md,
              color: theme.accent.purple,
              fontSize: '15px',
              fontWeight: 700,
              cursor: 'pointer',
              fontFamily: 'inherit',
              transition: 'all 0.15s ease',
            }}
          >
            Responsible Gambling →
          </button>
        </div>
      </div>

      {/* Logout */}
      <div style={styles.dangerCard} className="card-enter card-enter-6">
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
        {icon && <img src="/sol-coin.png" alt="SOL" style={{ width: '18px', height: '18px', marginRight: '4px', verticalAlign: 'middle', flexShrink: 0 }} />}
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
    fontSize: '14px',
    fontWeight: 500,
    color: theme.text.muted,
  },
  value: {
    fontSize: '15px',
    fontWeight: 700,
  },
};

const statStyles: Record<string, React.CSSProperties> = {
  box: {
    display: 'flex',
    flexDirection: 'column',
    gap: '6px',
    padding: '14px',
    background: theme.bg.elevated,
    border: `1px solid ${theme.border.subtle}`,
    borderRadius: '10px',
    overflow: 'hidden',
  },
  label: {
    fontSize: '12px',
    fontWeight: 500,
    color: theme.text.muted,
    textTransform: 'uppercase' as const,
    letterSpacing: '0.5px',
  },
  value: {
    fontSize: '15px',
    fontWeight: 700,
    display: 'flex',
    alignItems: 'center',
    overflow: 'hidden',
    textOverflow: 'ellipsis' as const,
    whiteSpace: 'nowrap' as const,
  },
};

const styles: Record<string, React.CSSProperties> = {
  container: {
    display: 'flex',
    flexDirection: 'column',
    gap: '12px',
    padding: '16px',
    maxWidth: '900px',
    width: '100%',
    margin: '0 auto',
    boxSizing: 'border-box' as const,
  },
  card: {
    background: theme.bg.card,
    border: `1px solid ${theme.border.subtle}`,
    borderRadius: theme.radius.lg,
    overflow: 'hidden',
  },
  cardHeader: {
    display: 'flex',
    alignItems: 'center',
    gap: '8px',
    padding: '10px 14px',
    borderBottom: `1px solid ${theme.border.subtle}`,
    background: theme.bg.tertiary,
  },
  cardTitle: {
    fontSize: '12px',
    fontWeight: 700,
    color: theme.text.muted,
    fontFamily: "inherit",
    textTransform: 'uppercase' as const,
    letterSpacing: '1px',
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
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    fontSize: '22px',
    fontWeight: 700,
    fontFamily: "inherit",
    color: '#fff',
    flexShrink: 0,
    boxShadow: '0 0 16px rgba(139, 92, 246, 0.3)',
  },
  avatarImg: {
    width: '48px',
    height: '48px',
    borderRadius: '50%',
    objectFit: 'cover' as const,
    flexShrink: 0,
    boxShadow: '0 0 16px rgba(139, 92, 246, 0.3)',
  },
  profileInfo: {
    flex: 1,
    display: 'flex',
    flexDirection: 'column',
    gap: '6px',
    justifyContent: 'center',
  },
  // Avatar upload section
  avatarSection: {
    display: 'flex',
    alignItems: 'center',
    gap: '20px',
    padding: '20px',
  },
  avatarPreviewWrap: {
    flexShrink: 0,
  },
  avatarPreview: {
    width: '80px',
    height: '80px',
    borderRadius: '50%',
    objectFit: 'cover' as const,
    border: `3px solid ${theme.accent.purple}`,
  },
  avatarPreviewGradient: {
    width: '80px',
    height: '80px',
    borderRadius: '50%',
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    fontSize: '34px',
    fontWeight: 700,
    fontFamily: "inherit",
    color: '#fff',
    border: `3px solid ${theme.accent.purple}`,
  },
  avatarControls: {
    display: 'flex',
    flexDirection: 'column',
    gap: '8px',
    flex: 1,
  },
  uploadBtn: {
    display: 'flex',
    alignItems: 'center',
    gap: '8px',
    padding: '10px 18px',
    background: theme.gradient.primary,
    border: 'none',
    borderRadius: theme.radius.md,
    color: '#fff',
    fontSize: '14px',
    fontWeight: 700,
    cursor: 'pointer',
    fontFamily: 'inherit',
    transition: 'all 0.15s ease',
    width: 'fit-content',
  },
  removeBtn: {
    padding: '6px 14px',
    background: 'rgba(248, 113, 113, 0.1)',
    border: '1px solid rgba(248, 113, 113, 0.3)',
    borderRadius: '8px',
    color: '#FF3333',
    fontSize: '14px',
    fontWeight: 600,
    cursor: 'pointer',
    fontFamily: 'inherit',
    width: 'fit-content',
  },
  avatarHint: {
    fontSize: '13px',
    color: theme.text.muted,
    margin: 0,
    fontFamily: 'inherit',
  },
  avatarErrorText: {
    fontSize: '13px',
    color: '#FF3333',
    margin: 0,
    fontFamily: 'inherit',
    fontWeight: 600,
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
    padding: '10px 0',
    borderBottom: `1px solid ${theme.border.subtle}`,
    transition: 'background-color 0.15s ease',
  },
  prefLabel: {
    fontSize: '14px',
    color: theme.text.secondary,
    fontWeight: 500,
  },
  prefValue: {
    fontSize: '13px',
    fontWeight: 600,
    color: theme.accent.purple,
  },
  prefToggle: {
    padding: '5px 14px',
    borderRadius: theme.radius.md,
    fontSize: '13px',
    fontWeight: 700,
    cursor: 'pointer',
    fontFamily: 'inherit',
    transition: 'all 0.15s ease',
  },
  secInput: {
    padding: '10px 14px',
    background: theme.bg.primary,
    border: `1px solid ${theme.border.medium}`,
    borderRadius: theme.radius.md,
    color: theme.text.primary,
    fontSize: '14px',
    fontFamily: 'inherit',
    outline: 'none',
  },
  dangerCard: {
    padding: '16px',
  },
  logoutBtn: {
    width: '100%',
    padding: '14px',
    background: '#dc2626',
    border: 'none',
    borderRadius: theme.radius.md,
    color: '#fff',
    fontSize: '15px',
    fontWeight: 700,
    cursor: 'pointer',
    fontFamily: 'inherit',
    textTransform: 'uppercase' as const,
    letterSpacing: '0.5px',
    transition: 'all 0.15s ease',
  },
};
