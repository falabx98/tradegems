import { useState, useEffect } from 'react';

const ONBOARDING_KEY = 'tradesol_onboarding_seen';

export function OnboardingModal({ onClose }: { onClose: () => void }) {
  const [step, setStep] = useState(0);

  const steps = [
    {
      icon: '⚔️',
      title: 'Welcome to Trading Arena',
      desc: 'Compete in fast-paced trading rounds against other players. Predict the market, hit multipliers, and win SOL.',
    },
    {
      icon: '🎯',
      title: 'Place Your Bet',
      desc: 'Choose your bet amount and risk tier before each round starts. Higher risk means bigger potential multipliers.',
    },
    {
      icon: '💰',
      title: 'Win & Withdraw',
      desc: 'Winnings are credited to your balance instantly. Deposit and withdraw SOL using your Phantom wallet anytime.',
    },
  ];

  function handleNext() {
    if (step < steps.length - 1) {
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

  return (
    <div style={s.overlay}>
      <div style={s.modal} className="card-enter">
        <div style={s.iconWrap}>
          <span style={s.icon}>{steps[step].icon}</span>
        </div>

        <h2 style={s.title}>{steps[step].title}</h2>
        <p style={s.desc}>{steps[step].desc}</p>

        {/* Dots */}
        <div style={s.dots}>
          {steps.map((_, i) => (
            <span key={i} style={{
              ...s.dot,
              background: i === step ? '#9945FF' : 'rgba(255, 255, 255, 0.15)',
              boxShadow: i === step ? '0 0 8px rgba(153, 69, 255, 0.4)' : 'none',
            }} />
          ))}
        </div>

        <button style={s.nextBtn} onClick={handleNext}>
          {step < steps.length - 1 ? 'Next' : 'Get Started'}
        </button>

        {step < steps.length - 1 && (
          <button style={s.skipBtn} onClick={handleSkip}>
            Skip
          </button>
        )}
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

const s: Record<string, React.CSSProperties> = {
  overlay: {
    position: 'fixed',
    inset: 0,
    zIndex: 9999,
    background: 'rgba(0, 0, 0, 0.7)',
    backdropFilter: 'blur(8px)',
    WebkitBackdropFilter: 'blur(8px)',
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    padding: '24px',
  },
  modal: {
    background: 'rgba(21, 26, 45, 0.95)',
    border: '1px solid rgba(153, 69, 255, 0.2)',
    borderRadius: '20px',
    padding: '40px 32px',
    maxWidth: '380px',
    width: '100%',
    textAlign: 'center',
    boxShadow: '0 8px 48px rgba(0, 0, 0, 0.5), 0 0 24px rgba(153, 69, 255, 0.1)',
    display: 'flex',
    flexDirection: 'column',
    alignItems: 'center',
    gap: '16px',
  },
  iconWrap: {
    width: '72px',
    height: '72px',
    borderRadius: '50%',
    background: 'rgba(153, 69, 255, 0.1)',
    border: '1px solid rgba(153, 69, 255, 0.2)',
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    boxShadow: '0 0 20px rgba(153, 69, 255, 0.15)',
  },
  icon: {
    fontSize: '34px',
    lineHeight: 1,
  },
  title: {
    fontSize: '22px',
    fontWeight: 800,
    color: '#fff',
    margin: 0,
    fontFamily: "'Orbitron', sans-serif",
    letterSpacing: '1px',
    textTransform: 'uppercase' as const,
    textShadow: '0 0 20px rgba(153, 69, 255, 0.3)',
  },
  desc: {
    fontSize: '16px',
    color: '#8888a0',
    lineHeight: 1.6,
    margin: 0,
    maxWidth: '300px',
  },
  dots: {
    display: 'flex',
    gap: '8px',
    margin: '4px 0',
  },
  dot: {
    width: '8px',
    height: '8px',
    borderRadius: '50%',
    transition: 'all 0.3s ease',
  },
  nextBtn: {
    width: '100%',
    padding: '14px',
    background: '#9945FF',
    border: 'none',
    borderRadius: '12px',
    color: '#fff',
    fontSize: '17px',
    fontWeight: 700,
    cursor: 'pointer',
    fontFamily: 'Rajdhani, sans-serif',
    textTransform: 'uppercase' as const,
    letterSpacing: '0.5px',
    boxShadow: '0 4px 0 #7325d4, 0 6px 12px rgba(153, 69, 255, 0.3)',
    transition: 'all 0.1s ease',
  },
  skipBtn: {
    background: 'none',
    border: 'none',
    color: '#6b6b8a',
    fontSize: '15px',
    fontWeight: 500,
    cursor: 'pointer',
    fontFamily: 'inherit',
    padding: '4px',
  },
};
