import { useState, useEffect, useCallback } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { theme } from '../../styles/theme';
import { useIsMobile } from '../../hooks/useIsMobile';
import { Icon } from '../primitives/Icon';

const STORAGE_KEY = 'tg:onboarding_seen';

interface OnboardingModalProps {
  /** Navigate to a screen */
  onNavigate: (screen: string) => void;
}

const STEPS = [
  {
    icon: 'user',
    title: 'Create Account',
    description: 'Email and password. Takes 10 seconds.',
  },
  {
    icon: 'wallet',
    title: 'Deposit SOL',
    description: 'Send SOL to your unique deposit address.',
  },
  {
    icon: 'trophy',
    title: 'Win & Withdraw',
    description: 'SOL goes straight to your wallet. Instant.',
  },
];

export function OnboardingModal({ onNavigate }: OnboardingModalProps) {
  const [show, setShow] = useState(false);
  const isMobile = useIsMobile();

  useEffect(() => {
    // Show only if first-time user (flag not set)
    const seen = localStorage.getItem(STORAGE_KEY);
    if (!seen) {
      // Small delay so the lobby renders first
      const t = setTimeout(() => setShow(true), 600);
      return () => clearTimeout(t);
    }
  }, []);

  const dismiss = useCallback(() => {
    setShow(false);
    localStorage.setItem(STORAGE_KEY, '1');
  }, []);

  const handlePrimary = useCallback(() => {
    dismiss();
    onNavigate('mines');
  }, [dismiss, onNavigate]);

  const handleSecondary = useCallback(() => {
    dismiss();
    // Stay on lobby — just close the modal
  }, [dismiss]);

  return (
    <AnimatePresence>
      {show && (
        <motion.div
          key="onboarding-overlay"
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          transition={{ duration: 0.2 }}
          style={{
            position: 'fixed',
            inset: 0,
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            background: 'rgba(0, 0, 0, 0.70)',
            backdropFilter: 'blur(8px)',
            WebkitBackdropFilter: 'blur(8px)',
            zIndex: 9500,
            padding: '16px',
          }}
          onClick={dismiss}
        >
          <motion.div
            key="onboarding-card"
            initial={{ opacity: 0, scale: 0.95, y: 12 }}
            animate={{ opacity: 1, scale: 1, y: 0 }}
            exit={{ opacity: 0, scale: 0.95, y: 12 }}
            transition={{ duration: 0.25, ease: [0.16, 1, 0.3, 1] }}
            style={{
              position: 'relative',
              background: theme.bg.surface,
              border: `1px solid ${theme.border.default}`,
              borderRadius: '16px',
              padding: isMobile ? '28px 20px' : '32px',
              width: '100%',
              maxWidth: '480px',
              boxShadow: theme.shadow.lg,
            }}
            onClick={(e) => e.stopPropagation()}
          >
            {/* Close button */}
            <button
              onClick={dismiss}
              style={{
                position: 'absolute',
                top: '12px',
                right: '12px',
                width: '32px',
                height: '32px',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                background: 'transparent',
                border: 'none',
                borderRadius: theme.radius.md,
                color: theme.text.muted,
                cursor: 'pointer',
                transition: 'color 0.15s ease',
              }}
              aria-label="Close"
            >
              <Icon name="close" size={16} />
            </button>

            {/* Title */}
            <h2 style={{
              fontSize: isMobile ? 22 : 28,
              fontWeight: 700,
              color: theme.text.primary,
              margin: 0,
              lineHeight: 1.15,
              textAlign: 'center',
            }}>
              Welcome to TradeGems
            </h2>

            {/* Subtitle */}
            <p style={{
              fontSize: 15,
              fontWeight: 500,
              color: theme.text.muted,
              margin: '6px 0 0',
              textAlign: 'center',
              lineHeight: 1.4,
            }}>
              Trade. Compete. Win SOL.
            </p>

            {/* Steps */}
            <div style={{
              display: 'flex',
              flexDirection: 'column',
              gap: '12px',
              marginTop: '28px',
            }}>
              {STEPS.map((step, i) => (
                <div key={step.title} style={{
                  display: 'flex',
                  alignItems: 'center',
                  gap: '16px',
                  padding: '14px 16px',
                  background: theme.bg.elevated,
                  borderRadius: '12px',
                  border: `1px solid ${theme.border.subtle}`,
                }}>
                  {/* Step number + icon */}
                  <div style={{
                    width: 48,
                    height: 48,
                    borderRadius: '12px',
                    background: `rgba(139, 92, 246, ${0.08 + i * 0.04})`,
                    border: `1px solid rgba(139, 92, 246, ${0.15 + i * 0.05})`,
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                    flexShrink: 0,
                    color: theme.accent.primary,
                  }}>
                    <Icon name={step.icon} size={28} />
                  </div>
                  {/* Text */}
                  <div style={{ minWidth: 0 }}>
                    <div style={{
                      fontSize: 15,
                      fontWeight: 600,
                      color: theme.text.primary,
                      lineHeight: 1.3,
                    }}>
                      {step.title}
                    </div>
                    <div style={{
                      fontSize: 13,
                      fontWeight: 400,
                      color: theme.text.muted,
                      lineHeight: 1.4,
                      marginTop: 2,
                    }}>
                      {step.description}
                    </div>
                  </div>
                </div>
              ))}
            </div>

            {/* CTAs */}
            <div style={{
              display: 'flex',
              flexDirection: 'column',
              gap: '8px',
              marginTop: '24px',
            }}>
              {/* Primary CTA */}
              <button
                onClick={handlePrimary}
                style={{
                  width: '100%',
                  padding: '14px',
                  fontSize: 15,
                  fontWeight: 700,
                  color: '#fff',
                  background: theme.accent.primary,
                  border: 'none',
                  borderRadius: theme.radius.md,
                  cursor: 'pointer',
                  fontFamily: 'inherit',
                  transition: 'background 0.15s ease, transform 0.1s ease',
                  letterSpacing: '0.01em',
                }}
              >
                Start with Mines (Easiest)
              </button>

              {/* Secondary CTA */}
              <button
                onClick={handleSecondary}
                style={{
                  width: '100%',
                  padding: '12px',
                  fontSize: 14,
                  fontWeight: 600,
                  color: theme.text.secondary,
                  background: 'transparent',
                  border: `1px solid ${theme.border.default}`,
                  borderRadius: theme.radius.md,
                  cursor: 'pointer',
                  fontFamily: 'inherit',
                  transition: 'border-color 0.15s ease, color 0.15s ease',
                }}
              >
                Explore Games
              </button>
            </div>
          </motion.div>
        </motion.div>
      )}
    </AnimatePresence>
  );
}
