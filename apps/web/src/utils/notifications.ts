// ─── Notification & Toast System ─────────────────────────────────────────────
// Browser notifications + in-app toast events

import { playToastSound, playLevelUp } from './sounds';

// ─── Toast Event Types ──────────────────────────────────────────────────────

export interface ToastPayload {
  message: string;
  type: 'success' | 'error' | 'info' | 'warning';
  duration: number;
}

// ─── Browser Notification Permission ────────────────────────────────────────

export async function requestNotificationPermission(): Promise<NotificationPermission> {
  if (!('Notification' in window)) return 'denied';
  if (Notification.permission === 'granted') return 'granted';
  if (Notification.permission === 'denied') return 'denied';
  return Notification.requestPermission();
}

// ─── Browser Push Notification ──────────────────────────────────────────────

export function sendBrowserNotification(
  title: string,
  body: string,
  icon?: string,
): Notification | null {
  if (!('Notification' in window)) return null;
  if (Notification.permission !== 'granted') return null;
  try {
    return new Notification(title, {
      body,
      icon: icon || '/sol-coin.png',
      badge: '/sol-coin.png',
      silent: true,
    });
  } catch {
    return null;
  }
}

// ─── In-App Toast ───────────────────────────────────────────────────────────
// Uses the zustand toast store directly for reliable in-app notifications.

export function showInAppToast(
  message: string,
  type: 'success' | 'error' | 'info' | 'warning' = 'info',
  duration: number = 4000,
): void {
  // Dynamic import to avoid circular deps at module load time
  import('../stores/toastStore').then(({ useToastStore }) => {
    useToastStore.getState().addToast({ type, title: message, duration });
  }).catch(() => {
    // Fallback: dispatch DOM event
    const payload: ToastPayload = { message, type, duration };
    window.dispatchEvent(new CustomEvent('toast', { detail: payload }));
    playToastSound(type);
  });
}

// ─── Helper: should send browser notification? ──────────────────────────────

function shouldSendBrowserNotif(): boolean {
  if (typeof document === 'undefined') return false;
  return document.visibilityState !== 'visible';
}

// ═══════════════════════════════════════════════════════════════════════════════
//  SPECIFIC NOTIFICATION FUNCTIONS
// ═══════════════════════════════════════════════════════════════════════════════

export function notifyDeposit(amount: number): void {
  const solAmount = (amount / 1_000_000_000).toFixed(4);
  const message = `Deposit confirmed: ${solAmount} SOL`;

  showInAppToast(message, 'success', 5000);

  if (shouldSendBrowserNotif()) {
    sendBrowserNotification('Deposit Confirmed', message);
  }
}

export function notifyTournamentStart(roomId: string): void {
  const message = 'Tournament starting!';

  showInAppToast(message, 'info', 5000);

  if (shouldSendBrowserNotif()) {
    sendBrowserNotification('Tournament Starting', `Your tournament ${roomId.slice(0, 8)} is beginning!`);
  }
}

export function notifyTipReceived(from: string, amount: number): void {
  const solAmount = (amount / 1_000_000_000).toFixed(4);
  const message = `You received ${solAmount} SOL from @${from}`;

  showInAppToast(message, 'success', 5000);

  if (shouldSendBrowserNotif()) {
    sendBrowserNotification('Tip Received', message);
  }
}

export function notifyMissionComplete(title: string): void {
  const message = `Mission complete: ${title}`;

  showInAppToast(message, 'success', 5000);

  if (shouldSendBrowserNotif()) {
    sendBrowserNotification('Mission Complete', message);
  }
}

export function notifyLevelUp(level: number): void {
  const message = `Level up! You're now level ${level}`;

  showInAppToast(message, 'success', 6000);
  playLevelUp();

  if (shouldSendBrowserNotif()) {
    sendBrowserNotification('Level Up!', message);
  }
}
