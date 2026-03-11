import { useState, useRef } from 'react';
import { useGameStore } from '../../stores/gameStore';
import { useAuthStore } from '../../stores/authStore';
import { theme } from '../../styles/theme';
import { formatSol } from '../../utils/sol';
import { isMuted, setMuted, getVolume, setVolume } from '../../utils/sounds';
import { isPhotoAvatar, getAvatarGradient, getInitials, resizeImageToBase64 } from '../../utils/avatars';
import { api } from '../../utils/api';
import { UploadIcon } from '../ui/GameIcons';

export function SettingsScreen() {
  const profile = useGameStore((s) => s.profile);
  const setScreen = useGameStore((s) => s.setScreen);
  const { logout } = useAuthStore();
  const syncProfile = useGameStore((s) => s.syncProfile);
  const [loggingOut, setLoggingOut] = useState(false);
  const [soundOn, setSoundOn] = useState(!isMuted());
  const [volume, setVol] = useState(Math.round(getVolume() * 100));
  const [uploadingAvatar, setUploadingAvatar] = useState(false);
  const [avatarError, setAvatarError] = useState<string | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  async function handleLogout() {
    setLoggingOut(true);
    try {
      await logout();
      setScreen('lobby');
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
      {/* Profile Card */}
      <div style={styles.card} className="card-enter card-enter-1">
        <div style={styles.cardHeader}>
          <span style={styles.cardTitle}>Profile</span>
        </div>
        <div style={styles.cardBody}>
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
                  background: 'rgba(153, 69, 255, 0.18)',
                  padding: '2px 10px',
                  borderRadius: '10px',
                  border: '1px solid rgba(153, 69, 255, 0.2)',
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
        <div style={styles.avatarSection}>
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
      <div style={styles.card} className="card-enter card-enter-4">
        <div style={styles.cardHeader}>
          <span style={styles.cardTitle}>Preferences</span>
        </div>
        <div style={styles.cardBody}>
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
                background: soundOn ? 'rgba(20, 241, 149, 0.15)' : 'rgba(255, 75, 75, 0.1)',
                color: soundOn ? '#14F195' : '#FF4B4B',
                border: `1px solid ${soundOn ? 'rgba(20, 241, 149, 0.3)' : 'rgba(255, 75, 75, 0.2)'}`,
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
                  style={{ width: '80px', accentColor: '#9945FF' }}
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

      {/* Logout */}
      <div style={styles.dangerCard} className="card-enter card-enter-5">
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
        {icon && <img src="/sol-coin.png" alt="SOL" style={{ width: '26px', height: '26px', marginRight: '5px', verticalAlign: 'middle' }} />}
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
    gap: '4px',
    padding: '12px',
    background: 'rgba(28, 20, 42, 0.85)',
    backdropFilter: 'blur(8px)',
    border: '1px solid rgba(153, 69, 255, 0.08)',
    borderRadius: '10px',
    transition: 'transform 0.2s ease, box-shadow 0.2s ease',
  },
  label: {
    fontSize: '13px',
    fontWeight: 500,
    color: theme.text.muted,
  },
  value: {
    fontSize: '18px',
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
    background: 'rgba(28, 20, 42, 0.85)',
    backdropFilter: 'blur(16px)',
    WebkitBackdropFilter: 'blur(16px)',
    border: '1px solid rgba(153, 69, 255, 0.18)',
    borderRadius: '14px',
    overflow: 'hidden',
    boxShadow: '0 4px 24px rgba(0, 0, 0, 0.3), inset 0 1px 0 rgba(255, 255, 255, 0.04)',
  },
  cardHeader: {
    display: 'flex',
    alignItems: 'center',
    gap: '8px',
    padding: '10px 14px',
    borderBottom: '1px solid rgba(153, 69, 255, 0.08)',
    background: 'rgba(32, 24, 48, 0.95)',
  },
  cardTitle: {
    fontSize: '15px',
    fontWeight: 700,
    color: theme.text.secondary,
    fontFamily: "'Orbitron', sans-serif",
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
    fontWeight: 900,
    fontFamily: "'Orbitron', sans-serif",
    color: '#fff',
    flexShrink: 0,
    boxShadow: '0 0 16px rgba(153, 69, 255, 0.3)',
  },
  avatarImg: {
    width: '48px',
    height: '48px',
    borderRadius: '50%',
    objectFit: 'cover' as const,
    flexShrink: 0,
    boxShadow: '0 0 16px rgba(153, 69, 255, 0.3)',
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
    border: '3px solid rgba(153, 69, 255, 0.4)',
    boxShadow: '0 0 20px rgba(153, 69, 255, 0.3)',
  },
  avatarPreviewGradient: {
    width: '80px',
    height: '80px',
    borderRadius: '50%',
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    fontSize: '34px',
    fontWeight: 900,
    fontFamily: "'Orbitron', sans-serif",
    color: '#fff',
    border: '3px solid rgba(153, 69, 255, 0.4)',
    boxShadow: '0 0 20px rgba(153, 69, 255, 0.3)',
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
    background: 'rgba(153, 69, 255, 0.2)',
    border: '1px solid rgba(153, 69, 255, 0.4)',
    borderRadius: '10px',
    color: '#c084fc',
    fontSize: '15px',
    fontWeight: 700,
    cursor: 'pointer',
    fontFamily: 'Rajdhani, sans-serif',
    transition: 'all 0.15s ease',
    width: 'fit-content',
  },
  removeBtn: {
    padding: '6px 14px',
    background: 'rgba(248, 113, 113, 0.1)',
    border: '1px solid rgba(248, 113, 113, 0.3)',
    borderRadius: '8px',
    color: '#f87171',
    fontSize: '14px',
    fontWeight: 600,
    cursor: 'pointer',
    fontFamily: 'Rajdhani, sans-serif',
    width: 'fit-content',
  },
  avatarHint: {
    fontSize: '13px',
    color: theme.text.muted,
    margin: 0,
    fontFamily: 'Rajdhani, sans-serif',
  },
  avatarErrorText: {
    fontSize: '13px',
    color: '#f87171',
    margin: 0,
    fontFamily: 'Rajdhani, sans-serif',
    fontWeight: 600,
  },
  statsGrid: {
    display: 'grid',
    gridTemplateColumns: 'repeat(auto-fill, minmax(120px, 1fr))',
    gap: '8px',
    padding: '12px',
  },
  prefRow: {
    display: 'flex',
    justifyContent: 'space-between',
    alignItems: 'center',
    width: '100%',
    padding: '8px 0',
    borderBottom: '1px solid rgba(153, 69, 255, 0.06)',
    transition: 'background-color 0.15s ease, transform 0.1s ease',
  },
  prefLabel: {
    fontSize: '15px',
    color: theme.text.secondary,
    fontWeight: 500,
  },
  prefValue: {
    fontSize: '14px',
    fontWeight: 600,
    color: '#c084fc',
    textShadow: '0 0 8px rgba(192, 132, 252, 0.3)',
  },
  prefToggle: {
    padding: '4px 12px',
    borderRadius: '8px',
    fontSize: '14px',
    fontWeight: 700,
    cursor: 'pointer',
    fontFamily: 'Rajdhani, sans-serif',
  },
  dangerCard: {
    padding: '16px',
  },
  logoutBtn: {
    width: '100%',
    padding: '14px',
    background: 'rgba(248, 113, 113, 0.08)',
    border: '1px solid rgba(248, 113, 113, 0.25)',
    borderRadius: '12px',
    color: '#f87171',
    fontSize: '16px',
    fontWeight: 700,
    cursor: 'pointer',
    fontFamily: 'Rajdhani, sans-serif',
    textTransform: 'uppercase' as const,
    letterSpacing: '0.5px',
    transition: 'all 0.15s ease',
  },
};
