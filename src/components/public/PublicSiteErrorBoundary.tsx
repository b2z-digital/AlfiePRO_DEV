import React from 'react';

interface Props {
  pathname: string;
  children: React.ReactNode;
}

interface State {
  error: Error | null;
}

const RETRY_KEY = 'public-site-retried';
const RETRY_WINDOW_MS = 10 * 60 * 1000;

// When this page last reloaded itself (per path), from this tab's storage
const lastRetry = (pathname: string): number => {
  try {
    const saved = JSON.parse(sessionStorage.getItem(RETRY_KEY) || '{}');
    return typeof saved[pathname] === 'number' ? saved[pathname] : 0;
  } catch {
    return 0;
  }
};
const markRetry = (pathname: string) => {
  try {
    const saved = JSON.parse(sessionStorage.getItem(RETRY_KEY) || '{}');
    saved[pathname] = Date.now();
    sessionStorage.setItem(RETRY_KEY, JSON.stringify(saved));
    return true;
  } catch {
    return false; // no storage: don't risk a reload loop
  }
};

// A page that fails during in-site navigation loads fine on a full reload, so retry with a hard load,
// at most once per page every 10 minutes. (The old marker was cleared 5 s after loading, so a page
// that failed later than that reloaded itself over and over, re-downloading its data each time.)
export class PublicSiteErrorBoundary extends React.Component<Props, State> {
  state: State = { error: null };

  static getDerivedStateFromError(error: Error): State {
    return { error };
  }

  componentDidCatch(error: Error, info: React.ErrorInfo) {
    console.error('Public site page error:', error, info.componentStack);
    const { pathname } = this.props;
    if (Date.now() - lastRetry(pathname) > RETRY_WINDOW_MS && markRetry(pathname)) {
      window.location.reload();
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
