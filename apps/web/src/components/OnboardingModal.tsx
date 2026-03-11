import { useState, useEffect, useRef, useCallback } from 'react';

const ONBOARDING_KEY = 'tradesol_onboarding_seen';

/* ────────── tutorial steps ────────── */

interface TutorialStep {
  icon: string;
  title: string;
  desc: string;
  visual: 'chart' | 'gems' | 'bet' | 'battle' | 'wallet';
  accent: string;
}

const STEPS: TutorialStep[] = [
  {
    icon: '📈',
    title: 'Predict the Chart',
    desc: 'A live chart runs for 15 seconds. Your goal is to ride the price action and hit multiplier nodes along the way.',
    visual: 'chart',
    accent: '#9945FF',
  },
  {
    icon: '💎',
    title: 'Collect Gems',
    desc: 'Green emerald gems boost your multiplier. Avoid red bombs that divide your gains. Shields protect you once.',
    visual: 'gems',
    accent: '#34d399',
  },
  {
    icon: '🎰',
    title: 'Choose Your Risk',
    desc: 'Pick your bet size and risk tier before each round. Safe, Standard, or Degen — higher risk, higher reward.',
    visual: 'bet',
    accent: '#fbbf24',
  },
  {
    icon: '⚔️',
    title: 'Battle Other Traders',
    desc: 'Enter PvP arenas. Up to 6 players compete on the same chart. Highest multiplier wins the pot.',
    visual: 'battle',
    accent: '#f87171',
  },
  {
    icon: '💰',
    title: 'Win & Withdraw SOL',
    desc: 'Winnings hit your balance instantly. Deposit and withdraw SOL anytime using your Phantom wallet.',
    visual: 'wallet',
    accent: '#14F195',
  },
];

/* ────────── mini canvas illustrations ────────── */

function drawChartVisual(ctx: CanvasRenderingContext2D, w: number, h: number, t: number) {
  ctx.clearRect(0, 0, w, h);

  // Grid lines
  ctx.strokeStyle = 'rgba(153, 69, 255, 0.08)';
  ctx.lineWidth = 1;
  for (let i = 1; i < 5; i++) {
    const gy = (h / 5) * i;
    ctx.beginPath(); ctx.moveTo(0, gy); ctx.lineTo(w, gy); ctx.stroke();
  }

  // Animated chart line
  ctx.beginPath();
  ctx.strokeStyle = '#9945FF';
  ctx.lineWidth = 2.5;
  ctx.shadowColor = '#9945FF';
  ctx.shadowBlur = 8;
  const points: [number, number][] = [];
  for (let i = 0; i <= 60; i++) {
    const x = (i / 60) * w;
    const progress = i / 60;
    const base = h * 0.6 - progress * h * 0.25;
    const wave = Math.sin(progress * 8 + t * 2) * 15 + Math.sin(progress * 3 + t) * 20;
    const y = base + wave;
    points.push([x, y]);
    if (i === 0) ctx.moveTo(x, y); else ctx.lineTo(x, y);
  }
  ctx.stroke();
  ctx.shadowBlur = 0;

  // Fill under
  ctx.lineTo(w, h); ctx.lineTo(0, h); ctx.closePath();
  const grad = ctx.createLinearGradient(0, 0, 0, h);
  grad.addColorStop(0, 'rgba(153, 69, 255, 0.12)');
  grad.addColorStop(1, 'rgba(153, 69, 255, 0)');
  ctx.fillStyle = grad;
  ctx.fill();

  // Leading dot
  const tipIdx = Math.min(59, Math.floor(((t * 0.5) % 1) * 60));
  const [tx, ty] = points[tipIdx];
  ctx.beginPath();
  ctx.arc(tx, ty, 5, 0, Math.PI * 2);
  ctx.fillStyle = '#c084fc';
  ctx.shadowColor = '#c084fc';
  ctx.shadowBlur = 12;
  ctx.fill();
  ctx.shadowBlur = 0;
}

function drawGemsVisual(ctx: CanvasRenderingContext2D, w: number, h: number, t: number) {
  ctx.clearRect(0, 0, w, h);

  // Draw 3 emerald gems
  const gemPositions = [
    { x: w * 0.2, y: h * 0.4, size: 22 },
    { x: w * 0.5, y: h * 0.3, size: 28 },
    { x: w * 0.8, y: h * 0.45, size: 20 },
  ];

  for (const gem of gemPositions) {
    const bob = Math.sin(t * 2.5 + gem.x) * 3;
    const cy = gem.y + bob;
    const r = gem.size;
    const halfW = r * 0.65;

    ctx.save();
    ctx.shadowColor = '#34d399';
    ctx.shadowBlur = 14;

    ctx.beginPath();
    ctx.moveTo(gem.x, cy - r);
    ctx.lineTo(gem.x + halfW, cy - r * 0.3);
    ctx.lineTo(gem.x + halfW, cy + r * 0.3);
    ctx.lineTo(gem.x, cy + r);
    ctx.lineTo(gem.x - halfW, cy + r * 0.3);
    ctx.lineTo(gem.x - halfW, cy - r * 0.3);
    ctx.closePath();

    const grad = ctx.createLinearGradient(gem.x - halfW, cy - r, gem.x + halfW, cy + r);
    grad.addColorStop(0, '#6ff5b0');
    grad.addColorStop(0.4, '#34d399');
    grad.addColorStop(1, '#14654a');
    ctx.fillStyle = grad;
    ctx.fill();

    ctx.strokeStyle = 'rgba(111, 245, 176, 0.6)';
    ctx.lineWidth = 1;
    ctx.stroke();

    // Highlight facet
    ctx.beginPath();
    ctx.moveTo(gem.x, cy - r);
    ctx.lineTo(gem.x - halfW, cy - r * 0.3);
    ctx.lineTo(gem.x, cy);
    ctx.closePath();
    ctx.fillStyle = 'rgba(255, 255, 255, 0.15)';
    ctx.fill();
    ctx.restore();

    // Label
    ctx.fillStyle = '#34d399';
    ctx.font = 'bold 11px "JetBrains Mono", monospace';
    ctx.textAlign = 'center';
    ctx.fillText(`x${(1.5 + gem.size * 0.05).toFixed(1)}`, gem.x, cy + r + 16);
  }

  // Draw 2 bombs
  const bombPositions = [
    { x: w * 0.35, y: h * 0.65, size: 16 },
    { x: w * 0.68, y: h * 0.7, size: 14 },
  ];

  for (const bomb of bombPositions) {
    const wobble = Math.sin(t * 4 + bomb.x) * 1;
    const cy = bomb.y + wobble;
    const r = bomb.size;

    ctx.save();
    ctx.shadowColor = '#f87171';
    ctx.shadowBlur = 10;

    ctx.beginPath();
    ctx.arc(bomb.x, cy, r, 0, Math.PI * 2);
    const bGrad = ctx.createRadialGradient(bomb.x - r * 0.3, cy - r * 0.3, r * 0.1, bomb.x, cy, r);
    bGrad.addColorStop(0, '#5a2020');
    bGrad.addColorStop(1, '#1a0505');
    ctx.fillStyle = bGrad;
    ctx.fill();
    ctx.strokeStyle = 'rgba(248, 113, 113, 0.6)';
    ctx.lineWidth = 1;
    ctx.stroke();

    // Fuse
    ctx.beginPath();
    ctx.moveTo(bomb.x, cy - r);
    ctx.quadraticCurveTo(bomb.x + r * 0.4, cy - r - r * 0.4, bomb.x + r * 0.6, cy - r - r * 0.6);
    ctx.strokeStyle = 'rgba(180, 140, 80, 0.7)';
    ctx.lineWidth = 1.5;
    ctx.stroke();

    // Spark
    if (Math.sin(t * 10 + bomb.x) > -0.3) {
      const sx = bomb.x + r * 0.6;
      const sy = cy - r - r * 0.6;
      ctx.beginPath();
      ctx.arc(sx, sy, 2, 0, Math.PI * 2);
      ctx.fillStyle = '#fbbf24';
      ctx.shadowColor = '#fbbf24';
      ctx.shadowBlur = 6;
      ctx.fill();
    }
    ctx.restore();

    ctx.fillStyle = '#f87171';
    ctx.font = 'bold 10px "JetBrains Mono", monospace';
    ctx.textAlign = 'center';
    ctx.fillText(`÷${(1.2 + bomb.size * 0.02).toFixed(1)}`, bomb.x, cy + r + 14);
  }

  // Shield
  const shY = h * 0.35 + Math.sin(t * 2) * 3;
  ctx.save();
  ctx.shadowColor = '#5b8def';
  ctx.shadowBlur = 10;
  ctx.beginPath();
  ctx.arc(w * 0.5, shY + 50, 12, 0, Math.PI * 2);
  ctx.fillStyle = 'rgba(91, 141, 239, 0.2)';
  ctx.fill();
  ctx.strokeStyle = 'rgba(91, 141, 239, 0.6)';
  ctx.lineWidth = 1.5;
  ctx.stroke();
  ctx.restore();
  ctx.fillStyle = '#5b8def';
  ctx.font = 'bold 10px "JetBrains Mono", monospace';
  ctx.textAlign = 'center';
  ctx.fillText('SH', w * 0.5, shY + 54);
}

function drawBetVisual(ctx: CanvasRenderingContext2D, w: number, h: number, t: number) {
  ctx.clearRect(0, 0, w, h);

  const tiers = [
    { label: 'SAFE', color: '#34d399', x: w * 0.18, gain: '0.80x', loss: '0.85x' },
    { label: 'STANDARD', color: '#fbbf24', x: w * 0.5, gain: '1.00x', loss: '1.00x' },
    { label: 'DEGEN', color: '#f87171', x: w * 0.82, gain: '1.25x', loss: '1.40x' },
  ];

  const selectedIdx = Math.floor(((t * 0.3) % 3));

  for (let i = 0; i < tiers.length; i++) {
    const tier = tiers[i];
    const isSelected = i === selectedIdx;
    const cardW = w * 0.26;
    const cardH = h * 0.55;
    const cx = tier.x;
    const cy = h * 0.45;

    ctx.save();
    if (isSelected) {
      ctx.shadowColor = tier.color;
      ctx.shadowBlur = 12;
    }

    // Card bg
    const rx = cx - cardW / 2;
    const ry = cy - cardH / 2;
    ctx.beginPath();
    ctx.roundRect(rx, ry, cardW, cardH, 8);
    ctx.fillStyle = isSelected ? `rgba(255, 255, 255, 0.08)` : 'rgba(255, 255, 255, 0.03)';
    ctx.fill();
    ctx.strokeStyle = isSelected ? tier.color : 'rgba(255, 255, 255, 0.08)';
    ctx.lineWidth = isSelected ? 2 : 1;
    ctx.stroke();
    ctx.restore();

    // Dot
    ctx.beginPath();
    ctx.arc(cx, cy - cardH * 0.3, 4, 0, Math.PI * 2);
    ctx.fillStyle = tier.color;
    ctx.fill();

    // Label
    ctx.fillStyle = isSelected ? '#fff' : '#6b6b8a';
    ctx.font = `bold 11px "Orbitron", sans-serif`;
    ctx.textAlign = 'center';
    ctx.fillText(tier.label, cx, cy - cardH * 0.1);

    // Gain/loss
    ctx.font = '10px "JetBrains Mono", monospace';
    ctx.fillStyle = '#34d399';
    ctx.fillText(`gain ${tier.gain}`, cx, cy + cardH * 0.1);
    ctx.fillStyle = '#f87171';
    ctx.fillText(`loss ${tier.loss}`, cx, cy + cardH * 0.25);
  }

  // Bet amount bar
  const barY = h * 0.82;
  ctx.beginPath();
  ctx.roundRect(w * 0.1, barY, w * 0.8, 24, 6);
  ctx.fillStyle = 'rgba(153, 69, 255, 0.12)';
  ctx.fill();
  ctx.strokeStyle = 'rgba(153, 69, 255, 0.3)';
  ctx.lineWidth = 1;
  ctx.stroke();

  const bets = ['0.01', '0.05', '0.1', '0.25', '0.5', '1'];
  const selectedBet = Math.floor(((t * 0.4) % bets.length));
  for (let i = 0; i < bets.length; i++) {
    const bx = w * 0.1 + ((w * 0.8) / bets.length) * (i + 0.5);
    ctx.fillStyle = i === selectedBet ? '#c084fc' : '#5a5a7a';
    ctx.font = `${i === selectedBet ? 'bold ' : ''}10px "JetBrains Mono", monospace`;
    ctx.textAlign = 'center';
    ctx.fillText(bets[i], bx, barY + 16);
  }
}

function drawBattleVisual(ctx: CanvasRenderingContext2D, w: number, h: number, t: number) {
  ctx.clearRect(0, 0, w, h);

  // Arena circle
  const cx = w / 2;
  const cy = h * 0.45;
  const arenaR = Math.min(w, h) * 0.32;

  ctx.save();
  ctx.beginPath();
  ctx.arc(cx, cy, arenaR, 0, Math.PI * 2);
  ctx.strokeStyle = 'rgba(153, 69, 255, 0.15)';
  ctx.lineWidth = 1;
  ctx.stroke();

  // Rotating ring
  ctx.beginPath();
  ctx.arc(cx, cy, arenaR + 4, t * 0.5, t * 0.5 + Math.PI * 1.2);
  ctx.strokeStyle = 'rgba(153, 69, 255, 0.4)';
  ctx.lineWidth = 2;
  ctx.stroke();
  ctx.restore();

  // Players around the arena
  const players = [
    { name: 'You', mult: '2.4x', color: '#14F195' },
    { name: 'Player2', mult: '1.8x', color: '#9945FF' },
    { name: 'Player3', mult: '1.2x', color: '#9945FF' },
    { name: 'Player4', mult: '0.7x', color: '#f87171' },
  ];

  for (let i = 0; i < players.length; i++) {
    const angle = (i / players.length) * Math.PI * 2 - Math.PI / 2;
    const px = cx + Math.cos(angle) * arenaR * 0.7;
    const py = cy + Math.sin(angle) * arenaR * 0.7;

    // Avatar circle
    ctx.save();
    if (i === 0) {
      ctx.shadowColor = '#14F195';
      ctx.shadowBlur = 10;
    }
    ctx.beginPath();
    ctx.arc(px, py, 14, 0, Math.PI * 2);
    ctx.fillStyle = i === 0 ? 'rgba(20, 241, 149, 0.2)' : 'rgba(153, 69, 255, 0.12)';
    ctx.fill();
    ctx.strokeStyle = players[i].color;
    ctx.lineWidth = 1.5;
    ctx.stroke();
    ctx.restore();

    // Name
    ctx.fillStyle = i === 0 ? '#14F195' : '#8888a0';
    ctx.font = `${i === 0 ? 'bold ' : ''}9px "Rajdhani", sans-serif`;
    ctx.textAlign = 'center';
    ctx.fillText(players[i].name, px, py + 26);

    // Multiplier
    ctx.fillStyle = players[i].color;
    ctx.font = 'bold 11px "JetBrains Mono", monospace';
    ctx.fillText(players[i].mult, px, py + 4);
  }

  // "VS" center
  ctx.fillStyle = 'rgba(255, 255, 255, 0.08)';
  ctx.beginPath();
  ctx.arc(cx, cy, 18, 0, Math.PI * 2);
  ctx.fill();
  ctx.fillStyle = '#c084fc';
  ctx.font = 'bold 14px "Orbitron", sans-serif';
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  ctx.fillText('VS', cx, cy);

  // Pool label
  ctx.fillStyle = '#fbbf24';
  ctx.font = 'bold 12px "Orbitron", sans-serif';
  ctx.textAlign = 'center';
  ctx.fillText('POOL: 0.40 SOL', cx, h * 0.88);
}

function drawWalletVisual(ctx: CanvasRenderingContext2D, w: number, h: number, t: number) {
  ctx.clearRect(0, 0, w, h);

  // Wallet card
  const cardW = w * 0.7;
  const cardH = h * 0.35;
  const cardX = (w - cardW) / 2;
  const cardY = h * 0.12;

  ctx.save();
  ctx.shadowColor = '#14F195';
  ctx.shadowBlur = 12;
  ctx.beginPath();
  ctx.roundRect(cardX, cardY, cardW, cardH, 12);
  const walletGrad = ctx.createLinearGradient(cardX, cardY, cardX + cardW, cardY + cardH);
  walletGrad.addColorStop(0, 'rgba(20, 241, 149, 0.1)');
  walletGrad.addColorStop(1, 'rgba(153, 69, 255, 0.08)');
  ctx.fillStyle = walletGrad;
  ctx.fill();
  ctx.strokeStyle = 'rgba(20, 241, 149, 0.3)';
  ctx.lineWidth = 1;
  ctx.stroke();
  ctx.restore();

  // SOL icon (circle)
  ctx.beginPath();
  ctx.arc(cardX + 24, cardY + cardH / 2, 10, 0, Math.PI * 2);
  ctx.fillStyle = 'rgba(153, 69, 255, 0.3)';
  ctx.fill();
  ctx.fillStyle = '#c084fc';
  ctx.font = 'bold 10px sans-serif';
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  ctx.fillText('◆', cardX + 24, cardY + cardH / 2);

  // Balance
  const displayBalance = (1.25 + Math.sin(t) * 0.1).toFixed(4);
  ctx.fillStyle = '#fff';
  ctx.font = 'bold 22px "JetBrains Mono", monospace';
  ctx.textAlign = 'left';
  ctx.textBaseline = 'middle';
  ctx.fillText(`${displayBalance}`, cardX + 44, cardY + cardH * 0.35);
  ctx.fillStyle = '#8888a0';
  ctx.font = '12px "Rajdhani", sans-serif';
  ctx.fillText('SOL Balance', cardX + 44, cardY + cardH * 0.65);

  // Deposit / Withdraw buttons
  const btnW = cardW * 0.42;
  const btnH = 30;
  const btnY = cardY + cardH + 20;

  // Deposit
  ctx.beginPath();
  ctx.roundRect(cardX, btnY, btnW, btnH, 6);
  ctx.fillStyle = 'rgba(20, 241, 149, 0.12)';
  ctx.fill();
  ctx.strokeStyle = 'rgba(20, 241, 149, 0.4)';
  ctx.lineWidth = 1;
  ctx.stroke();
  ctx.fillStyle = '#14F195';
  ctx.font = 'bold 11px "Rajdhani", sans-serif';
  ctx.textAlign = 'center';
  ctx.fillText('DEPOSIT', cardX + btnW / 2, btnY + 20);

  // Withdraw
  ctx.beginPath();
  ctx.roundRect(cardX + cardW - btnW, btnY, btnW, btnH, 6);
  ctx.fillStyle = 'rgba(153, 69, 255, 0.12)';
  ctx.fill();
  ctx.strokeStyle = 'rgba(153, 69, 255, 0.4)';
  ctx.lineWidth = 1;
  ctx.stroke();
  ctx.fillStyle = '#c084fc';
  ctx.font = 'bold 11px "Rajdhani", sans-serif';
  ctx.textAlign = 'center';
  ctx.fillText('WITHDRAW', cardX + cardW - btnW / 2, btnY + 20);

  // Transaction row
  const txY = btnY + btnH + 24;
  ctx.fillStyle = '#34d399';
  ctx.font = '10px "JetBrains Mono", monospace';
  ctx.textAlign = 'left';
  ctx.fillText('+0.2500 SOL', cardX + 8, txY);
  ctx.fillStyle = '#5a5a7a';
  ctx.font = '10px "Rajdhani", sans-serif';
  ctx.textAlign = 'right';
  ctx.fillText('Win  ·  2m ago', cardX + cardW - 8, txY);

  ctx.fillStyle = '#f87171';
  ctx.font = '10px "JetBrains Mono", monospace';
  ctx.textAlign = 'left';
  ctx.fillText('-0.1000 SOL', cardX + 8, txY + 18);
  ctx.fillStyle = '#5a5a7a';
  ctx.font = '10px "Rajdhani", sans-serif';
  ctx.textAlign = 'right';
  ctx.fillText('Bet  ·  5m ago', cardX + cardW - 8, txY + 18);
}

const visualDrawers: Record<TutorialStep['visual'], (ctx: CanvasRenderingContext2D, w: number, h: number, t: number) => void> = {
  chart: drawChartVisual,
  gems: drawGemsVisual,
  bet: drawBetVisual,
  battle: drawBattleVisual,
  wallet: drawWalletVisual,
};

/* ────────── animated illustration canvas ────────── */

function TutorialCanvas({ visual, accent }: { visual: TutorialStep['visual']; accent: string }) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const rafRef = useRef<number>(0);
  const startRef = useRef(performance.now());

  const draw = useCallback(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    const dpr = window.devicePixelRatio || 1;
    const rect = canvas.getBoundingClientRect();
    if (canvas.width !== rect.width * dpr || canvas.height !== rect.height * dpr) {
      canvas.width = rect.width * dpr;
      canvas.height = rect.height * dpr;
      ctx.scale(dpr, dpr);
    }

    const t = (performance.now() - startRef.current) / 1000;
    visualDrawers[visual](ctx, rect.width, rect.height, t);
    rafRef.current = requestAnimationFrame(draw);
  }, [visual]);

  useEffect(() => {
    startRef.current = performance.now();
    rafRef.current = requestAnimationFrame(draw);
    return () => cancelAnimationFrame(rafRef.current);
  }, [draw]);

  return (
    <div style={{
      width: '100%',
      height: '160px',
      borderRadius: '12px',
      background: `linear-gradient(135deg, rgba(14, 10, 22, 0.9), rgba(32, 24, 48, 0.6))`,
      border: `1px solid ${accent}15`,
      overflow: 'hidden',
    }}>
      <canvas ref={canvasRef} style={{ width: '100%', height: '100%', display: 'block' }} />
    </div>
  );
}

/* ────────── main modal ────────── */

export function OnboardingModal({ onClose }: { onClose: () => void }) {
  const [step, setStep] = useState(0);
  const current = STEPS[step];

  function handleNext() {
    if (step < STEPS.length - 1) {
      setStep(step + 1);
    } else {
      localStorage.setItem(ONBOARDING_KEY, '1');
      onClose();
    }
  }

  function handleSkip() {
    localStorage.setItem(ONBOARDING_KEY, '1');
    onClose();
  }

  function handleBack() {
    if (step > 0) setStep(step - 1);
  }

  return (
    <div style={s.overlay}>
      <div style={s.modal}>
        {/* Progress bar */}
        <div style={s.progressBar}>
          <div style={{
            ...s.progressFill,
            width: `${((step + 1) / STEPS.length) * 100}%`,
            background: current.accent,
            boxShadow: `0 0 10px ${current.accent}60`,
          }} />
        </div>

        {/* Step counter */}
        <div style={s.stepCounter}>
          <span style={{ color: current.accent, fontWeight: 700 }}>{step + 1}</span>
          <span style={{ color: '#5a5a7a' }}> / {STEPS.length}</span>
        </div>

        {/* Visual illustration */}
        <TutorialCanvas visual={current.visual} accent={current.accent} />

        {/* Icon + text */}
        <div style={s.textBlock}>
          <div style={{
            ...s.iconBadge,
            background: `${current.accent}15`,
            border: `1px solid ${current.accent}30`,
            boxShadow: `0 0 16px ${current.accent}18`,
          }}>
            <span style={s.icon}>{current.icon}</span>
          </div>
          <h2 style={{ ...s.title, color: current.accent }}>{current.title}</h2>
          <p style={s.desc}>{current.desc}</p>
        </div>

        {/* Dots */}
        <div style={s.dots}>
          {STEPS.map((_, i) => (
            <button
              key={i}
              onClick={() => setStep(i)}
              style={{
                ...s.dot,
                background: i === step ? current.accent : 'rgba(255, 255, 255, 0.12)',
                width: i === step ? '24px' : '8px',
                boxShadow: i === step ? `0 0 8px ${current.accent}50` : 'none',
              }}
            />
          ))}
        </div>

        {/* Buttons */}
        <div style={s.btnRow}>
          {step > 0 ? (
            <button style={s.backBtn} onClick={handleBack}>Back</button>
          ) : (
            <button style={s.backBtn} onClick={handleSkip}>Skip</button>
          )}
          <button
            style={{
              ...s.nextBtn,
              background: current.accent,
              boxShadow: `0 4px 0 ${current.accent}88, 0 6px 16px ${current.accent}30`,
            }}
            onClick={handleNext}
          >
            {step < STEPS.length - 1 ? 'Next' : 'Start Trading'}
          </button>
        </div>
      </div>
    </div>
  );
}

export function useOnboarding() {
  const [show, setShow] = useState(false);

  useEffect(() => {
    const seen = localStorage.getItem(ONBOARDING_KEY);
    if (!seen) {
      setShow(true);
    }
  }, []);

  return { showOnboarding: show, closeOnboarding: () => setShow(false) };
}

/* ────────── styles ────────── */

const s: Record<string, React.CSSProperties> = {
  overlay: {
    position: 'fixed',
    inset: 0,
    zIndex: 9999,
    background: 'rgba(0, 0, 0, 0.75)',
    backdropFilter: 'blur(10px)',
    WebkitBackdropFilter: 'blur(10px)',
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    padding: '16px',
  },
  modal: {
    background: 'rgba(18, 14, 30, 0.97)',
    border: '1px solid rgba(153, 69, 255, 0.15)',
    borderRadius: '20px',
    padding: '20px 24px 24px',
    maxWidth: '400px',
    width: '100%',
    display: 'flex',
    flexDirection: 'column',
    alignItems: 'center',
    gap: '14px',
    boxShadow: '0 12px 48px rgba(0, 0, 0, 0.6), 0 0 32px rgba(153, 69, 255, 0.08)',
  },
  progressBar: {
    width: '100%',
    height: '3px',
    borderRadius: '2px',
    background: 'rgba(255, 255, 255, 0.06)',
    overflow: 'hidden',
  },
  progressFill: {
    height: '100%',
    borderRadius: '2px',
    transition: 'width 0.4s ease, background 0.4s ease',
  },
  stepCounter: {
    fontSize: '12px',
    fontFamily: "'JetBrains Mono', monospace",
    alignSelf: 'flex-end',
  },
  textBlock: {
    display: 'flex',
    flexDirection: 'column',
    alignItems: 'center',
    gap: '8px',
    textAlign: 'center',
  },
  iconBadge: {
    width: '52px',
    height: '52px',
    borderRadius: '50%',
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
  },
  icon: {
    fontSize: '26px',
    lineHeight: 1,
  },
  title: {
    fontSize: '19px',
    fontWeight: 800,
    margin: 0,
    fontFamily: "'Orbitron', sans-serif",
    letterSpacing: '0.5px',
    textTransform: 'uppercase' as const,
  },
  desc: {
    fontSize: '15px',
    color: '#8888a0',
    lineHeight: 1.55,
    margin: 0,
    maxWidth: '340px',
  },
  dots: {
    display: 'flex',
    gap: '6px',
    alignItems: 'center',
  },
  dot: {
    height: '8px',
    borderRadius: '4px',
    border: 'none',
    cursor: 'pointer',
    padding: 0,
    transition: 'all 0.3s ease',
  },
  btnRow: {
    display: 'flex',
    gap: '10px',
    width: '100%',
    alignItems: 'center',
  },
  backBtn: {
    background: 'none',
    border: '1px solid rgba(255, 255, 255, 0.1)',
    borderRadius: '10px',
    color: '#7e7fa0',
    fontSize: '14px',
    fontWeight: 600,
    cursor: 'pointer',
    fontFamily: "'Rajdhani', sans-serif",
    padding: '12px 18px',
    textTransform: 'uppercase' as const,
    letterSpacing: '0.5px',
  },
  nextBtn: {
    flex: 1,
    padding: '13px',
    border: 'none',
    borderRadius: '10px',
    color: '#fff',
    fontSize: '16px',
    fontWeight: 700,
    cursor: 'pointer',
    fontFamily: "'Rajdhani', sans-serif",
    textTransform: 'uppercase' as const,
    letterSpacing: '0.5px',
    transition: 'all 0.15s ease',
  },
};
