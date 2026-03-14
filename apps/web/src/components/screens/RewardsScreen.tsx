import { useEffect, useState } from 'react';
import { api } from '../../utils/api';
import { useGameStore } from '../../stores/gameStore';
import { useIsMobile } from '../../hooks/useIsMobile';
import { theme } from '../../styles/theme';
import { formatSol } from '../../utils/sol';
import { CheckIcon, PackageIcon, PartyIcon, GiftIcon } from '../ui/GameIcons';

interface Mission {
  id: string;
  title: string;
  description: string;
  progress: number;
  target: number;
  reward: number;
  completed: boolean;
  claimed: boolean;
}

interface Achievement {
  id: string;
  title: string;
  description: string;
  unlockedAt: string | null;
}

interface RakebackInfo {
  rate: number;
  tier: string;
  accumulated: number;
  claimable: number;
}

interface DailyBoxInfo {
  available: boolean;
  nextAvailableAt: string | null;
  level: number;
  vipTier: string;
  rewardTable: Array<{ rarity: string; probability: number; amountLamports: number }>;
  nextTierRewards: { tier: string; rewards: Array<{ rarity: string; probability: number; amountLamports: number }> } | null;
  history: Array<{ id: string; claimedAt: string; rarity: string; amountLamports: number; userLevel: number; vipTier: string }>;
}

const RARITY_COLORS: Record<string, string> = {
  common: '#9ca3af',
  uncommon: '#34d399',
  rare: '#5b8def',
  epic: '#c084fc',
  legendary: '#fbbf24',
};

const RARITY_GLOW: Record<string, string> = {
  common: 'rgba(156, 163, 175, 0.3)',
  uncommon: 'rgba(52, 211, 153, 0.3)',
  rare: 'rgba(91, 141, 239, 0.3)',
  epic: 'rgba(192, 132, 252, 0.4)',
  legendary: 'rgba(251, 191, 36, 0.5)',
};

export function RewardsScreen() {
  const isMobile = useIsMobile();
  const profile = useGameStore((s) => s.profile);
  const syncProfile = useGameStore((s) => s.syncProfile);
  const [tab, setTab] = useState<'missions' | 'achievements' | 'rakeback' | 'daily-box' | 'affiliates'>('missions');
  const [missions, setMissions] = useState<Mission[]>([]);
  const [achievements, setAchievements] = useState<Achievement[]>([]);
  const [rakebackInfo, setRakebackInfo] = useState<RakebackInfo | null>(null);
  const [dailyBoxInfo, setDailyBoxInfo] = useState<DailyBoxInfo | null>(null);
  const [boxResult, setBoxResult] = useState<{ rarity: string; amountLamports: number } | null>(null);
  const [isOpening, setIsOpening] = useState(false);
  const [countdown, setCountdown] = useState('');
  const [loading, setLoading] = useState(true);
  const [claiming, setClaiming] = useState<string | null>(null);
  const [claimMsg, setClaimMsg] = useState('');
  const [referralStats, setReferralStats] = useState<{
    referralCode: string;
    referredCount: number;
    totalWagered: number;
    totalEarned: number;
    claimable: number;
    referredUsers: Array<{ username: string; joinedAt: string; totalWagered: number; yourEarnings: number }>;
  } | null>(null);
  const [copied, setCopied] = useState(false);
  const [editingCode, setEditingCode] = useState(false);
  const [customCode, setCustomCode] = useState('');
  const [savingCode, setSavingCode] = useState(false);
  const [codeMsg, setCodeMsg] = useState<{ type: 'success' | 'error'; text: string } | null>(null);

  useEffect(() => {
    loadData();
  }, [tab]);

  // Countdown timer for daily box cooldown
  useEffect(() => {
    if (!dailyBoxInfo?.nextAvailableAt || dailyBoxInfo.available) {
      setCountdown('');
      return;
    }
    const target = new Date(dailyBoxInfo.nextAvailableAt).getTime();
    const tick = () => {
      const remaining = target - Date.now();
      if (remaining <= 0) {
        setCountdown('');
        loadData();
        return;
      }
      const h = Math.floor(remaining / 3600000);
      const m = Math.floor((remaining % 3600000) / 60000);
      const s = Math.floor((remaining % 60000) / 1000);
      setCountdown(`${h}h ${m}m ${s}s`);
    };
    tick();
    const interval = setInterval(tick, 1000);
    return () => clearInterval(interval);
  }, [dailyBoxInfo?.nextAvailableAt, dailyBoxInfo?.available]);

  async function loadData() {
    setLoading(true);
    setClaimMsg('');
    try {
      if (tab === 'missions') {
        const res = await api.getMissions();
        setMissions(res.data || []);
      } else if (tab === 'achievements') {
        const res = await api.getAchievements();
        setAchievements(res.data || []);
      } else if (tab === 'rakeback') {
        const res = await api.getRakeback();
        setRakebackInfo(res);
      } else if (tab === 'daily-box') {
        const res = await api.getDailyBox();
        setDailyBoxInfo(res);
        setBoxResult(null);
        setIsOpening(false);
      } else if (tab === 'affiliates') {
        const res = await api.getReferralStats();
        setReferralStats(res);
      }
    } catch {
      // ignore
    } finally {
      setLoading(false);
    }
  }

  async function handleClaimMission(id: string) {
    setClaiming(id);
    setClaimMsg('');
    try {
      const res = await api.claimMission(id);
      setClaimMsg(res.message || 'Reward claimed!');
      await syncProfile();
      await loadData();
    } catch (err: any) {
      setClaimMsg(err.message || 'Claim failed');
    } finally {
      setClaiming(null);
    }
  }

  async function handleClaimRakeback() {
    setClaiming('rakeback');
    setClaimMsg('');
    try {
      const res = await api.claimRakeback();
      if (res.success) {
        setClaimMsg(`Claimed ${formatSol(res.claimed || 0)} SOL!`);
        await syncProfile();
        await loadData();
      } else {
        setClaimMsg(res.message || 'Nothing to claim');
      }
    } catch (err: any) {
      setClaimMsg(err.message || 'Claim failed');
    } finally {
      setClaiming(null);
    }
  }

  async function handleClaimDailyBox() {
    setIsOpening(true);
    setBoxResult(null);
    setClaimMsg('');
    try {
      // Animation buildup delay
      await new Promise((r) => setTimeout(r, 2500));
      const res = await api.claimDailyBox();
      if (res.success && res.reward) {
        setBoxResult({ rarity: res.reward.rarity, amountLamports: res.reward.amountLamports });
        await syncProfile();
        const updated = await api.getDailyBox();
        setDailyBoxInfo(updated);
      } else {
        setClaimMsg(res.message || 'Already claimed today');
        setIsOpening(false);
      }
    } catch (err: any) {
      setClaimMsg(err.message || 'Claim failed');
      setIsOpening(false);
    }
  }

  async function handleClaimReferral() {
    setClaiming('referral');
    setClaimMsg('');
    try {
      const res = await api.claimReferralEarnings();
      if (res.success) {
        setClaimMsg(`Claimed ${formatSol(res.claimed || 0)} SOL!`);
        await syncProfile();
        await loadData();
      } else {
        setClaimMsg(res.message || 'Nothing to claim');
      }
    } catch (err: any) {
      setClaimMsg(err.message || 'Claim failed');
    } finally {
      setClaiming(null);
    }
  }

  function formatReward(lamports: number): string {
    return `${(lamports / 1_000_000_000).toFixed(2)} SOL`;
  }

  return (
    <div style={{
      ...styles.container,
      ...(isMobile ? { padding: '10px' } : {}),
    }}>
      {/* Tabs */}
      <div style={{
        ...styles.tabBar,
        ...(isMobile ? { overflowX: 'auto', WebkitOverflowScrolling: 'touch', gap: '2px' } : {}),
      }} className="card-enter card-enter-1">
        {(['missions', 'achievements', 'rakeback', 'daily-box', 'affiliates'] as const).map((t) => (
          <button
            key={t}
            onClick={() => setTab(t)}
            style={{
              ...styles.tab,
              ...(tab === t ? styles.tabActive : {}),
              ...(isMobile ? { fontSize: '12px', padding: '8px 10px', whiteSpace: 'nowrap' } : {}),
            }}
          >
            {t === 'daily-box' ? 'Box' : t === 'affiliates' ? 'Affiliates' : t.charAt(0).toUpperCase() + t.slice(1)}
          </button>
        ))}
      </div>

      {claimMsg && <div style={styles.claimMsg}>{claimMsg}</div>}

      {/* Content */}
      <div style={styles.panel} className="card-enter card-enter-2">
        {tab === 'missions' && (
          <>
            <div style={styles.panelHeader}>
              <span style={styles.panelTitle}>Daily missions</span>
            </div>
            <div style={styles.list}>
              {loading ? (
                <div style={styles.empty}>Loading missions...</div>
              ) : missions.length === 0 ? (
                <div style={styles.empty}>No missions available</div>
              ) : (
                missions.map((m) => (
                  <div key={m.id} className="table-row-hover" style={{
                    ...styles.missionRow,
                    opacity: m.completed ? 0.7 : 1,
                  }}>
                    <div style={styles.missionLeft}>
                      <div style={styles.missionTitle}>
                        {m.completed && <span style={styles.checkMark}><CheckIcon size={12} color="#34d399" /></span>}
                        {m.title}
                      </div>
                      <div style={styles.missionDesc}>{m.description}</div>
                      <div style={styles.progressTrack}>
                        <div style={{
                          ...styles.progressFill,
                          width: `${Math.min((m.progress / m.target) * 100, 100)}%`,
                          background: m.completed ? theme.success : '#7717ff',
                          boxShadow: m.completed
                            ? '0 0 8px rgba(52, 211, 153, 0.3)'
                            : '0 0 8px rgba(119, 23, 255, 0.3)',
                        }} />
                      </div>
                      <div style={styles.progressLabel} className="mono">
                        {m.progress >= m.target ? m.target : m.progress}/{m.target}
                      </div>
                    </div>
                    <div style={styles.missionReward}>
                      <span style={styles.rewardLabel}>Reward</span>
                      <span style={styles.rewardValue} className="mono">
                        <img src="/sol-coin.png" alt="SOL" style={{ width: 22, height: 22, marginRight: 4, verticalAlign: 'middle' }} />
                        {formatReward(m.reward)}
                      </span>
                      {m.completed && !m.claimed && (
                        <button
                          style={{
                            ...styles.claimBtn,
                            opacity: claiming === m.id ? 0.6 : 1,
                          }}
                          onClick={() => handleClaimMission(m.id)}
                          disabled={claiming === m.id}
                        >
                          {claiming === m.id ? 'Claiming...' : 'Claim'}
                        </button>
                      )}
                      {m.completed && m.claimed && (
                        <span style={{ fontSize: 13, color: '#34d399', fontWeight: 600 }}>Claimed ✓</span>
                      )}
                    </div>
                  </div>
                ))
              )}
            </div>
          </>
        )}

        {tab === 'achievements' && (
          <>
            <div style={styles.panelHeader}>
              <span style={styles.panelTitle}>Achievements</span>
            </div>
            <div style={styles.list}>
              {loading ? (
                <div style={styles.empty}>Loading achievements...</div>
              ) : (
                achievements.map((a) => (
                  <div key={a.id} className="table-row-hover" style={{
                    ...styles.achievementRow,
                    opacity: a.unlockedAt ? 1 : 0.4,
                  }}>
                    <div
                      style={styles.achieveIcon}
                      className={a.unlockedAt ? 'badge-metallic' : undefined}
                    >
                      {a.unlockedAt ? '★' : '☆'}
                    </div>
                    <div style={styles.achieveInfo}>
                      <div style={styles.achieveTitle}>{a.title}</div>
                      <div style={styles.achieveDesc}>{a.description}</div>
                    </div>
                    <div>
                      {a.unlockedAt ? (
                        <span style={styles.statusUnlocked}>Unlocked</span>
                      ) : (
                        <span style={styles.statusLocked}>Locked</span>
                      )}
                    </div>
                  </div>
                ))
              )}
            </div>
          </>
        )}

        {tab === 'rakeback' && (
          <>
            <div style={styles.panelHeader}>
              <span style={styles.panelTitle}>Rakeback</span>
            </div>
            <div style={styles.rakebackBody}>
              <div style={styles.rakebackCard} className="gradient-border">
                <div style={styles.rakebackLabel}>Your rakeback rate</div>
                <div style={styles.rakebackRate} className="mono">
                  {rakebackInfo ? `${(rakebackInfo.rate * 100).toFixed(1)}%` : '...'}
                </div>
                <div style={styles.rakebackTier}>
                  VIP {rakebackInfo?.tier || profile.vipTier}
                </div>

                {rakebackInfo && rakebackInfo.claimable > 0 && (
                  <div style={styles.claimSection}>
                    <div style={styles.claimableLabel}>Claimable</div>
                    <div style={styles.claimableValue} className="mono">
                      {formatSol(rakebackInfo.claimable)} SOL
                    </div>
                    <button
                      style={{
                        ...styles.claimRakebackBtn,
                        opacity: claiming === 'rakeback' ? 0.6 : 1,
                      }}
                      onClick={handleClaimRakeback}
                      disabled={claiming === 'rakeback'}
                    >
                      {claiming === 'rakeback' ? 'Claiming...' : 'Claim Rakeback'}
                    </button>
                  </div>
                )}
              </div>

              <div style={styles.rakebackInfo}>
                <p style={styles.rakebackText}>
                  Earn back a percentage of platform fees on every round you play.
                  Higher VIP tiers unlock better rakeback rates.
                </p>
                <div style={styles.rakebackTiers}>
                  {[
                    { tier: 'Bronze', rate: '1%' },
                    { tier: 'Silver', rate: '2%' },
                    { tier: 'Gold', rate: '3%' },
                    { tier: 'Platinum', rate: '5%' },
                    { tier: 'Titan', rate: '8%' },
                  ].map((t) => {
                    const isActive = t.tier.toLowerCase() === (rakebackInfo?.tier || profile.vipTier);
                    return (
                      <div key={t.tier} className="table-row-hover" style={{
                        ...styles.tierRow,
                        color: isActive ? '#c084fc' : theme.text.muted,
                        ...(isActive ? styles.tierRowActive : {}),
                      }}>
                        <span>{t.tier}</span>
                        <span className="mono">{t.rate}</span>
                      </div>
                    );
                  })}
                </div>
              </div>
            </div>
          </>
        )}

        {tab === 'affiliates' && (
          <>
            <div style={styles.panelHeader}>
              <span style={styles.panelTitle}>Affiliate Program</span>
              <span style={{ fontSize: '12px', color: theme.text.muted }}>Earn 20% of platform fees</span>
            </div>
            <div style={{ flex: 1, overflow: 'auto', padding: '16px' }}>
              {loading ? (
                <div style={styles.empty}>Loading...</div>
              ) : referralStats && (
                <>
                  {/* Referral Code Card */}
                  <div style={affStyles.codeCard} className="gradient-border">
                    <div style={{ fontSize: '13px', color: theme.text.muted }}>Your referral code</div>
                    {!editingCode ? (
                      <>
                        <div style={affStyles.codeRow}>
                          <span className="mono" style={affStyles.code}>{referralStats.referralCode}</span>
                          <button
                            style={affStyles.copyBtn}
                            onClick={() => {
                              navigator.clipboard.writeText(referralStats.referralCode);
                              setCopied(true);
                              setTimeout(() => setCopied(false), 2000);
                            }}
                          >
                            {copied ? 'Copied!' : 'Copy'}
                          </button>
                          <button
                            style={{ ...affStyles.copyBtn, background: 'rgba(119, 23, 255, 0.15)', color: '#c084fc', border: '1px solid rgba(119, 23, 255, 0.3)' }}
                            onClick={() => { setEditingCode(true); setCustomCode(referralStats.referralCode); setCodeMsg(null); }}
                          >
                            Edit
                          </button>
                        </div>
                      </>
                    ) : (
                      <>
                        <div style={{ display: 'flex', gap: '8px', alignItems: 'center', marginTop: '6px' }}>
                          <input
                            type="text"
                            value={customCode}
                            onChange={(e) => setCustomCode(e.target.value.toUpperCase().replace(/[^A-Z0-9_-]/g, ''))}
                            maxLength={20}
                            placeholder="Your custom code"
                            style={{
                              flex: 1,
                              padding: '8px 12px',
                              background: 'rgba(15, 10, 25, 0.6)',
                              border: '1px solid rgba(119, 23, 255, 0.3)',
                              borderRadius: '8px',
                              color: '#fff',
                              fontSize: '16px',
                              fontFamily: 'monospace',
                              fontWeight: 700,
                              letterSpacing: '2px',
                              outline: 'none',
                            }}
                          />
                          <button
                            style={{ ...affStyles.copyBtn, background: 'rgba(20, 241, 149, 0.15)', color: '#14F195', border: '1px solid rgba(20, 241, 149, 0.3)' }}
                            disabled={savingCode || customCode.length < 3}
                            onClick={async () => {
                              setSavingCode(true);
                              setCodeMsg(null);
                              try {
                                const res = await api.updateReferralCode(customCode);
                                setReferralStats({ ...referralStats, referralCode: res.code });
                                setEditingCode(false);
                                setCodeMsg({ type: 'success', text: 'Referral code updated!' });
                              } catch (err: any) {
                                setCodeMsg({ type: 'error', text: err?.message || 'Failed to update code' });
                              } finally {
                                setSavingCode(false);
                              }
                            }}
                          >
                            {savingCode ? '...' : 'Save'}
                          </button>
                          <button
                            style={{ ...affStyles.copyBtn, background: 'rgba(248, 113, 113, 0.1)', color: '#f87171', border: '1px solid rgba(248, 113, 113, 0.2)' }}
                            onClick={() => { setEditingCode(false); setCodeMsg(null); }}
                          >
                            Cancel
                          </button>
                        </div>
                        <div style={{ fontSize: '11px', color: theme.text.muted, marginTop: '4px' }}>
                          3-20 characters. Letters, numbers, hyphens and underscores only.
                        </div>
                      </>
                    )}
                    {codeMsg && (
                      <div style={{ fontSize: '12px', fontWeight: 600, marginTop: '6px', color: codeMsg.type === 'success' ? '#14F195' : '#f87171' }}>
                        {codeMsg.text}
                      </div>
                    )}
                    <div style={{ fontSize: '12px', color: theme.text.muted, marginTop: '4px' }}>
                      Share this code — you earn 20% of platform fees from your referrals' bets
                    </div>
                  </div>

                  {/* Stats Grid */}
                  <div style={{
                    ...affStyles.statsGrid,
                    ...(isMobile ? { gridTemplateColumns: 'repeat(2, 1fr)' } : {}),
                  }}>
                    <div style={affStyles.statCard}>
                      <div style={affStyles.statLabel}>Referred Users</div>
                      <div className="mono" style={affStyles.statValue}>{referralStats.referredCount}</div>
                    </div>
                    <div style={affStyles.statCard}>
                      <div style={affStyles.statLabel}>Total Wagered</div>
                      <div className="mono" style={affStyles.statValue}>
                        <img src="/sol-coin.png" alt="SOL" style={{ width: 16, height: 16, marginRight: 3 }} />
                        {formatSol(referralStats.totalWagered)}
                      </div>
                    </div>
                    <div style={affStyles.statCard}>
                      <div style={affStyles.statLabel}>Total Earned</div>
                      <div className="mono" style={{ ...affStyles.statValue, color: theme.success }}>
                        <img src="/sol-coin.png" alt="SOL" style={{ width: 16, height: 16, marginRight: 3 }} />
                        {formatSol(referralStats.totalEarned)}
                      </div>
                    </div>
                  </div>

                  {/* Claim Section */}
                  {referralStats.claimable > 0 && (
                    <div style={affStyles.claimCard}>
                      <div style={{ fontSize: '13px', color: theme.text.muted }}>Claimable Earnings</div>
                      <div className="mono" style={affStyles.claimableAmount}>
                        <img src="/sol-coin.png" alt="SOL" style={{ width: 24, height: 24, marginRight: 4 }} />
                        {formatSol(referralStats.claimable)} SOL
                      </div>
                      <button
                        className="btn-3d btn-3d-success"
                        style={{ padding: '10px 28px', fontSize: '15px' }}
                        onClick={handleClaimReferral}
                        disabled={claiming === 'referral'}
                      >
                        {claiming === 'referral' ? 'Claiming...' : 'Claim Earnings'}
                      </button>
                    </div>
                  )}

                  {/* Referred Users List */}
                  {referralStats.referredUsers.length > 0 && (
                    <div style={{ marginTop: '16px' }}>
                      <div style={{ fontSize: '14px', fontWeight: 600, color: theme.text.secondary, marginBottom: '8px' }}>
                        Your Referrals
                      </div>
                      {referralStats.referredUsers.map((u) => (
                        <div key={u.username} className="table-row-hover" style={affStyles.userRow}>
                          <div style={{ flex: 1 }}>
                            <div style={{ fontSize: '14px', fontWeight: 600, color: theme.text.primary }}>{u.username}</div>
                            <div style={{ fontSize: '12px', color: theme.text.muted }}>
                              Joined {new Date(u.joinedAt).toLocaleDateString()}
                            </div>
                          </div>
                          <div style={{ textAlign: 'right' as const }}>
                            <div className="mono" style={{ fontSize: '13px', color: theme.text.primary, display: 'flex', alignItems: 'center', justifyContent: 'flex-end', gap: '3px' }}>
                              <img src="/sol-coin.png" alt="SOL" style={{ width: 14, height: 14 }} />
                              {formatSol(u.totalWagered)} wagered
                            </div>
                            <div className="mono" style={{ fontSize: '13px', color: theme.success, display: 'flex', alignItems: 'center', justifyContent: 'flex-end', gap: '3px' }}>
                              <img src="/sol-coin.png" alt="SOL" style={{ width: 14, height: 14 }} />
                              +{formatSol(u.yourEarnings)} earned
                            </div>
                          </div>
                        </div>
                      ))}
                    </div>
                  )}

                  {referralStats.referredUsers.length === 0 && (
                    <div style={styles.empty}>
                      No referrals yet. Share your code to start earning!
                    </div>
                  )}
                </>
              )}
            </div>
          </>
        )}

        {tab === 'daily-box' && (
          <>
            <div style={styles.panelHeader}>
              <span style={styles.panelTitle}>Daily Mystery Box</span>
              <span style={{ fontSize: '12px', color: theme.text.muted }}>
                {dailyBoxInfo ? `${dailyBoxInfo.vipTier.charAt(0).toUpperCase() + dailyBoxInfo.vipTier.slice(1)} · Lv ${dailyBoxInfo.level}` : ''}
              </span>
            </div>
            <div style={{ flex: 1, overflow: 'auto', padding: '16px' }}>
              {loading ? (
                <div style={styles.empty}>Loading...</div>
              ) : dailyBoxInfo && (
                <>
                  {/* Mystery Box Visual */}
                  <div style={dbStyles.boxContainer}>
                    {isOpening && !boxResult ? (
                      /* Opening animation */
                      <div style={dbStyles.boxOpening}>
                        <div className="mystery-box-shake" style={{ lineHeight: 1 }}><PackageIcon size={60} color="#c084fc" /></div>
                        <div style={{ marginTop: '4px', animation: 'glowPulse 0.5s ease-in-out infinite', opacity: 0.8 }}><GiftIcon size={22} color="#fbbf24" /></div>
                        <div style={{ fontSize: '13px', color: theme.text.muted, marginTop: '8px' }}>Opening...</div>
                      </div>
                    ) : boxResult ? (
                      /* Result reveal */
                      <div className="mystery-box-burst" style={{
                        ...dbStyles.resultCard,
                        borderColor: RARITY_COLORS[boxResult.rarity] || '#9ca3af',
                        boxShadow: `0 0 30px ${RARITY_GLOW[boxResult.rarity] || 'rgba(156,163,175,0.3)'}, 0 0 60px ${RARITY_GLOW[boxResult.rarity] || 'rgba(156,163,175,0.3)'}`,
                      }}>
                        <div style={{
                          fontSize: '12px',
                          fontWeight: 700,
                          color: RARITY_COLORS[boxResult.rarity] || '#9ca3af',
                          textTransform: 'uppercase',
                          letterSpacing: '2px',
                          textShadow: `0 0 12px ${RARITY_GLOW[boxResult.rarity] || 'rgba(156,163,175,0.3)'}`,
                        }}>
                          {boxResult.rarity}
                        </div>
                        <div className="mono rarity-glow" style={{
                          fontSize: '30px',
                          fontWeight: 900,
                          color: RARITY_COLORS[boxResult.rarity] || '#9ca3af',
                          textShadow: `0 0 20px ${RARITY_GLOW[boxResult.rarity] || 'rgba(156,163,175,0.3)'}`,
                          display: 'flex',
                          alignItems: 'center',
                          gap: '6px',
                        }}>
                          <img src="/sol-coin.png" alt="SOL" style={{ width: 28, height: 28 }} />
                          {formatSol(boxResult.amountLamports)} SOL
                        </div>
                        <div style={{ marginTop: '4px' }}><PartyIcon size={34} color={RARITY_COLORS[boxResult.rarity] || '#9ca3af'} /></div>
                        <button
                          className="btn-3d btn-3d-primary"
                          style={{ marginTop: '12px', padding: '8px 28px', fontSize: '14px' }}
                          onClick={() => { setBoxResult(null); setIsOpening(false); }}
                        >
                          Collect
                        </button>
                      </div>
                    ) : (
                      /* Idle state */
                      <div style={dbStyles.boxIdle}>
                        <div style={{ lineHeight: 1 }}><GiftIcon size={60} color="#c084fc" /></div>
                        <div style={{ fontSize: '13px', color: theme.text.muted, marginTop: '6px' }}>
                          Daily Mystery Box
                        </div>
                        {dailyBoxInfo.available ? (
                          <button
                            className="btn-3d btn-3d-success"
                            style={{ padding: '10px 28px', fontSize: '15px', marginTop: '10px' }}
                            onClick={handleClaimDailyBox}
                          >
                            Open Mystery Box
                          </button>
                        ) : (
                          <div style={{ textAlign: 'center', marginTop: '10px' }}>
                            <div style={{ fontSize: '12px', color: theme.text.muted }}>Next box in</div>
                            <div className="mono" style={{
                              fontSize: '20px',
                              fontWeight: 700,
                              color: '#c084fc',
                              textShadow: '0 0 12px rgba(192, 132, 252, 0.4)',
                            }}>
                              {countdown || '...'}
                            </div>
                          </div>
                        )}
                      </div>
                    )}
                  </div>

                  {/* Reward Table */}
                  <div style={dbStyles.section}>
                    <div style={dbStyles.sectionTitle}>
                      Possible rewards — {dailyBoxInfo.vipTier.charAt(0).toUpperCase() + dailyBoxInfo.vipTier.slice(1)} tier
                    </div>
                    {dailyBoxInfo.rewardTable.map((r) => (
                      <div key={r.rarity} className="table-row-hover" style={dbStyles.rewardRow}>
                        <div style={{
                          ...dbStyles.rarityDot,
                          background: RARITY_COLORS[r.rarity] || '#9ca3af',
                          boxShadow: `0 0 6px ${RARITY_GLOW[r.rarity] || 'rgba(156,163,175,0.3)'}`,
                        }} />
                        <span style={{
                          fontSize: '14px',
                          fontWeight: 600,
                          color: RARITY_COLORS[r.rarity] || '#9ca3af',
                          flex: 1,
                          textTransform: 'capitalize',
                        }}>
                          {r.rarity}
                        </span>
                        <span className="mono" style={{ fontSize: '13px', color: theme.text.muted, width: '50px', textAlign: 'right' }}>
                          {(r.probability * 100).toFixed(1)}%
                        </span>
                        <span className="mono" style={{ fontSize: '14px', fontWeight: 700, color: theme.text.primary, width: '100px', textAlign: 'right', display: 'flex', alignItems: 'center', justifyContent: 'flex-end', gap: '4px' }}>
                          <img src="/sol-coin.png" alt="SOL" style={{ width: 16, height: 16 }} />
                          {formatSol(r.amountLamports)} SOL
                        </span>
                      </div>
                    ))}
                  </div>

                  {/* Next Tier Preview */}
                  {dailyBoxInfo.nextTierRewards && (() => {
                    const cur = dailyBoxInfo.rewardTable.find((r) => r.rarity === 'legendary');
                    const nxt = dailyBoxInfo.nextTierRewards?.rewards.find((r) => r.rarity === 'legendary');
                    if (!cur || !nxt) return null;
                    return (
                      <div style={dbStyles.nextTierBox}>
                        <div style={{ fontSize: '13px', color: theme.text.muted }}>
                          Level up to <span style={{ color: '#c084fc', fontWeight: 600 }}>
                            {dailyBoxInfo.nextTierRewards!.tier.charAt(0).toUpperCase() + dailyBoxInfo.nextTierRewards!.tier.slice(1)}
                          </span> for better rewards
                        </div>
                        <div style={{ fontSize: '13px', color: theme.text.muted, marginTop: '4px', display: 'flex', alignItems: 'center', gap: '4px' }}>
                          Legendary: {formatSol(cur.amountLamports)} →{' '}
                          <img src="/sol-coin.png" alt="SOL" style={{ width: 14, height: 14 }} />
                          <span className="mono" style={{ color: '#fbbf24', fontWeight: 700 }}>
                            {formatSol(nxt.amountLamports)} SOL
                          </span>
                        </div>
                      </div>
                    );
                  })()}

                  {/* History */}
                  {dailyBoxInfo.history.length > 0 && (
                    <div style={dbStyles.section}>
                      <div style={dbStyles.sectionTitle}>Recent claims</div>
                      {dailyBoxInfo.history.map((h) => (
                        <div key={h.id} className="table-row-hover" style={dbStyles.historyRow}>
                          <div style={{
                            ...dbStyles.rarityDot,
                            background: RARITY_COLORS[h.rarity] || '#9ca3af',
                            boxShadow: `0 0 6px ${RARITY_GLOW[h.rarity] || 'rgba(156,163,175,0.3)'}`,
                          }} />
                          <span style={{
                            fontSize: '13px',
                            color: RARITY_COLORS[h.rarity] || '#9ca3af',
                            fontWeight: 600,
                            textTransform: 'capitalize',
                            flex: 1,
                          }}>
                            {h.rarity}
                          </span>
                          <span className="mono" style={{ fontSize: '13px', color: theme.text.primary, display: 'flex', alignItems: 'center', gap: '3px' }}>
                            <img src="/sol-coin.png" alt="SOL" style={{ width: 14, height: 14 }} />
                            {formatSol(h.amountLamports)} SOL
                          </span>
                          <span style={{ fontSize: '12px', color: theme.text.muted, marginLeft: '8px' }}>
                            {new Date(h.claimedAt).toLocaleDateString()}
                          </span>
                        </div>
                      ))}
                    </div>
                  )}
                </>
              )}
            </div>
          </>
        )}
      </div>
    </div>
  );
}

const styles: Record<string, React.CSSProperties> = {
  container: {
    display: 'flex',
    flexDirection: 'column',
    gap: '12px',
    padding: '16px',
    minHeight: '100%',
    boxSizing: 'border-box',
  },
  tabBar: {
    display: 'flex',
    gap: '4px',
    background: 'rgba(28, 20, 42, 0.85)',
    backdropFilter: 'blur(12px)',
    WebkitBackdropFilter: 'blur(12px)',
    border: '1px solid rgba(255, 255, 255, 0.06)',
    borderRadius: '12px',
    padding: '4px',
  },
  tab: {
    flex: 1,
    padding: '8px 14px',
    background: 'transparent',
    border: 'none',
    borderRadius: '8px',
    color: theme.text.muted,
    fontSize: '14px',
    fontWeight: 700,
    cursor: 'pointer',
    fontFamily: 'inherit',
    transition: 'all 0.15s',
    textTransform: 'uppercase' as const,
    letterSpacing: '0.5px',
  },
  tabActive: {
    background: 'rgba(119, 23, 255, 0.15)',
    border: 'none',
    color: '#c084fc',
    boxShadow: '0 0 12px rgba(119, 23, 255, 0.3)',
  },
  panel: {
    background: 'rgba(28, 20, 42, 0.85)',
    backdropFilter: 'blur(16px)',
    WebkitBackdropFilter: 'blur(16px)',
    border: '1px solid rgba(119, 23, 255, 0.18)',
    borderRadius: '14px',
    overflow: 'hidden',
    flex: 1,
    display: 'flex',
    flexDirection: 'column',
    boxShadow: '0 4px 24px rgba(0, 0, 0, 0.3), inset 0 1px 0 rgba(255, 255, 255, 0.04)',
  },
  panelHeader: {
    display: 'flex',
    alignItems: 'center',
    gap: '8px',
    padding: '10px 14px',
    borderBottom: '1px solid rgba(119, 23, 255, 0.08)',
    background: 'rgba(32, 24, 48, 0.95)',
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
  list: {
    flex: 1,
    overflow: 'auto',
  },
  empty: {
    padding: '40px',
    textAlign: 'center',
    fontSize: '14px',
    color: theme.text.muted,
  },
  claimMsg: {
    fontSize: '14px',
    fontWeight: 600,
    color: theme.success,
    textAlign: 'center',
    padding: '4px',
  },

  // Missions
  missionRow: {
    display: 'flex',
    justifyContent: 'space-between',
    padding: '14px',
    borderBottom: '1px solid rgba(119, 23, 255, 0.06)',
    gap: '16px',
    transition: 'background-color 0.15s ease',
  },
  missionLeft: {
    flex: 1,
    display: 'flex',
    flexDirection: 'column',
    gap: '4px',
  },
  missionTitle: {
    fontSize: '15px',
    fontWeight: 700,
    color: theme.text.primary,
    display: 'flex',
    alignItems: 'center',
    gap: '6px',
  },
  checkMark: {
    color: theme.success,
    fontSize: '15px',
    textShadow: '0 0 8px rgba(52, 211, 153, 0.5)',
  },
  missionDesc: {
    fontSize: '13px',
    color: theme.text.muted,
  },
  progressTrack: {
    height: '4px',
    background: 'rgba(14, 10, 22, 0.6)',
    borderRadius: '2px',
    overflow: 'hidden',
    marginTop: '4px',
  },
  progressFill: {
    height: '100%',
    borderRadius: '2px',
    transition: 'width 0.3s ease',
  },
  progressLabel: {
    fontSize: '12px',
    color: theme.text.muted,
  },
  missionReward: {
    display: 'flex',
    flexDirection: 'column',
    alignItems: 'flex-end',
    justifyContent: 'center',
    gap: '4px',
  },
  rewardLabel: {
    fontSize: '12px',
    fontWeight: 500,
    color: theme.text.muted,
  },
  rewardValue: {
    fontSize: '15px',
    fontWeight: 700,
    color: '#c084fc',
    display: 'flex',
    alignItems: 'center',
    textShadow: '0 0 8px rgba(192, 132, 252, 0.3)',
  },
  claimBtn: {
    padding: '5px 14px',
    background: '#14F195',
    border: 'none',
    borderRadius: '8px',
    color: '#0e0a16',
    fontSize: '13px',
    fontWeight: 700,
    cursor: 'pointer',
    fontFamily: 'inherit',
    textTransform: 'uppercase' as const,
    letterSpacing: '0.3px',
    boxShadow: '0 3px 0 #0ec47a, 0 4px 8px rgba(20, 241, 149, 0.3)',
    transition: 'all 0.1s ease',
  },

  // Achievements
  achievementRow: {
    display: 'flex',
    alignItems: 'center',
    gap: '12px',
    padding: '12px 14px',
    borderBottom: '1px solid rgba(119, 23, 255, 0.06)',
    transition: 'background-color 0.15s ease',
  },
  achieveIcon: {
    fontSize: '30px',
    color: theme.warning,
    width: '48px',
    height: '48px',
    background: 'rgba(28, 20, 42, 0.85)',
    borderRadius: '12px',
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    flexShrink: 0,
    position: 'relative',
    overflow: 'hidden',
  },
  achieveInfo: {
    flex: 1,
  },
  achieveTitle: {
    fontSize: '15px',
    fontWeight: 700,
    color: theme.text.primary,
  },
  achieveDesc: {
    fontSize: '13px',
    color: theme.text.muted,
    marginTop: '2px',
  },
  statusUnlocked: {
    fontSize: '12px',
    fontWeight: 600,
    color: theme.success,
    background: 'rgba(52, 211, 153, 0.1)',
    border: '1px solid rgba(52, 211, 153, 0.2)',
    padding: '2px 8px',
    borderRadius: '10px',
    boxShadow: '0 0 8px rgba(52, 211, 153, 0.15)',
  },
  statusLocked: {
    fontSize: '12px',
    fontWeight: 600,
    color: theme.text.muted,
    background: 'rgba(74, 75, 106, 0.1)',
    border: '1px solid rgba(74, 75, 106, 0.2)',
    padding: '2px 8px',
    borderRadius: '10px',
  },

  // Rakeback
  rakebackBody: {
    padding: '16px',
    display: 'flex',
    flexDirection: 'column',
    gap: '16px',
  },
  rakebackCard: {
    display: 'flex',
    flexDirection: 'column',
    alignItems: 'center',
    gap: '4px',
    padding: '24px',
    background: 'rgba(28, 20, 42, 0.85)',
    backdropFilter: 'blur(16px)',
    border: '1px solid rgba(119, 23, 255, 0.15)',
    borderRadius: '14px',
    boxShadow: '0 4px 24px rgba(0, 0, 0, 0.3), inset 0 1px 0 rgba(255, 255, 255, 0.04)',
    position: 'relative',
    overflow: 'hidden',
  },
  rakebackLabel: {
    fontSize: '14px',
    fontWeight: 500,
    color: theme.text.muted,
  },
  rakebackRate: {
    fontSize: '38px',
    fontWeight: 900,
    color: '#c084fc',
    lineHeight: 1,
    textShadow: '0 0 20px rgba(192, 132, 252, 0.5), 0 0 40px rgba(192, 132, 252, 0.2)',
  },
  rakebackTier: {
    fontSize: '14px',
    fontWeight: 600,
    color: theme.text.secondary,
    marginTop: '4px',
  },
  claimSection: {
    display: 'flex',
    flexDirection: 'column',
    alignItems: 'center',
    gap: '6px',
    marginTop: '16px',
    paddingTop: '16px',
    borderTop: '1px solid rgba(119, 23, 255, 0.18)',
    width: '100%',
  },
  claimableLabel: {
    fontSize: '13px',
    fontWeight: 500,
    color: theme.text.muted,
  },
  claimableValue: {
    fontSize: '22px',
    fontWeight: 800,
    color: theme.success,
    textShadow: '0 0 12px rgba(52, 211, 153, 0.4)',
  },
  claimRakebackBtn: {
    padding: '12px 28px',
    background: '#14F195',
    border: 'none',
    borderRadius: '12px',
    color: '#0e0a16',
    fontSize: '16px',
    fontWeight: 700,
    cursor: 'pointer',
    fontFamily: 'inherit',
    textTransform: 'uppercase' as const,
    letterSpacing: '0.5px',
    boxShadow: '0 4px 0 #0ec47a, 0 6px 12px rgba(20, 241, 149, 0.3)',
    transition: 'all 0.1s ease',
    marginTop: '4px',
  },
  rakebackInfo: {
    display: 'flex',
    flexDirection: 'column',
    gap: '12px',
  },
  rakebackText: {
    fontSize: '14px',
    color: theme.text.muted,
    lineHeight: 1.5,
    margin: 0,
  },
  rakebackTiers: {
    display: 'flex',
    flexDirection: 'column',
    gap: '6px',
  },
  tierRow: {
    display: 'flex',
    justifyContent: 'space-between',
    fontSize: '14px',
    fontWeight: 600,
    padding: '8px 12px',
    background: 'rgba(28, 20, 42, 0.6)',
    borderRadius: '8px',
    transition: 'background-color 0.15s ease, transform 0.1s ease',
    border: '1px solid transparent',
  },
  tierRowActive: {
    border: '1px solid rgba(119, 23, 255, 0.2)',
    boxShadow: '0 0 8px rgba(119, 23, 255, 0.15)',
    background: 'rgba(119, 23, 255, 0.08)',
  },
};

// Daily Box styles
const dbStyles: Record<string, React.CSSProperties> = {
  boxContainer: {
    display: 'flex',
    justifyContent: 'center',
    alignItems: 'center',
    padding: '24px',
    minHeight: '180px',
  },
  boxIdle: {
    display: 'flex',
    flexDirection: 'column',
    alignItems: 'center',
  },
  boxOpening: {
    display: 'flex',
    flexDirection: 'column',
    alignItems: 'center',
  },
  resultCard: {
    display: 'flex',
    flexDirection: 'column',
    alignItems: 'center',
    gap: '8px',
    padding: '28px 36px',
    background: 'rgba(28, 20, 42, 0.95)',
    borderRadius: '16px',
    border: '2px solid',
  },
  section: {
    marginTop: '16px',
  },
  sectionTitle: {
    fontSize: '14px',
    fontWeight: 600,
    color: theme.text.secondary,
    marginBottom: '8px',
  },
  rewardRow: {
    display: 'flex',
    alignItems: 'center',
    gap: '8px',
    padding: '8px 12px',
    background: 'rgba(28, 20, 42, 0.6)',
    borderRadius: '8px',
    marginBottom: '4px',
    border: '1px solid transparent',
    transition: 'background-color 0.15s ease, transform 0.1s ease',
  },
  rarityDot: {
    width: '8px',
    height: '8px',
    borderRadius: '50%',
    flexShrink: 0,
  },
  nextTierBox: {
    marginTop: '12px',
    padding: '12px',
    background: 'rgba(119, 23, 255, 0.06)',
    borderRadius: '8px',
    border: '1px solid rgba(119, 23, 255, 0.12)',
  },
  historyRow: {
    display: 'flex',
    alignItems: 'center',
    gap: '8px',
    padding: '6px 12px',
    background: 'rgba(28, 20, 42, 0.4)',
    borderRadius: '6px',
    marginBottom: '3px',
    transition: 'background-color 0.15s ease, transform 0.1s ease',
  },
};

// Affiliate styles
const affStyles: Record<string, React.CSSProperties> = {
  codeCard: {
    display: 'flex',
    flexDirection: 'column',
    alignItems: 'center',
    gap: '8px',
    padding: '20px',
    background: 'rgba(28, 20, 42, 0.85)',
    borderRadius: '14px',
    border: '1px solid rgba(119, 23, 255, 0.15)',
    boxShadow: '0 4px 24px rgba(0, 0, 0, 0.3), inset 0 1px 0 rgba(255, 255, 255, 0.04)',
  },
  codeRow: {
    display: 'flex',
    alignItems: 'center',
    gap: '8px',
  },
  code: {
    fontSize: '22px',
    fontWeight: 900,
    color: '#c084fc',
    letterSpacing: '2px',
    textShadow: '0 0 12px rgba(192, 132, 252, 0.4)',
  },
  copyBtn: {
    padding: '6px 14px',
    background: 'rgba(119, 23, 255, 0.1)',
    border: '1px solid rgba(119, 23, 255, 0.25)',
    borderRadius: '8px',
    color: '#c084fc',
    fontSize: '13px',
    fontWeight: 700,
    cursor: 'pointer',
    fontFamily: 'inherit',
    transition: 'all 0.15s',
  },
  statsGrid: {
    display: 'grid',
    gridTemplateColumns: 'repeat(3, 1fr)',
    gap: '8px',
    marginTop: '16px',
  },
  statCard: {
    display: 'flex',
    flexDirection: 'column',
    alignItems: 'center',
    gap: '4px',
    padding: '14px 8px',
    background: 'rgba(28, 20, 42, 0.6)',
    borderRadius: '10px',
    border: '1px solid rgba(119, 23, 255, 0.08)',
  },
  statLabel: {
    fontSize: '12px',
    fontWeight: 500,
    color: theme.text.muted,
  },
  statValue: {
    fontSize: '16px',
    fontWeight: 800,
    color: theme.text.primary,
    display: 'flex',
    alignItems: 'center',
  },
  claimCard: {
    display: 'flex',
    flexDirection: 'column',
    alignItems: 'center',
    gap: '8px',
    padding: '16px',
    marginTop: '12px',
    background: 'rgba(52, 211, 153, 0.05)',
    borderRadius: '12px',
    border: '1px solid rgba(52, 211, 153, 0.15)',
  },
  claimableAmount: {
    fontSize: '26px',
    fontWeight: 900,
    color: theme.success,
    textShadow: '0 0 12px rgba(52, 211, 153, 0.4)',
    display: 'flex',
    alignItems: 'center',
  },
  userRow: {
    display: 'flex',
    alignItems: 'center',
    padding: '10px 12px',
    background: 'rgba(28, 20, 42, 0.4)',
    borderRadius: '8px',
    marginBottom: '4px',
    transition: 'background-color 0.15s ease, transform 0.1s ease',
  },
};
