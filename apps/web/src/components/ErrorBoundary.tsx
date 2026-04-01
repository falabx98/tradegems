import { Component, type ReactNode } from 'react';
import { theme } from '../styles/theme';

interface Props {
  children: ReactNode;
}

interface State {
  hasError: boolean;
  error: Error | null;
}

export class ErrorBoundary extends Component<Props, State> {
  constructor(props: Props) {
    super(props);
    this.state = { hasError: false, error: null };
  }

  static getDerivedStateFromError(error: Error): State {
    return { hasError: true, error };
  }

  componentDidCatch(error: Error, info: React.ErrorInfo) {
    console.error('ErrorBoundary caught:', error, info.componentStack);
  }

  handleReset = () => {
    this.setState({ hasError: false, error: null });
    window.location.hash = '#/';
    window.location.reload();
  };

  render() {
    if (this.state.hasError) {
      return (
        <div style={s.root}>
          <div style={s.card}>
            <svg width="40" height="40" viewBox="0 0 24 24" fill="none" stroke={theme.accent.red} strokeWidth="1.5" strokeLinecap="round">
              <circle cx="12" cy="12" r="10" />
              <line x1="12" y1="8" x2="12" y2="12" />
              <line x1="12" y1="16" x2="12.01" y2="16" />
            </svg>
            <h2 style={s.title}>Something went wrong</h2>
            <p style={s.desc}>
              {this.state.error?.message || 'An unexpected error occurred'}
            </p>
            <button style={s.btn} onClick={this.handleReset}>
              Reload App
            </button>
          </div>
        </div>
      );
    }
    return this.props.children;
  }
}

const s: Record<string, React.CSSProperties> = {
  root: {
    minHeight: '100vh',
    background: theme.bg.primary,
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    padding: '24px',
  },
  card: {
    display: 'flex',
    flexDirection: 'column',
    alignItems: 'center',
    gap: '16px',
    padding: '32px',
    background: theme.bg.secondary,
    border: `1px solid ${theme.border.medium}`,
    borderRadius: theme.radius.xl,
    maxWidth: '400px',
    textAlign: 'center',
  },
  title: {
    fontSize: '18px',
    fontWeight: 700,
    color: theme.text.primary,
    margin: 0,
  },
  desc: {
    fontSize: '14px',
    color: theme.text.secondary,
    lineHeight: 1.5,
    margin: 0,
  },
  btn: {
    padding: '12px 24px',
    background: theme.gradient.primary,
    color: '#fff',
    border: 'none',
    borderRadius: theme.radius.md,
    fontSize: '15px',
    fontWeight: 700,
    cursor: 'pointer',
    fontFamily: 'inherit',
    marginTop: '8px',
  },
};
