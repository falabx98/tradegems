import { theme } from '../../styles/theme';

export interface HowToPlayStep {
  icon: string;
  label: string;
  desc?: string;
}

export interface HowToPlayInlineProps {
  steps: HowToPlayStep[];
}

export function HowToPlayInline({ steps }: HowToPlayInlineProps) {
  return (
    <div style={s.root}>
      {steps.map((step, i) => (
        <div key={i} style={s.step}>
          <div style={s.stepNumber}>{i + 1}</div>
          <div style={s.stepContent}>
            <div style={s.stepLabel}>{step.label}</div>
            {step.desc && <div style={s.stepDesc}>{step.desc}</div>}
          </div>
          {i < steps.length - 1 && <div style={s.connector} />}
        </div>
      ))}
    </div>
  );
}

const s: Record<string, React.CSSProperties> = {
  root: {
    display: 'flex',
    flexDirection: 'column',
    gap: '12px',
  },
  step: {
    display: 'flex',
    alignItems: 'flex-start',
    gap: '12px',
    position: 'relative',
  },
  stepNumber: {
    width: '24px',
    height: '24px',
    borderRadius: '50%',
    background: 'rgba(139, 92, 246, 0.08)',
    border: `1px solid rgba(139, 92, 246, 0.15)`,
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    fontSize: '11px',
    fontWeight: 700,
    color: theme.accent.purple,
    flexShrink: 0,
  },
  stepContent: {
    display: 'flex',
    flexDirection: 'column',
    gap: '2px',
  },
  stepLabel: {
    fontSize: '13px',
    fontWeight: 600,
    color: theme.text.primary,
  },
  stepDesc: {
    fontSize: '12px',
    color: theme.text.muted,
    lineHeight: 1.4,
  },
  connector: {
    position: 'absolute',
    left: '11px',
    top: '28px',
    width: '1px',
    height: '12px',
    background: theme.border.subtle,
  },
};
