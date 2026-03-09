import { motion } from 'framer-motion';
import { theme } from '../../styles/theme';
import { Button } from '../ui/Button';

interface LandingScreenProps {
  onEnter: () => void;
}

export function LandingScreen({ onEnter }: LandingScreenProps) {
  return (
    <div style={styles.container}>
      <motion.div
        style={styles.content}
        initial={{ opacity: 0, y: 30 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.8, ease: 'easeOut' }}
      >
        <motion.div
          style={styles.logoSection}
          initial={{ opacity: 0, scale: 0.9 }}
          animate={{ opacity: 1, scale: 1 }}
          transition={{ duration: 1, delay: 0.2 }}
        >
          <div style={styles.preTitle}>Welcome to</div>
          <h1 style={styles.title}>Trading<br />Arena</h1>
          <div style={styles.tagline}>15-second high-intensity trading rounds</div>
        </motion.div>

        <motion.div
          style={styles.features}
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          transition={{ delay: 0.6, duration: 0.6 }}
        >
          <div style={styles.featureItem}>
            <div style={styles.featureIcon}>
              <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke={theme.accent.cyan} strokeWidth="2">
                <polyline points="22 12 18 12 15 21 9 3 6 12 2 12" />
              </svg>
            </div>
            <div>
              <div style={styles.featureTitle}>Live chart</div>
              <div style={styles.featureDesc}>Watch the market unfold in real time</div>
            </div>
          </div>

          <div style={styles.featureItem}>
            <div style={styles.featureIcon}>
              <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke={theme.accent.purple} strokeWidth="2">
                <circle cx="12" cy="12" r="10" />
                <path d="M12 6v6l4 2" />
              </svg>
            </div>
            <div>
              <div style={styles.featureTitle}>15 seconds</div>
              <div style={styles.featureDesc}>Fast rounds, instant results</div>
            </div>
          </div>

          <div style={styles.featureItem}>
            <div style={styles.featureIcon}>
              <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke={theme.game.multiplier} strokeWidth="2">
                <path d="M12 2L2 7l10 5 10-5-10-5z" />
                <path d="M2 17l10 5 10-5" />
                <path d="M2 12l10 5 10-5" />
              </svg>
            </div>
            <div>
              <div style={styles.featureTitle}>Compete</div>
              <div style={styles.featureDesc}>Battle players in live arenas</div>
            </div>
          </div>
        </motion.div>

        <motion.div
          style={styles.ctaSection}
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.9, duration: 0.5 }}
        >
          <Button
            variant="primary"
            size="lg"
            onClick={onEnter}
            style={{
              padding: '16px 56px',
              fontSize: '15px',
              fontWeight: 600,
              borderRadius: '10px',
            }}
          >
            Enter Arena
          </Button>
          <div style={styles.ctaHint}>No account required to spectate</div>
        </motion.div>

        <div style={styles.version}>v0.1.0 alpha</div>
      </motion.div>
    </div>
  );
}

const styles: Record<string, React.CSSProperties> = {
  container: {
    position: 'relative',
    minHeight: '100vh',
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    background: theme.bg.primary,
    overflow: 'hidden',
  },
  content: {
    position: 'relative',
    zIndex: 1,
    display: 'flex',
    flexDirection: 'column',
    alignItems: 'center',
    gap: '40px',
    padding: '40px',
    maxWidth: '500px',
  },
  logoSection: {
    textAlign: 'center' as const,
  },
  preTitle: {
    fontSize: '13px',
    fontWeight: 500,
    color: theme.text.secondary,
    marginBottom: '12px',
  },
  title: {
    fontSize: 'clamp(3rem, 10vw, 5.5rem)',
    fontWeight: 800,
    lineHeight: 0.95,
    color: theme.text.primary,
    margin: 0,
  },
  tagline: {
    fontSize: '14px',
    fontWeight: 500,
    color: theme.text.muted,
    marginTop: '16px',
  },
  features: {
    display: 'flex',
    flexDirection: 'column',
    gap: '12px',
    width: '100%',
  },
  featureItem: {
    display: 'flex',
    alignItems: 'center',
    gap: '14px',
    padding: '14px 18px',
    background: theme.bg.secondary,
    border: `1px solid ${theme.border.subtle}`,
    borderRadius: '8px',
  },
  featureIcon: {
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    width: '36px',
    height: '36px',
    borderRadius: '8px',
    background: 'rgba(255,255,255,0.03)',
    flexShrink: 0,
  },
  featureTitle: {
    fontSize: '14px',
    fontWeight: 600,
    color: theme.text.primary,
  },
  featureDesc: {
    fontSize: '12px',
    color: theme.text.muted,
    marginTop: '2px',
  },
  ctaSection: {
    display: 'flex',
    flexDirection: 'column',
    alignItems: 'center',
    gap: '12px',
  },
  ctaHint: {
    fontSize: '12px',
    color: theme.text.muted,
  },
  version: {
    fontSize: '11px',
    fontWeight: 500,
    color: theme.text.muted,
    marginTop: '20px',
  },
};
