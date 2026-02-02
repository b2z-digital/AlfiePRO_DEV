import React, { useEffect, useState } from 'react';
import { createPortal } from 'react-dom';
import { CreditCard, CheckCircle, Loader2, Shield, Link as LinkIcon } from 'lucide-react';

interface StripeConnectionPreloaderModalProps {
  isOpen: boolean;
  connectionType: 'oauth' | 'express';
  onComplete: () => void;
}

type ConnectionStep = 'initializing' | 'connecting' | 'verifying' | 'complete';

export const StripeConnectionPreloaderModal: React.FC<StripeConnectionPreloaderModalProps> = ({
  isOpen,
  connectionType,
  onComplete
}) => {
  const [currentStep, setCurrentStep] = useState<ConnectionStep>('initializing');
  const [progress, setProgress] = useState(0);

  useEffect(() => {
    if (!isOpen) return;

    setCurrentStep('initializing');
    setProgress(0);

    const steps = [
      { step: 'initializing', duration: 1500, progress: 33 },
      { step: 'connecting', duration: 2000, progress: 66 },
      { step: 'verifying', duration: 1500, progress: 100 },
      { step: 'complete', duration: 1000, progress: 100 }
    ];

    let currentIndex = 0;
    let progressInterval: NodeJS.Timeout;

    const runNextStep = () => {
      if (currentIndex >= steps.length) {
        setTimeout(() => {
          onComplete();
        }, 1000);
        return;
      }

      const { step, duration, progress: targetProgress } = steps[currentIndex];
      setCurrentStep(step as ConnectionStep);

      const startProgress = progress;
      const progressStep = (targetProgress - startProgress) / (duration / 50);

      progressInterval = setInterval(() => {
        setProgress(prev => {
          const next = prev + progressStep;
          if (next >= targetProgress) {
            clearInterval(progressInterval);
            return targetProgress;
          }
          return next;
        });
      }, 50);

      setTimeout(() => {
        clearInterval(progressInterval);
        setProgress(targetProgress);
        currentIndex++;
        runNextStep();
      }, duration);
    };

    runNextStep();

    return () => {
      clearInterval(progressInterval);
    };
  }, [isOpen, onComplete]);

  if (!isOpen) return null;

  const getStepStatus = (step: ConnectionStep) => {
    const steps: ConnectionStep[] = ['initializing', 'connecting', 'verifying', 'complete'];
    const currentIndex = steps.indexOf(currentStep);
    const stepIndex = steps.indexOf(step);

    if (stepIndex < currentIndex) return 'complete';
    if (stepIndex === currentIndex) return 'active';
    return 'pending';
  };

  return createPortal(
    <div className="fixed inset-0 z-[9999] flex items-center justify-center bg-slate-900/95 backdrop-blur-md">
      <div className="max-w-2xl w-full mx-4">
        <div className="text-center mb-8">
          <div className="inline-flex items-center justify-center w-20 h-20 rounded-full bg-gradient-to-br from-blue-500 to-purple-600 mb-6 relative">
            <CreditCard className="w-10 h-10 text-white" />
            <div className="absolute inset-0 rounded-full bg-blue-500/30 animate-ping" />
          </div>
          <h2 className="text-3xl font-bold text-white mb-3">
            {currentStep === 'complete' ? 'Stripe Connected!' : 'Connecting to Stripe'}
          </h2>
          <p className="text-slate-400 text-lg">
            {currentStep === 'complete'
              ? 'Your Stripe account is now ready to accept payments'
              : connectionType === 'oauth'
              ? 'Linking your existing Stripe account...'
              : 'Creating your new Stripe Express account...'}
          </p>
        </div>

        <div className="bg-slate-800/50 backdrop-blur-sm rounded-2xl border border-slate-700/50 p-8 shadow-2xl">
          <div className="space-y-6">
            <div className="flex items-center gap-4">
              <div className={`
                w-12 h-12 rounded-full flex items-center justify-center flex-shrink-0 transition-all duration-500
                ${getStepStatus('initializing') === 'complete'
                  ? 'bg-green-500/20 border-2 border-green-500'
                  : getStepStatus('initializing') === 'active'
                  ? 'bg-blue-500/20 border-2 border-blue-500'
                  : 'bg-slate-700/50 border-2 border-slate-600'}
              `}>
                {getStepStatus('initializing') === 'complete' ? (
                  <CheckCircle className="w-6 h-6 text-green-400" />
                ) : getStepStatus('initializing') === 'active' ? (
                  <Loader2 className="w-6 h-6 text-blue-400 animate-spin" />
                ) : (
                  <LinkIcon className="w-6 h-6 text-slate-400" />
                )}
              </div>
              <div className="flex-1">
                <h3 className={`font-semibold mb-1 transition-colors ${
                  getStepStatus('initializing') === 'active' ? 'text-white' : 'text-slate-400'
                }`}>
                  Initializing Connection
                </h3>
                <p className="text-sm text-slate-500">
                  {connectionType === 'oauth'
                    ? 'Preparing OAuth authentication flow'
                    : 'Setting up your Stripe Express account'}
                </p>
              </div>
            </div>

            <div className="flex items-center gap-4">
              <div className={`
                w-12 h-12 rounded-full flex items-center justify-center flex-shrink-0 transition-all duration-500
                ${getStepStatus('connecting') === 'complete'
                  ? 'bg-green-500/20 border-2 border-green-500'
                  : getStepStatus('connecting') === 'active'
                  ? 'bg-blue-500/20 border-2 border-blue-500'
                  : 'bg-slate-700/50 border-2 border-slate-600'}
              `}>
                {getStepStatus('connecting') === 'complete' ? (
                  <CheckCircle className="w-6 h-6 text-green-400" />
                ) : getStepStatus('connecting') === 'active' ? (
                  <Loader2 className="w-6 h-6 text-blue-400 animate-spin" />
                ) : (
                  <CreditCard className="w-6 h-6 text-slate-400" />
                )}
              </div>
              <div className="flex-1">
                <h3 className={`font-semibold mb-1 transition-colors ${
                  getStepStatus('connecting') === 'active' ? 'text-white' : 'text-slate-400'
                }`}>
                  Connecting to Stripe
                </h3>
                <p className="text-sm text-slate-500">
                  {connectionType === 'oauth'
                    ? 'Authenticating with your Stripe account'
                    : 'Creating account and configuring payment capabilities'}
                </p>
              </div>
            </div>

            <div className="flex items-center gap-4">
              <div className={`
                w-12 h-12 rounded-full flex items-center justify-center flex-shrink-0 transition-all duration-500
                ${getStepStatus('verifying') === 'complete'
                  ? 'bg-green-500/20 border-2 border-green-500'
                  : getStepStatus('verifying') === 'active'
                  ? 'bg-blue-500/20 border-2 border-blue-500'
                  : 'bg-slate-700/50 border-2 border-slate-600'}
              `}>
                {getStepStatus('verifying') === 'complete' ? (
                  <CheckCircle className="w-6 h-6 text-green-400" />
                ) : getStepStatus('verifying') === 'active' ? (
                  <Loader2 className="w-6 h-6 text-blue-400 animate-spin" />
                ) : (
                  <Shield className="w-6 h-6 text-slate-400" />
                )}
              </div>
              <div className="flex-1">
                <h3 className={`font-semibold mb-1 transition-colors ${
                  getStepStatus('verifying') === 'active' ? 'text-white' : 'text-slate-400'
                }`}>
                  Verifying Connection
                </h3>
                <p className="text-sm text-slate-500">
                  Confirming account access and payment capabilities
                </p>
              </div>
            </div>
          </div>

          <div className="mt-8">
            <div className="relative h-3 bg-slate-700/50 rounded-full overflow-hidden">
              <div
                className="absolute inset-y-0 left-0 bg-gradient-to-r from-blue-500 via-purple-500 to-green-500 transition-all duration-300 ease-out rounded-full"
                style={{ width: `${progress}%` }}
              >
                <div className="absolute inset-0 bg-white/20 animate-pulse" />
              </div>
            </div>
            <div className="flex justify-between items-center mt-3">
              <span className="text-sm text-slate-400">{Math.round(progress)}% Complete</span>
              {currentStep === 'complete' ? (
                <span className="text-sm text-green-400 flex items-center gap-1">
                  <CheckCircle className="w-4 h-4" />
                  Ready to accept payments
                </span>
              ) : (
                <span className="text-sm text-slate-400">Please wait...</span>
              )}
            </div>
          </div>
        </div>

        {currentStep === 'complete' && (
          <div className="text-center mt-6">
            <p className="text-slate-400 text-sm">
              Your Stripe account is connected and ready to process payments
            </p>
          </div>
        )}
      </div>
    </div>,
    document.body
  );
};
