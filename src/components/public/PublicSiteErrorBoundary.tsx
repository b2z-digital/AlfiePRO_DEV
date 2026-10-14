import React from 'react';

interface Props {
  pathname: string;
  children: React.ReactNode;
}

interface State {
  error: Error | null;
}

const RETRY_KEY = 'public-site-retried-path';

// A page that fails during in-site navigation loads fine on a full reload, so retry once with a hard load.
export class PublicSiteErrorBoundary extends React.Component<Props, State> {
  state: State = { error: null };

  static getDerivedStateFromError(error: Error): State {
    return { error };
  }

  componentDidCatch(error: Error, info: React.ErrorInfo) {
    console.error('Public site page error:', error, info.componentStack);
    if (sessionStorage.getItem(RETRY_KEY) !== this.props.pathname) {
      sessionStorage.setItem(RETRY_KEY, this.props.pathname);
      window.location.reload();
    }
  }

  componentDidMount() {
    if (sessionStorage.getItem(RETRY_KEY) === this.props.pathname) {
      setTimeout(() => sessionStorage.removeItem(RETRY_KEY), 5000);
    }
  }

  render() {
    if (!this.state.error) return this.props.children;

    return (
      <div className="min-h-screen bg-gray-50 flex items-center justify-center px-4">
        <div className="max-w-md text-center">
          <h1 className="text-2xl font-bold text-gray-900 mb-2">This page couldn't be displayed</h1>
          <p className="text-gray-600 mb-6">Please try again in a moment.</p>
          <a
            href="/"
            className="inline-flex px-6 py-3 bg-blue-600 text-white rounded-lg hover:bg-blue-700 transition-colors font-medium"
          >
            Back to homepage
          </a>
          <p className="mt-6 text-xs text-gray-400 break-words">{this.state.error.message}</p>
        </div>
      </div>
    );
  }
}
