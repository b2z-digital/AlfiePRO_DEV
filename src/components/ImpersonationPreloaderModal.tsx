import React, { useEffect, useState } from 'react';
import { createPortal } from 'react-dom';
import { Eye, CheckCircle, Loader2, User, LayoutDashboard, Shield } from 'lucide-react';

interface ImpersonationPreloaderModalProps {
  isOpen: boolean;
  targetName: string;
  targetAvatarUrl: string | null;
  targetClubName?: string;
}

type LoadingStep = 'switching' | 'loading' | 'preparing' | 'complete';

export const ImpersonationPreloaderModal: React.FC<ImpersonationPreloaderModalProps> = ({
  isOpen,
  targetName,
  targetAvatarUrl,
  targetClubName
}) => {
  const [currentStep, setCurrentStep] = useState<LoadingStep>('switching');
  const [progress, setProgress] = useState(0);

  useEffect(() => {
    if (!isOpen) {
      setCurrentStep('switching');
      setProgress(0);
      return;
    }

    const htmlPreloader = document.getElementById('impersonation-preloader');
    if (htmlPreloader) {
      htmlPreloader.style.display = 'none';
    }

    const steps: { step: LoadingStep; duration: number; progress: number }[] = [
      { step: 'switching', duration: 1200, progress: 33 },
      { step: 'loading', duration: 1500, progress: 66 },
      { step: 'preparing', duration: 1200, progress: 95 },
    ];

    let currentIndex = 0;
    let progressInterval: ReturnType<typeof setInterval>;
    let cancelled = false;

    const runNextStep = () => {
      if (cancelled || currentIndex >= steps.length) return;

      const { step, duration, progress: targetProgress } = steps[currentIndex];
      setCurrentStep(step);

      const prevProgress = currentIndex > 0 ? steps[currentIndex - 1].progress : 0;
      const increment = (targetProgress - prevProgress) / (duration / 50);

      progressInterval = setInterval(() => {
        setProgress(prev => {
          const next = prev + increment;
          if (next >= targetProgress) {
            clearInterval(progressInterval);
            return targetProgress;
          }
          return next;
        });
      }, 50);

      setTimeout(() => {
        if (cancelled) return;
        clearInterval(progressInterval);
        setProgress(targetProgress);
        currentIndex++;
        runNextStep();
      }, duration);
    };

    runNextStep();

    return () => {
      cancelled = true;
      clearInterval(progressInterval);
    };
  }, [isOpen]);

  if (!isOpen) return null;

  const getStepStatus = (step: LoadingStep) => {
    const steps: LoadingStep[] = ['switching', 'loading', 'preparing', 'complete'];
    const currentIndex = steps.indexOf(currentStep);
    const stepIndex = steps.indexOf(step);
    if (stepIndex < currentIndex) return 'complete';
    if (stepIndex === currentIndex) return 'active';
    return 'pending';
  };

  const initials = targetName
    .split(' ')
    .map(n => n.charAt(0))
    .join('')
    .toUpperCase()
    .slice(0, 2);

  const renderStepIcon = (step: LoadingStep, defaultIcon: React.ReactNode) => {
    const status = getStepStatus(step);
    if (status === 'complete') return <CheckCircle className="w-6 h-6 text-green-400" />;
    if (status === 'active') return <Loader2 className="w-6 h-6 text-amber-400 animate-spin" />;
    return defaultIcon;
  };

  const stepCircleClass = (step: LoadingStep) => {
    const status = getStepStatus(step);
    if (status === 'complete') return 'bg-green-500/20 border-2 border-green-500';
    if (status === 'active') return 'bg-amber-500/20 border-2 border-amber-500';
    return 'bg-slate-700/50 border-2 border-slate-600';
  };

  const stepTitleClass = (step: LoadingStep) => {
    const status = getStepStatus(step);
    return status === 'active' ? 'text-white' : 'text-slate-400';
  };

  return createPortal(
    <div className="fixed inset-0 z-[9999] flex items-center justify-center bg-slate-900/95 backdrop-blur-md">
      <div className="max-w-2xl w-full mx-4">
        <div className="text-center mb-8">
          <div className="inline-flex items-center justify-center w-24 h-24 rounded-full bg-gradient-to-br from-amber-500 to-orange-600 mb-6 relative shadow-2xl shadow-amber-500/30">
            {targetAvatarUrl ? (
              <img
                src={targetAvatarUrl}
                alt={targetName}
                className="w-20 h-20 rounded-full object-cover ring-4 ring-white/20"
              />
            ) : (
              <span className="text-3xl font-bold text-white">{initials}</span>
            )}
            <div className="absolute inset-0 rounded-full bg-amber-500/30 animate-ping" />
            <div className="absolute -bottom-1 -right-1 w-8 h-8 rounded-full bg-gradient-to-br from-amber-400 to-orange-500 flex items-center justify-center ring-4 ring-slate-900">
              <Eye className="w-4 h-4 text-white" />
            </div>
          </div>
          <h2 className="text-3xl font-bold text-white mb-3">
            Switching to {targetName}
          </h2>
          <p className="text-slate-400 text-lg">
            {targetClubName
              ? `Loading ${targetName}'s dashboard at ${targetClubName}`
              : `Loading ${targetName}'s member experience`}
          </p>
        </div>

        <div className="bg-slate-800/50 backdrop-blur-sm rounded-2xl border border-slate-700/50 p-8 shadow-2xl">
          <div className="space-y-6">
            <div className="flex items-center gap-4">
              <div className={`w-12 h-12 rounded-full flex items-center justify-center flex-shrink-0 transition-all duration-500 ${stepCircleClass('switching')}`}>
                {renderStepIcon('switching', <User className="w-6 h-6 text-slate-400" />)}
              </div>
              <div className="flex-1">
                <h3 className={`font-semibold mb-1 transition-colors ${stepTitleClass('switching')}`}>
                  Switching Member Profile
                </h3>
                <p className="text-sm text-slate-500">
                  Loading {targetName}'s account and preferences
                </p>
              </div>
            </div>

            <div className="flex items-center gap-4">
              <div className={`w-12 h-12 rounded-full flex items-center justify-center flex-shrink-0 transition-all duration-500 ${stepCircleClass('loading')}`}>
                {renderStepIcon('loading', <Shield className="w-6 h-6 text-slate-400" />)}
              </div>
              <div className="flex-1">
                <h3 className={`font-semibold mb-1 transition-colors ${stepTitleClass('loading')}`}>
                  Loading Club Data
                </h3>
                <p className="text-sm text-slate-500">
                  Fetching membership details and club information
                </p>
              </div>
            </div>

            <div className="flex items-center gap-4">
              <div className={`w-12 h-12 rounded-full flex items-center justify-center flex-shrink-0 transition-all duration-500 ${stepCircleClass('preparing')}`}>
                {renderStepIcon('preparing', <LayoutDashboard className="w-6 h-6 text-slate-400" />)}
              </div>
              <div className="flex-1">
                <h3 className={`font-semibold mb-1 transition-colors ${stepTitleClass('preparing')}`}>
                  Preparing Dashboard
                </h3>
                <p className="text-sm text-slate-500">
                  Setting up the member's personalised view
                </p>
              </div>
            </div>
          </div>

          <div className="mt-8">
            <div className="relative h-3 bg-slate-700/50 rounded-full overflow-hidden">
              <div
                className="absolute inset-y-0 left-0 bg-gradient-to-r from-amber-500 via-orange-500 to-green-500 transition-all duration-300 ease-out rounded-full"
                style={{ width: `${progress}%` }}
              >
                <div className="absolute inset-0 bg-white/20 animate-pulse" />
              </div>
            </div>
            <div className="flex justify-between items-center mt-3">
              <span className="text-sm text-slate-400">{Math.round(progress)}% Complete</span>
              <span className="text-sm text-slate-400 flex items-center gap-1.5">
                <Eye className="w-4 h-4 text-amber-400" />
                Admin View Mode
              </span>
            </div>
          </div>
        </div>
      </div>
    </div>,
    document.body
  );
};
