import React, { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { Logo } from '../Logo';

export const YouTubeCallback: React.FC = () => {
  const [status, setStatus] = useState<'processing' | 'success' | 'error'>('processing');
  const [message, setMessage] = useState('Processing YouTube authorization...');
  const navigate = useNavigate();

  useEffect(() => {
    const handleCallback = async () => {
      try {
        const urlParams = new URLSearchParams(window.location.search);
        const code = urlParams.get('code');
        const error = urlParams.get('error');

        if (error) {
          setStatus('error');
          setMessage(`Authorization failed: ${error}`);
          setTimeout(() => navigate('/'), 3000);
          return;
        }

        if (code) {
          // Store the authorization code in localStorage for the parent window to access
          window.localStorage.setItem('youtube_auth_code', code);

          setStatus('success');
          setMessage('YouTube authorization successful! Closing window...');

          // If this is a popup window, close it
          if (window.opener) {
            window.opener.postMessage({ type: 'youtube_auth_success', code }, window.location.origin);
            setTimeout(() => window.close(), 1000);
          } else {
            // If not a popup, redirect to home
            setTimeout(() => navigate('/'), 2000);
          }
        } else {
          setStatus('error');
          setMessage('No authorization code received');
          setTimeout(() => navigate('/'), 3000);
        }
      } catch (err: any) {
        console.error('YouTube callback error:', err);
        setStatus('error');
        setMessage('An error occurred during authorization');
        setTimeout(() => navigate('/'), 3000);
      }
    };

    handleCallback();
  }, [navigate]);

  return (
    <div className="min-h-screen bg-gradient-to-br from-slate-900 via-slate-800 to-slate-900 flex items-center justify-center px-4">
      <div className="w-full max-w-md">
        <div className="bg-slate-800 rounded-lg shadow-xl p-8 border border-slate-700">
          <div className="flex justify-center mb-8">
            <Logo size="large" />
          </div>

          <div className="text-center">
            {status === 'processing' && (
              <div className="space-y-4">
                <div className="w-16 h-16 border-4 border-blue-600 border-t-transparent rounded-full animate-spin mx-auto"></div>
                <p className="text-white text-lg">{message}</p>
              </div>
            )}

            {status === 'success' && (
              <div className="space-y-4">
                <div className="w-16 h-16 bg-green-600 rounded-full flex items-center justify-center mx-auto">
                  <svg className="w-10 h-10 text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
                  </svg>
                </div>
                <p className="text-white text-lg">{message}</p>
              </div>
            )}

            {status === 'error' && (
              <div className="space-y-4">
                <div className="w-16 h-16 bg-red-600 rounded-full flex items-center justify-center mx-auto">
                  <svg className="w-10 h-10 text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                  </svg>
                </div>
                <p className="text-white text-lg">{message}</p>
                <p className="text-slate-400 text-sm">Redirecting...</p>
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
};
