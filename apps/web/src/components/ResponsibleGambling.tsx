/**
 * Responsible Gambling Components
 * - SessionTimeReminder: toast after configurable interval
 * - RealityCheck: summary after N bets
 * - FooterDisclaimer: always-visible footer text
 */
import { useEffect, useRef, useState } from 'react';
import { useAuthStore } from '../stores/authStore';
import { useGameStore } from '../stores/gameStore';
import { theme } from '../styles/theme';
import { formatSol } from '../utils/sol';
import { toast } from '../stores/toastStore';

// ─── Session Time Reminder ──────────────────────────────────

const SESSION_REMINDER_KEY = 'tg_session_reminder_interval';
const DEFAULT_INTERVAL_MS = 60 * 60 * 1000; // 60 minutes

export function SessionTimeReminder() {
  const isAuthenticated = useAuthStore(s => s.isAuthenticated);
  const sessionStart = useRef(Date.now());
  const lastReminder = useRef(Date.now());

  useEffect(() => {
    if (!isAuthenticated) return;

    const interval = parseInt(localStorage.getItem(SESSION_REMINDER_KEY) || '') || DEFAULT_INTERVAL_MS;
    if (interval <= 0) return; // User disabled reminders

    const check = setInterval(() => {
      const elapsed = Date.now() - lastReminder.current;
      if (elapsed >= interval) {
        const totalMins = Math.round((Date.now() - sessionStart.current) / 60000);
        const hours = Math.floor(totalMins / 60);
        const mins = totalMins % 60;
        const timeStr = hours > 0 ? `${hours}h ${mins}m` : `${mins}m`;

        toast.info(`Session: ${timeStr}`, 'Remember to take regular breaks.');
        lastReminder.current = Date.now();
      }
    }, 30000); // Check every 30s

    return () => clearInterval(check);
  }, [isAuthenticated]);

  return null; // No visible UI — just a background effect
}

// ─── Footer Disclaimer ──────────────────────────────────────

export function FooterDisclaimer({ onNavigate }: { onNavigate?: (screen: string) => void }) {
  return (
    <div style={{
      textAlign: 'center',
      padding: '16px 12px 8px',
      borderTop: `1px solid ${theme.border.subtle}`,
      fontSize: 11,
      color: theme.text.muted,
      lineHeight: 1.6,
    }}>
      <div>18+ | Gambling can be addictive. Please play responsibly.</div>
      <div style={{ marginTop: 4, display: 'flex', justifyContent: 'center', gap: 12, flexWrap: 'wrap' }}>
        <span
          style={{ color: theme.accent.purple, cursor: 'pointer' }}
          onClick={() => onNavigate?.('responsible-gambling')}
        >
          Responsible Gambling
        </span>
        <span style={{ color: theme.text.muted }}>·</span>
        <a
          href="https://www.ncpgambling.org/help-treatment/national-helpline-1-800-522-4700/"
          target="_blank"
          rel="noopener noreferrer"
          style={{ color: theme.accent.purple, textDecoration: 'none' }}
        >
          Problem Gambling Helpline
        </a>
      </div>
    </div>
  );
}
