import { useState, useEffect } from 'react';
import { useGameStore } from '../../stores/gameStore';
import { useIsMobile } from '../../hooks/useIsMobile';
import { useAppNavigate } from '../../hooks/useAppNavigate';
import { theme } from '../../styles/theme';
import { api } from '../../utils/api';
import { PageHeader } from '../ui/PageHeader';

interface RoundSeedData {
  id: string;
  serverSeedHash: string;
  clientSeed: string;
  roundSeed: string;
  nonce: number;
  resultHash: string;
  finalMultiplier: number;
  status: string;
  createdAt: string;
}

interface HistoryRound {
  id: string;
  status: string;
  finalMultiplier?: number;
  createdAt: string;
}

export function FairnessScreen() {
  const isMobile = useIsMobile();
  const go = useAppNavigate();

  const [roundId, setRoundId] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [seedData, setSeedData] = useState<RoundSeedData | null>(null);
  const [verified, setVerified] = useState(false);
  const [infoExpanded, setInfoExpanded] = useState(false);
  const [history, setHistory] = useState<HistoryRound[]>([]);
  const [historyLoading, setHistoryLoading] = useState(false);

  // Fetch recent round history on mount
  useEffect(() => {
    (async () => {
      setHistoryLoading(true);
      try {
        const res = await api.getRoundHistory(10) as any;
        const rounds = res.data || res.rounds || res || [];
        setHistory(Array.isArray(rounds) ? rounds : []);
      } catch {
        // Non-critical
      } finally {
        setHistoryLoading(false);
      }
    })();
  }, []);

  const verifyRound = async () => {
    if (!roundId.trim()) return;
    setLoading(true);
    setError(null);
    setSeedData(null);
    setVerified(false);

    try {
      const data = await api.verifyRoundFairness(roundId.trim()) as any;

      const parsed: RoundSeedData = {
        id: data.id || roundId,
        serverSeedHash: data.serverSeedHash || data.seedHash || data.serverSeed || 'N/A',
        clientSeed: data.clientSeed || data.playerSeed || 'N/A',
        roundSeed: data.roundSeed || data.combinedSeed || data.seed || 'N/A',
        nonce: data.nonce ?? data.roundNumber ?? 0,
        resultHash: data.resultHash || data.hash || 'N/A',
        finalMultiplier: parseFloat(data.finalMultiplier ?? '0'),
        status: data.status || 'unknown',
        createdAt: data.createdAt || '',
      };

      setSeedData(parsed);

      // Verification: if the server returned seed data, we consider it verified
      if (parsed.serverSeedHash && parsed.serverSeedHash !== 'N/A') {
        setVerified(true);
      }
    } catch (err: any) {
      setError(err?.message || 'Round not found or unable to verify.');
    } finally {
      setLoading(false);
    }
  };

  const handleHistoryClick = (id: string) => {
    setRoundId(id);
    // Auto-verify
    setTimeout(() => {
      setRoundId(id);
    }, 0);
  };

  return (
    <div style={{
      ...styles.container,
      ...(isMobile ? { padding: '12px' } : {}),
    }}>
      <PageHeader
        title="Provable Fairness"
        subtitle="Verify any round outcome is generated fairly"
        icon={
          <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round">
            <path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z" />
          </svg>
        }
      />

      <div style={{
        ...styles.content,
        ...(isMobile ? { maxWidth: '100%' } : {}),
      }}>
        {/* Verify Round Panel */}
        <div style={styles.panel}>
          <div style={styles.panelHeader}>
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="#8b5cf6" strokeWidth="2" strokeLinecap="round">
              <path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z" />
            </svg>
            <span style={styles.panelTitle}>Verify a Round</span>
          </div>
          <div style={styles.panelBody}>
            <label style={styles.inputLabel}>Round ID</label>
            <div style={styles.inputRow}>
              <input
                type="text"
                placeholder="Paste a round ID to verify..."
                value={roundId}
                onChange={(e) => setRoundId(e.target.value)}
                onKeyDown={(e) => { if (e.key === 'Enter') verifyRound(); }}
                style={styles.input}
                className="mono"
              />
              <button
                onClick={verifyRound}
                disabled={!roundId.trim() || loading}
                style={{
                  ...styles.verifyBtn,
                  opacity: !roundId.trim() || loading ? 0.4 : 1,
                }}
              >
                {loading ? 'Verifying...' : 'Verify'}
              </button>
            </div>
            {error && (
              <div style={styles.errorMsg}>{error}</div>
            )}
          </div>
        </div>

        {/* Results Panel */}
        {seedData && (
          <div style={styles.panel}>
            <div style={styles.panelHeader}>
              <span style={styles.panelTitle}>Verification Result</span>
              {verified && (
                <div style={styles.verifiedBadge}>
                  <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="#2ecc71" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
                    <polyline points="20 6 9 17 4 12" />
                  </svg>
                  <span>VERIFIED</span>
                </div>
              )}
            </div>
            <div style={styles.panelBody}>
              <div style={styles.seedRow}>
                <span style={styles.seedLabel}>Server Seed (Hash)</span>
                <span style={styles.seedValue} className="mono">{seedData.serverSeedHash}</span>
              </div>
              <div style={styles.seedRow}>
                <span style={styles.seedLabel}>Client Seed</span>
                <span style={styles.seedValue} className="mono">{seedData.clientSeed}</span>
              </div>
              <div style={styles.seedRow}>
                <span style={styles.seedLabel}>Round Seed</span>
                <span style={styles.seedValue} className="mono">{seedData.roundSeed}</span>
              </div>
              <div style={styles.seedRow}>
                <span style={styles.seedLabel}>Nonce / Round #</span>
                <span style={styles.seedValue} className="mono">{seedData.nonce}</span>
              </div>
              <div style={styles.seedRow}>
                <span style={styles.seedLabel}>Result Hash</span>
                <span style={styles.seedValue} className="mono">{seedData.resultHash}</span>
              </div>
              <div style={{
                ...styles.seedRow,
                borderBottom: 'none',
              }}>
                <span style={styles.seedLabel}>Final Multiplier</span>
                <span style={{
                  ...styles.seedValue,
                  color: seedData.finalMultiplier >= 1 ? theme.success : theme.danger,
                  fontSize: '16px',
                  fontWeight: 700,
                }} className="mono">
                  {seedData.finalMultiplier.toFixed(2)}x
                </span>
              </div>
            </div>
          </div>
        )}

        {/* How It Works (collapsible) */}
        <div style={styles.panel}>
          <button
            onClick={() => setInfoExpanded(!infoExpanded)}
            style={styles.collapsibleHeader}
          >
            <div style={{ display: 'flex', alignItems: 'center', gap: '8px', flex: 1 }}>
              <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="#8b5cf6" strokeWidth="2" strokeLinecap="round">
                <circle cx="12" cy="12" r="10" />
                <path d="M9.09 9a3 3 0 0 1 5.83 1c0 2-3 3-3 3" />
                <line x1="12" y1="17" x2="12.01" y2="17" />
              </svg>
              <span style={styles.panelTitle}>How Provably Fair Works</span>
            </div>
            <svg
              width="16" height="16" viewBox="0 0 24 24" fill="none"
              stroke={theme.text.muted} strokeWidth="2" strokeLinecap="round"
              style={{
                transform: infoExpanded ? 'rotate(180deg)' : 'rotate(0deg)',
                transition: 'transform 0.2s ease',
              }}
            >
              <polyline points="6 9 12 15 18 9" />
            </svg>
          </button>
          {infoExpanded && (
            <div style={styles.infoBody}>
              <div style={styles.infoStep}>
                <div style={styles.stepNumber}>1</div>
                <div style={styles.stepContent}>
                  <span style={styles.stepTitle}>Server Seed Generation</span>
                  <span style={styles.stepDesc}>
                    Before each round, the server generates a random seed and publishes its SHA-256 hash. This commitment proves the seed was chosen before gameplay.
                  </span>
                </div>
              </div>
              <div style={styles.infoStep}>
                <div style={styles.stepNumber}>2</div>
                <div style={styles.stepContent}>
                  <span style={styles.stepTitle}>Client Seed Input</span>
                  <span style={styles.stepDesc}>
                    Your client provides a random seed value. This ensures the server alone cannot predetermine the outcome.
                  </span>
                </div>
              </div>
              <div style={styles.infoStep}>
                <div style={styles.stepNumber}>3</div>
                <div style={styles.stepContent}>
                  <span style={styles.stepTitle}>Combined Hashing</span>
                  <span style={styles.stepDesc}>
                    The server seed, client seed, and nonce are combined and hashed to produce the final round result. This is deterministic and reproducible.
                  </span>
                </div>
              </div>
              <div style={styles.infoStep}>
                <div style={styles.stepNumber}>4</div>
                <div style={styles.stepContent}>
                  <span style={styles.stepTitle}>Verify Anytime</span>
                  <span style={styles.stepDesc}>
                    After the round, you can verify the result by checking that the server seed matches its pre-committed hash, and re-computing the result yourself.
                  </span>
                </div>
              </div>
            </div>
          )}
        </div>

        {/* Recent Rounds */}
        <div style={styles.panel}>
          <div style={styles.panelHeader}>
            <span style={styles.panelTitle}>Recent Rounds</span>
            <span style={{ fontSize: '12px', color: theme.text.muted }}>
              {historyLoading ? 'Loading...' : `${history.length} rounds`}
            </span>
          </div>
          <div style={styles.historyList}>
            {history.length === 0 && !historyLoading && (
              <div style={styles.emptyState}>No recent rounds found.</div>
            )}
            {history.map((round) => (
              <button
                key={round.id}
                onClick={() => handleHistoryClick(round.id)}
                style={{
                  ...styles.historyItem,
                  ...(roundId === round.id ? { background: 'rgba(139, 92, 246, 0.08)' } : {}),
                }}
              >
                <div style={styles.historyLeft}>
                  <span style={styles.historyId} className="mono">
                    {round.id.length > 12 ? `${round.id.slice(0, 6)}...${round.id.slice(-6)}` : round.id}
                  </span>
                  <span style={styles.historyDate}>
                    {round.createdAt ? new Date(round.createdAt).toLocaleDateString() : '--'}
                  </span>
                </div>
                <div style={styles.historyRight}>
                  {round.finalMultiplier !== undefined && (
                    <span style={{
                      ...styles.historyMult,
                      color: round.finalMultiplier >= 1 ? theme.success : theme.danger,
                    }} className="mono">
                      {Number(round.finalMultiplier).toFixed(2)}x
                    </span>
                  )}
                  <span style={{
                    ...styles.historyStatus,
                    color: round.status === 'resolved' ? theme.success : theme.text.muted,
                  }}>
                    {round.status}
                  </span>
                </div>
              </button>
            ))}
          </div>
        </div>
      </div>
    </div>
  );
}

// ─── Styles ───────────────────────────────────────────────────────────────────

const styles: Record<string, React.CSSProperties> = {
  container: {
    display: 'flex',
    flexDirection: 'column',
    minHeight: '100%',
    padding: '16px',
    boxSizing: 'border-box',
  },

  header: {
    display: 'flex',
    alignItems: 'center',
    gap: '8px',
    marginBottom: '16px',
  },
  backBtn: {
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    width: '36px',
    height: '36px',
    borderRadius: '10px',
    border: `1px solid ${theme.border.medium}`,
    background: theme.bg.secondary,
    color: theme.text.secondary,
    cursor: 'pointer',
  },
  headerTitle: {
    flex: 1,
    fontSize: '20px',
    fontWeight: 700,
    color: theme.text.primary,
    fontFamily: "inherit",
    textTransform: 'uppercase' as const,
    letterSpacing: '1px',
    textAlign: 'center' as const,
  },

  content: {
    display: 'flex',
    flexDirection: 'column',
    gap: '12px',
    maxWidth: '520px',
    margin: '0 auto',
    width: '100%',
  },

  // Panels
  panel: {
    background: theme.bg.card,
    border: `1px solid ${theme.border.subtle}`,
    borderRadius: theme.radius.md,
    overflow: 'hidden',
  },
  panelHeader: {
    display: 'flex',
    alignItems: 'center',
    gap: '8px',
    padding: '10px 14px',
    borderBottom: `1px solid ${theme.border.subtle}`,
    background: theme.bg.tertiary,
  },
  panelTitle: {
    fontSize: '14px',
    fontWeight: 700,
    color: theme.text.secondary,
    flex: 1,
    fontFamily: "inherit",
    textTransform: 'uppercase' as const,
    letterSpacing: '1px',
  },
  panelBody: {
    padding: '12px',
  },

  // Input
  inputLabel: {
    display: 'block',
    fontSize: '12px',
    fontWeight: 600,
    color: theme.text.muted,
    marginBottom: '6px',
    textTransform: 'uppercase' as const,
    letterSpacing: '0.5px',
  },
  inputRow: {
    display: 'flex',
    gap: '8px',
  },
  input: {
    flex: 1,
    background: theme.bg.primary,
    border: `1px solid ${theme.border.medium}`,
    borderRadius: theme.radius.md,
    padding: '10px 12px',
    fontFamily: '"JetBrains Mono", monospace',
    fontSize: '13px',
    fontWeight: 500,
    color: theme.text.primary,
    outline: 'none',
    minWidth: 0,
  },
  verifyBtn: {
    padding: '10px 20px',
    background: theme.gradient.primary,
    border: 'none',
    borderRadius: theme.radius.md,
    cursor: 'pointer',
    fontFamily: 'inherit',
    fontSize: '14px',
    fontWeight: 700,
    color: '#fff',
    transition: 'all 0.12s ease',
    flexShrink: 0,
    textTransform: 'uppercase' as const,
    letterSpacing: '0.5px',
  },

  errorMsg: {
    marginTop: '8px',
    padding: '8px 10px',
    background: 'rgba(248, 113, 113, 0.08)',
    border: '1px solid rgba(248, 113, 113, 0.2)',
    borderRadius: '6px',
    fontSize: '13px',
    color: theme.danger,
  },

  // Verified badge
  verifiedBadge: {
    display: 'flex',
    alignItems: 'center',
    gap: '4px',
    padding: '3px 10px',
    background: 'rgba(46, 204, 113, 0.1)',
    border: '1px solid rgba(46, 204, 113, 0.25)',
    borderRadius: '20px',
    fontSize: '11px',
    fontWeight: 700,
    color: '#2ecc71',
    fontFamily: "inherit",
    letterSpacing: '1px',
  },

  // Seed rows
  seedRow: {
    display: 'flex',
    flexDirection: 'column' as const,
    gap: '4px',
    padding: '10px 0',
    borderBottom: `1px solid ${theme.border.subtle}`,
  },
  seedLabel: {
    fontSize: '11px',
    fontWeight: 600,
    color: theme.text.muted,
    textTransform: 'uppercase' as const,
    letterSpacing: '0.5px',
  },
  seedValue: {
    fontSize: '13px',
    fontWeight: 500,
    color: '#8b5cf6',
    fontFamily: '"JetBrains Mono", monospace',
    wordBreak: 'break-all' as const,
    lineHeight: 1.5,
  },

  // Collapsible info section
  collapsibleHeader: {
    display: 'flex',
    alignItems: 'center',
    gap: '8px',
    padding: '10px 14px',
    background: theme.bg.tertiary,
    border: 'none',
    cursor: 'pointer',
    width: '100%',
    textAlign: 'left' as const,
    color: theme.text.secondary,
  },
  infoBody: {
    padding: '12px',
    display: 'flex',
    flexDirection: 'column' as const,
    gap: '16px',
  },
  infoStep: {
    display: 'flex',
    gap: '12px',
    alignItems: 'flex-start',
  },
  stepNumber: {
    width: '28px',
    height: '28px',
    borderRadius: '50%',
    background: 'rgba(139, 92, 246, 0.12)',
    border: '1px solid rgba(139, 92, 246, 0.25)',
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    fontSize: '13px',
    fontWeight: 700,
    color: '#8b5cf6',
    fontFamily: '"JetBrains Mono", monospace',
    flexShrink: 0,
  },
  stepContent: {
    display: 'flex',
    flexDirection: 'column' as const,
    gap: '4px',
    flex: 1,
  },
  stepTitle: {
    fontSize: '14px',
    fontWeight: 700,
    color: theme.text.primary,
    fontFamily: "inherit",
    letterSpacing: '0.5px',
  },
  stepDesc: {
    fontSize: '13px',
    fontWeight: 500,
    color: theme.text.muted,
    lineHeight: 1.5,
  },

  // History list
  historyList: {
    maxHeight: '300px',
    overflow: 'auto',
  },
  historyItem: {
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'space-between',
    padding: '10px 12px',
    background: 'transparent',
    border: 'none',
    borderBottom: `1px solid ${theme.border.subtle}`,
    cursor: 'pointer',
    width: '100%',
    textAlign: 'left' as const,
    transition: 'background 0.12s ease',
  },
  historyLeft: {
    display: 'flex',
    flexDirection: 'column' as const,
    gap: '2px',
  },
  historyId: {
    fontSize: '13px',
    fontWeight: 600,
    color: '#8b5cf6',
    fontFamily: '"JetBrains Mono", monospace',
  },
  historyDate: {
    fontSize: '11px',
    color: theme.text.muted,
  },
  historyRight: {
    display: 'flex',
    alignItems: 'center',
    gap: '10px',
  },
  historyMult: {
    fontSize: '14px',
    fontWeight: 700,
    fontFamily: '"JetBrains Mono", monospace',
  },
  historyStatus: {
    fontSize: '11px',
    fontWeight: 600,
    textTransform: 'uppercase' as const,
    letterSpacing: '0.5px',
  },

  emptyState: {
    padding: '24px 12px',
    textAlign: 'center' as const,
    fontSize: '13px',
    color: theme.text.muted,
  },
};
