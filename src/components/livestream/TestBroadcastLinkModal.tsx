import { useEffect, useRef, useState } from 'react';
import { X, FlaskConical, Copy, Check, ExternalLink } from 'lucide-react';
import QRCode from 'qrcode';

interface TestBroadcastLinkModalProps {
  sessionId: string;
  isLive: boolean;
  onClose: () => void;
}

/** Link and QR code for watching a test broadcast in AlfieTV on any signed-in device. */
export function TestBroadcastLinkModal({ sessionId, isLive, onClose }: TestBroadcastLinkModalProps) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const [copied, setCopied] = useState(false);
  const watchUrl = `${window.location.origin.replace(/^http:\/\//, 'https://')}/alfie-tv?watch=${sessionId}`;

  useEffect(() => {
    if (!canvasRef.current) return;
    QRCode.toCanvas(canvasRef.current, watchUrl, {
      width: 220,
      margin: 2,
      color: { dark: '#1e293b', light: '#f8fafc' },
    }).catch(err => console.error('Error generating QR code:', err));
  }, [watchUrl]);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') onClose(); };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [onClose]);

  const copy = async () => {
    try {
      await navigator.clipboard.writeText(watchUrl);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch {
      /* clipboard can be blocked; the link is still shown */
    }
  };

  return (
    <div className="fixed inset-0 bg-black/50 backdrop-blur-sm flex items-center justify-center z-50 p-4" onClick={onClose}>
      <div
        role="dialog"
        aria-modal="true"
        aria-labelledby="test-broadcast-title"
        className="bg-slate-900 rounded-xl border border-slate-700 w-full max-w-md"
        onClick={e => e.stopPropagation()}
      >
        <div className="flex items-center justify-between p-5 border-b border-slate-700">
          <div className="flex items-center gap-3">
            <FlaskConical className="w-5 h-5 text-amber-400" />
            <div>
              <h2 id="test-broadcast-title" className="text-lg font-bold text-white">Watch this test</h2>
              <p className="text-xs text-slate-400">Only people with this link can see it</p>
            </div>
          </div>
          <button type="button" onClick={onClose} aria-label="Close" className="text-slate-400 hover:text-white transition-colors">
            <X className="w-5 h-5" />
          </button>
        </div>

        <div className="p-5 space-y-4">
          <div className="bg-white rounded-lg p-4 flex items-center justify-center">
            <canvas ref={canvasRef} />
          </div>

          <p className="text-sm text-slate-300">
            Scan with a phone signed in to Alfie, or open the link on another device.
            {isLive
              ? ' The broadcast opens straight away.'
              : ' It opens by itself as soon as you press Go live.'}
          </p>

          <div className="flex items-center gap-2">
            <input
              readOnly
              value={watchUrl}
              aria-label="Test broadcast link"
              onFocus={e => e.currentTarget.select()}
              className="flex-1 min-w-0 px-3 py-2 bg-slate-800 border border-slate-700 rounded-lg text-xs text-slate-300 font-mono"
            />
            <button type="button" onClick={copy} className="px-3 py-2 bg-slate-700 hover:bg-slate-600 text-white rounded-lg text-xs font-semibold flex items-center gap-1.5">
              {copied ? <Check className="w-3.5 h-3.5" /> : <Copy className="w-3.5 h-3.5" />}
              {copied ? 'Copied' : 'Copy'}
            </button>
          </div>

          <a
            href={watchUrl}
            target="_blank"
            rel="noopener noreferrer"
            className="w-full px-4 py-2.5 bg-amber-500 hover:bg-amber-400 text-slate-900 rounded-lg text-sm font-bold flex items-center justify-center gap-2"
          >
            <ExternalLink className="w-4 h-4" />
            Open in AlfieTV
          </a>

          <ul className="text-xs text-slate-400 space-y-1 list-disc pl-4">
            <li>Not listed in AlfieTV, and club members aren't notified.</li>
            <li>Race videos go to YouTube as unlisted, outside the event playlist.</li>
            <li>Turn test mode off before your real broadcast.</li>
          </ul>
        </div>
      </div>
    </div>
  );
}
