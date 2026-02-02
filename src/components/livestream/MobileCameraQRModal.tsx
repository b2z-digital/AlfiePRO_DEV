import React, { useEffect, useRef, useState } from 'react';
import { X, Smartphone, Camera, CheckCircle } from 'lucide-react';
import QRCode from 'qrcode';
import { livestreamStorage } from '../../utils/livestreamStorage';

interface MobileCameraQRModalProps {
  sessionId: string;
  streamTitle: string;
  onClose: () => void;
}

export function MobileCameraQRModal({
  sessionId,
  streamTitle,
  onClose
}: MobileCameraQRModalProps) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const [cameraConnected, setCameraConnected] = useState(false);

  useEffect(() => {
    if (canvasRef.current) {
      // Generate URL for mobile streaming page
      const mobileUrl = `${window.location.origin}/mobile-stream/${sessionId}`;

      // Generate QR code
      QRCode.toCanvas(canvasRef.current, mobileUrl, {
        width: 256,
        margin: 2,
        color: {
          dark: '#1e293b',
          light: '#f8fafc'
        }
      }).catch(err => {
        console.error('Error generating QR code:', err);
      });
    }
  }, [sessionId]);

  // Subscribe to camera changes
  useEffect(() => {
    const subscription = livestreamStorage.subscribeToSessionCameras(
      sessionId,
      (cameras) => {
        // Check if any mobile cameras are connected
        const hasConnectedMobileCamera = cameras.some(
          cam => cam.camera_type === 'mobile' && cam.status === 'connected'
        );

        if (hasConnectedMobileCamera && !cameraConnected) {
          setCameraConnected(true);
          // Auto-close after showing success message
          setTimeout(() => {
            onClose();
          }, 2000);
        }
      }
    );

    return () => {
      subscription.unsubscribe();
    };
  }, [sessionId, cameraConnected, onClose]);

  const mobileUrl = `${window.location.origin}/mobile-stream/${sessionId}`;

  return (
    <div className="fixed inset-0 bg-black/50 backdrop-blur-sm flex items-center justify-center z-50 p-4">
      <div className="bg-slate-900 rounded-lg border border-slate-700 w-full max-w-md">
        {/* Header */}
        <div className="flex items-center justify-between p-6 border-b border-slate-700">
          <div className="flex items-center gap-3">
            <Smartphone className="w-6 h-6 text-blue-500" />
            <div>
              <h2 className="text-xl font-bold text-white">Mobile Camera</h2>
              <p className="text-sm text-slate-400">Stream from your phone</p>
            </div>
          </div>
          <button
            onClick={onClose}
            className="text-slate-400 hover:text-white transition-colors"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Content */}
        <div className="p-6 space-y-6">
          {/* Success Message */}
          {cameraConnected && (
            <div className="bg-green-900/20 border border-green-700/50 rounded-lg p-4">
              <div className="flex items-center gap-3">
                <CheckCircle className="w-6 h-6 text-green-400" />
                <div>
                  <p className="text-sm font-medium text-green-300">Camera Connected!</p>
                  <p className="text-xs text-green-200/80 mt-1">
                    Your mobile camera is now active
                  </p>
                </div>
              </div>
            </div>
          )}

          {/* QR Code */}
          {!cameraConnected && (
            <div className="bg-white rounded-lg p-6 flex items-center justify-center">
              <canvas ref={canvasRef} />
            </div>
          )}

          {/* Instructions */}
          <div className="space-y-3">
            <div className="flex items-start gap-3">
              <div className="w-6 h-6 bg-blue-600 rounded-full flex items-center justify-center text-white font-semibold text-xs flex-shrink-0">
                1
              </div>
              <p className="text-sm text-slate-300">
                Open your phone's camera app
              </p>
            </div>
            <div className="flex items-start gap-3">
              <div className="w-6 h-6 bg-blue-600 rounded-full flex items-center justify-center text-white font-semibold text-xs flex-shrink-0">
                2
              </div>
              <p className="text-sm text-slate-300">
                Point it at the QR code above
              </p>
            </div>
            <div className="flex items-start gap-3">
              <div className="w-6 h-6 bg-blue-600 rounded-full flex items-center justify-center text-white font-semibold text-xs flex-shrink-0">
                3
              </div>
              <p className="text-sm text-slate-300">
                Tap the notification to open the mobile streaming page
              </p>
            </div>
            <div className="flex items-start gap-3">
              <div className="w-6 h-6 bg-blue-600 rounded-full flex items-center justify-center text-white font-semibold text-xs flex-shrink-0">
                4
              </div>
              <p className="text-sm text-slate-300">
                Grant camera permission and start streaming
              </p>
            </div>
          </div>

          {/* Manual URL */}
          <div className="bg-slate-800 rounded-lg p-4">
            <p className="text-xs text-slate-400 mb-2">Or copy this link:</p>
            <div className="flex items-center gap-2">
              <input
                type="text"
                value={mobileUrl}
                readOnly
                className="flex-1 px-3 py-2 bg-slate-900 border border-slate-700 rounded text-xs text-slate-300"
              />
              <button
                onClick={async () => {
                  try {
                    await navigator.clipboard.writeText(mobileUrl);
                    // Show success feedback with button text change
                    const btn = document.activeElement as HTMLButtonElement;
                    const originalText = btn.textContent;
                    btn.textContent = 'Copied!';
                    setTimeout(() => {
                      btn.textContent = originalText;
                    }, 2000);
                  } catch (err) {
                    console.error('Failed to copy:', err);
                  }
                }}
                className="px-3 py-2 bg-blue-600 hover:bg-blue-700 text-white rounded text-xs font-medium transition-colors"
              >
                Copy
              </button>
            </div>
          </div>

          {/* Info */}
          <div className="bg-blue-900/20 border border-blue-700/50 rounded-lg p-4">
            <div className="flex items-start gap-3">
              <Camera className="w-5 h-5 text-blue-400 flex-shrink-0 mt-0.5" />
              <div>
                <p className="text-sm font-medium text-blue-300">Mobile Streaming</p>
                <p className="text-xs text-blue-200/80 mt-1">
                  Your phone's camera will be used to stream directly to this session.
                  Make sure you're on a stable WiFi or mobile data connection.
                </p>
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
