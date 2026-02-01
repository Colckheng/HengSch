import { Component, ErrorInfo, ReactNode } from 'react';

interface Props {
  children: ReactNode;
}

interface State {
  hasError: boolean;
  error: Error | null;
}

export class ErrorBoundary extends Component<Props, State> {
  state: State = { hasError: false, error: null };

  static getDerivedStateFromError(error: Error): State {
    return { hasError: true, error };
  }

  componentDidCatch(error: Error, errorInfo: ErrorInfo) {
    console.error('App Error:', error, errorInfo);
  }

  render() {
    if (this.state.hasError && this.state.error) {
      return (
        <div
          style={{
            padding: 24,
            fontFamily: 'sans-serif',
            maxWidth: 600,
            margin: '40px auto',
            background: '#fff3cd',
            border: '1px solid #ffc107',
            borderRadius: 8
          }}
        >
          <h2 style={{ color: '#856404', marginBottom: 12 }}>加载出错</h2>
          <pre style={{ overflow: 'auto', fontSize: 12 }}>{this.state.error.message}</pre>
          <pre style={{ overflow: 'auto', fontSize: 11, marginTop: 8, color: '#666' }}>
            {this.state.error.stack}
          </pre>
        </div>
      );
    }
    return this.props.children;
  }
}
