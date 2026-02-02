import React, { useEffect, useState } from 'react';
import { Globe, CheckCircle, Loader2, AlertCircle, Shield, Server, Clock } from 'lucide-react';

interface PublishingPreloaderModalProps {
  isOpen: boolean;
  domain: string;
  isCustomDomain: boolean;
  onComplete: () => void;
}

type PublishingStep = 'dns' | 'propagation' | 'ssl' | 'complete' | 'error';

export const PublishingPreloaderModal: React.FC<PublishingPreloaderModalProps> = ({
  isOpen,
  domain,
  isCustomDomain,
  onComplete
}) => {
  const [currentStep, setCurrentStep] = useState<PublishingStep>('dns');
  const [progress, setProgress] = useState(0);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);

  useEffect(() => {
    if (!isOpen) return;

    setCurrentStep('dns');
    setProgress(0);
    setErrorMessage(null);

    const steps = [
      { step: 'dns', duration: 2000, progress: 33 },
      { step: 'propagation', duration: 3000, progress: 66 },
      { step: 'ssl', duration: 2000, progress: 100 },
      { step: 'complete', duration: 1000, progress: 100 }
    ];

    let currentIndex = 0;
    let progressInterval: NodeJS.Timeout;

    const runNextStep = () => {
      if (currentIndex >= steps.length) {
        setTimeout(() => {
          onComplete();
        }, 1500);
        return;
      }

      const { step, duration, progress: targetProgress } = steps[currentIndex];
      setCurrentStep(step as PublishingStep);

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

  const getStepStatus = (step: PublishingStep) => {
    const steps: PublishingStep[] = ['dns', 'propagation', 'ssl', 'complete'];
    const currentIndex = steps.indexOf(currentStep);
    const stepIndex = steps.indexOf(step);

    if (currentStep === 'error') return 'error';
    if (stepIndex < currentIndex) return 'complete';
    if (stepIndex === currentIndex) return 'active';
    return 'pending';
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/95 backdrop-blur-md">
      <div className="max-w-2xl w-full mx-4">
        <div className="text-center mb-8">
          <div className="inline-flex items-center justify-center w-20 h-20 rounded-full bg-gradient-to-br from-blue-500 to-purple-600 mb-6 relative">
            <Globe className="w-10 h-10 text-white" />
            <div className="absolute inset-0 rounded-full bg-blue-500/30 animate-ping" />
          </div>
          <h2 className="text-3xl font-bold text-white mb-3">
            {currentStep === 'complete' ? 'Website Published!' : 'Publishing Your Website'}
          </h2>
          <p className="text-slate-400 text-lg">
            {currentStep === 'complete'
              ? `Your website is now live at ${domain}`
              : 'Setting up your domain and configuring security...'}
          </p>
        </div>

        <div className="bg-slate-800/50 backdrop-blur-sm rounded-2xl border border-slate-700/50 p-8 shadow-2xl">
          <div className="space-y-6">
            <div className="flex items-center gap-4">
              <div className={`
                w-12 h-12 rounded-full flex items-center justify-center flex-shrink-0 transition-all duration-500
                ${getStepStatus('dns') === 'complete'
                  ? 'bg-green-500/20 border-2 border-green-500'
                  : getStepStatus('dns') === 'active'
                  ? 'bg-blue-500/20 border-2 border-blue-500'
                  : 'bg-slate-700/50 border-2 border-slate-600'}
              `}>
                {getStepStatus('dns') === 'complete' ? (
                  <CheckCircle className="w-6 h-6 text-green-400" />
                ) : getStepStatus('dns') === 'active' ? (
                  <Loader2 className="w-6 h-6 text-blue-400 animate-spin" />
                ) : (
                  <Server className="w-6 h-6 text-slate-400" />
                )}
              </div>
              <div className="flex-1">
                <h3 className={`font-semibold mb-1 transition-colors ${
                  getStepStatus('dns') === 'active' ? 'text-white' : 'text-slate-400'
                }`}>
                  Creating DNS Records
                </h3>
                <p className="text-sm text-slate-500">
                  {isCustomDomain
                    ? 'Setting up CNAME and A records for your custom domain'
                    : 'Configuring subdomain DNS records in Cloudflare'}
                </p>
              </div>
            </div>

            <div className="flex items-center gap-4">
              <div className={`
                w-12 h-12 rounded-full flex items-center justify-center flex-shrink-0 transition-all duration-500
                ${getStepStatus('propagation') === 'complete'
                  ? 'bg-green-500/20 border-2 border-green-500'
                  : getStepStatus('propagation') === 'active'
                  ? 'bg-blue-500/20 border-2 border-blue-500'
                  : 'bg-slate-700/50 border-2 border-slate-600'}
              `}>
                {getStepStatus('propagation') === 'complete' ? (
                  <CheckCircle className="w-6 h-6 text-green-400" />
                ) : getStepStatus('propagation') === 'active' ? (
                  <Loader2 className="w-6 h-6 text-blue-400 animate-spin" />
                ) : (
                  <Clock className="w-6 h-6 text-slate-400" />
                )}
              </div>
              <div className="flex-1">
                <h3 className={`font-semibold mb-1 transition-colors ${
                  getStepStatus('propagation') === 'active' ? 'text-white' : 'text-slate-400'
                }`}>
                  DNS Propagation
                </h3>
                <p className="text-sm text-slate-500">
                  {isCustomDomain
                    ? 'Waiting for DNS changes to propagate (typically 5-30 minutes)'
                    : 'Verifying DNS propagation across global nameservers'}
                </p>
              </div>
            </div>

            <div className="flex items-center gap-4">
              <div className={`
                w-12 h-12 rounded-full flex items-center justify-center flex-shrink-0 transition-all duration-500
                ${getStepStatus('ssl') === 'complete'
                  ? 'bg-green-500/20 border-2 border-green-500'
                  : getStepStatus('ssl') === 'active'
                  ? 'bg-blue-500/20 border-2 border-blue-500'
                  : 'bg-slate-700/50 border-2 border-slate-600'}
              `}>
                {getStepStatus('ssl') === 'complete' ? (
                  <CheckCircle className="w-6 h-6 text-green-400" />
                ) : getStepStatus('ssl') === 'active' ? (
                  <Loader2 className="w-6 h-6 text-blue-400 animate-spin" />
                ) : (
                  <Shield className="w-6 h-6 text-slate-400" />
                )}
              </div>
              <div className="flex-1">
                <h3 className={`font-semibold mb-1 transition-colors ${
                  getStepStatus('ssl') === 'active' ? 'text-white' : 'text-slate-400'
                }`}>
                  SSL Certificate Provisioning
                </h3>
                <p className="text-sm text-slate-500">
                  Installing secure HTTPS certificate via AWS Certificate Manager
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
                  Ready to visit
                </span>
              ) : (
                <span className="text-sm text-slate-400">Please wait...</span>
              )}
            </div>
          </div>

          {isCustomDomain && currentStep !== 'complete' && (
            <div className="mt-6 p-4 rounded-lg bg-blue-500/10 border border-blue-500/20">
              <div className="flex items-start gap-3">
                <AlertCircle className="w-5 h-5 text-blue-400 flex-shrink-0 mt-0.5" />
                <div className="text-sm">
                  <p className="text-blue-300 font-medium mb-1">Custom Domain Setup</p>
                  <p className="text-blue-200/80">
                    DNS propagation can take anywhere from a few minutes to 48 hours depending on your domain registrar.
                    Your website will become accessible once propagation is complete.
                  </p>
                </div>
              </div>
            </div>
          )}

          {errorMessage && (
            <div className="mt-6 p-4 rounded-lg bg-red-500/10 border border-red-500/20">
              <div className="flex items-start gap-3">
                <AlertCircle className="w-5 h-5 text-red-400 flex-shrink-0 mt-0.5" />
                <div className="text-sm">
                  <p className="text-red-300 font-medium mb-1">Publishing Failed</p>
                  <p className="text-red-200/80">{errorMessage}</p>
                </div>
              </div>
            </div>
          )}
        </div>

        {currentStep === 'complete' && (
          <div className="text-center mt-6">
            <p className="text-slate-400 text-sm">
              You can now visit your website at{' '}
              <a
                href={`https://${domain}`}
                target="_blank"
                rel="noopener noreferrer"
                className="text-blue-400 hover:text-blue-300 underline"
              >
                {domain}
              </a>
            </p>
          </div>
        )}
      </div>
    </div>
  );
};
